package com.mailpulse.tracking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestHttp;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/** Tracked links: redirect to the stored URL, count real clicks, flag scanners (PLAN §4.4). */
class ClicksIT extends IntegrationTest {

    @Test
    void realClicksCountAndScannerClicksAreFlagged() {
        String thread = "k" + System.nanoTime();
        TrackedEmail email = sentEmail(uniqueAccount(), "Links inside", thread, "c@example.com");
        List<String> urls = List.of("https://example.com/a", "https://example.com/b", "https://example.com/c", "https://example.com/d");
        List<String> tokens = new ArrayList<>();
        http.post(api("/api/emails/" + email.id() + "/links"), Map.of("urls", urls), asExtension()).json().get("links")
                .forEach(link -> tokens.add(link.get("trackedUrl").asString().substring(link.get("trackedUrl").asString().lastIndexOf('/') + 1)));

        clock.advance(Duration.ofSeconds(12));
        assertThat(click(tokens.get(0)).header("Location")).contains("https://example.com/a");
        clock.advance(Duration.ofSeconds(28));
        click(tokens.get(1));
        click(tokens.get(2));
        click(tokens.get(3));
        clock.advance(Duration.ofSeconds(30));
        click(tokens.get(3));
        await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == 5);

        clock.advance(Duration.ofSeconds(31));
        finalizer.runOnce();
        List<String> reasons = jdbc.sql("""
                SELECT COALESCE(reason, verdict) FROM tracking_event WHERE tracked_email_id = :id ORDER BY received_at, id
                """).param("id", email.id()).query(String.class).list();
        assertThat(reasons).containsExactly("BOT_TIMING", "BOT_BURST", "BOT_BURST", "BOT_BURST", "COUNTED");

        JsonNode detail = http.get(api("/api/emails/" + email.id()), asOwner()).json();
        assertThat(detail.get("summary").get("clickCount").asInt()).isEqualTo(1);
        assertThat(detail.get("summary").get("openCount").asInt()).isZero();
        JsonNode marks = http.get(api("/api/marks?account=" + email.account() + "&threadIds=" + thread), asExtension()).json();
        assertThat(marks.get("marks").get(thread).get("state").asString()).as("a click alone means engaged (✓✓)").isEqualTo("OPENED");
    }

    @Test
    void ownClicksMarkedByTheExtensionDoNotCount() {
        TrackedEmail email = sentEmail(uniqueAccount(), "My own link", "o" + System.nanoTime(), "d@example.com");
        String tracked = http.post(api("/api/emails/" + email.id() + "/links"), Map.of("urls", List.of("https://example.com/own")), asExtension())
                .json().get("links").get(0).get("trackedUrl").asString();
        clock.advance(Duration.ofSeconds(40));
        TestHttp.Response response = http.get(pub("/c/" + tracked.substring(tracked.lastIndexOf('/') + 1)),
                "User-Agent", BROWSER_UA, "X-MailPulse-Self", "test-self-secret");
        assertThat(response.status()).isEqualTo(302);
        await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == 1);
        assertThat(jdbc.sql("SELECT reason FROM tracking_event WHERE tracked_email_id = :id").param("id", email.id())
                .query(String.class).single()).isEqualTo("SELF");
    }

    private TestHttp.Response click(String token) {
        TestHttp.Response response = http.get(pub("/c/" + token), "User-Agent", BROWSER_UA);
        assertThat(response.status()).isEqualTo(302);
        return response;
    }
}
