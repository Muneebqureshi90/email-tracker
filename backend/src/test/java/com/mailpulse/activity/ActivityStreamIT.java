package com.mailpulse.activity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.mailpulse.auth.SessionService;
import com.mailpulse.support.IntegrationTest;
import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/** Live dashboard updates over Server-Sent Events, including replay after a reconnect. */
class ActivityStreamIT extends IntegrationTest {

    private final HttpClient client = HttpClient.newHttpClient();

    @Test
    void countedOpenIsPushedLiveAndReplayedOnReconnect() throws Exception {
        long before = http.get(api("/api/activity"), asOwner()).json().get("lastId").asLong();
        try (EventStream live = open(null)) {
            TrackedEmail email = sentEmail(uniqueAccount(), "Live " + UUID.randomUUID(), "live" + System.nanoTime(), "r@gmail.com");
            clock.advance(Duration.ofSeconds(20));
            fetchPixel(email.token(), GMAIL_PROXY_UA);
            await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == 1);
            clock.advance(Duration.ofSeconds(31));
            finalizer.runOnce();

            String pushed = live.dataFor(email.id());
            assertThat(live.lastEventName).isEqualTo("activity");
            assertThat(pushed).contains("\"kind\":\"OPEN\"").contains("GMAIL_PROXY");

            try (EventStream reconnect = open(before)) {
                assertThat(reconnect.dataFor(email.id())).contains("\"kind\":\"OPEN\"");
            }
        }
    }

    private EventStream open(Long lastEventId) throws IOException, InterruptedException {
        HttpRequest.Builder request = HttpRequest.newBuilder(api("/api/stream"))
                .header("Cookie", SessionService.COOKIE + "=" + ownerCookie())
                .header("Accept", "text/event-stream");
        if (lastEventId != null) {
            request.header("Last-Event-ID", Long.toString(lastEventId));
        }
        HttpResponse<java.util.stream.Stream<String>> response =
                client.send(request.build(), HttpResponse.BodyHandlers.ofLines());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Content-Type").orElseThrow()).startsWith("text/event-stream");
        return new EventStream(response);
    }

    /** Reads SSE lines on a background thread so the test can wait with a timeout. */
    private static final class EventStream implements AutoCloseable {

        private final BlockingQueue<String> lines = new LinkedBlockingQueue<>();
        private final HttpResponse<java.util.stream.Stream<String>> response;
        private final Thread reader;
        private String lastEventName;

        private EventStream(HttpResponse<java.util.stream.Stream<String>> response) {
            this.response = response;
            this.reader = Thread.ofVirtual().start(() -> {
                try {
                    response.body().forEach(lines::add);
                } catch (RuntimeException closed) {
                    // the test closed the stream
                }
            });
        }

        String dataFor(UUID emailId) throws InterruptedException {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
            while (System.nanoTime() < deadline) {
                String line = lines.poll(250, TimeUnit.MILLISECONDS);
                if (line == null) {
                    continue;
                }
                if (line.startsWith("event:")) {
                    lastEventName = line.substring("event:".length()).trim();
                } else if (line.startsWith("data:") && line.contains(emailId.toString())) {
                    return line;
                }
            }
            throw new AssertionError("No event for " + emailId + " within 10 s");
        }

        @Override
        public void close() {
            response.body().close();
            reader.interrupt();
        }
    }
}
