package com.mailpulse.tracking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.mailpulse.common.RandomTokens;
import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestHttp;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** The internet-facing surface: pixel, click redirect, and strict port separation. */
class TrackingEndpointsIT extends IntegrationTest {

    @Test
    void pixelIsA43ByteTransparentGifWithNoCacheHeaders() {
        TestHttp.Response response = fetchPixel(RandomTokens.trackingToken(), GMAIL_PROXY_UA);

        assertThat(response.status()).isEqualTo(200);
        assertThat(response.header("Content-Type")).hasValue("image/gif");
        assertThat(response.body()).hasSize(43);
        assertThat(new String(response.body(), 0, 6, StandardCharsets.US_ASCII)).isEqualTo("GIF89a");
        assertThat(response.header("Cache-Control").orElseThrow()).contains("no-store", "no-cache", "private", "max-age=0");
        assertThat(response.header("Pragma")).hasValue("no-cache");
        assertThat(response.header("Expires")).hasValue("0");
        assertThat(response.header("X-Content-Type-Options")).hasValue("nosniff");
        assertThat(response.header("Referrer-Policy")).hasValue("no-referrer");
        assertThat(response.header("Server")).isEmpty();
    }

    @Test
    void unknownAndMalformedTokensGetIdenticalResponsesAndNoDatabaseRows() {
        long before = jdbc.sql("SELECT count(*) FROM tracking_event").query(Long.class).single();
        TestHttp.Response unknown = fetchPixel(RandomTokens.trackingToken(), GMAIL_PROXY_UA);
        TestHttp.Response malformed = fetchPixel("short", GMAIL_PROXY_UA);
        TrackedEmail email = registerEmail(uniqueAccount());
        fetchPixel(email.token(), GMAIL_PROXY_UA);

        await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == 1);
        assertThat(unknown.status()).isEqualTo(malformed.status()).isEqualTo(200);
        assertThat(unknown.body()).isEqualTo(malformed.body()).isEqualTo(PublicTrackingController.PIXEL);
        assertThat(jdbc.sql("SELECT count(*) FROM tracking_event").query(Long.class).single()).isEqualTo(before + 1);
    }

    @Test
    void headRequestReturnsHeadersWithoutBody() {
        TestHttp.Response response = http.send("HEAD", pub("/t/" + RandomTokens.trackingToken() + ".gif"), null);
        assertThat(response.status()).isEqualTo(200);
        assertThat(response.header("Content-Length")).hasValue("43");
        assertThat(response.body()).isEmpty();
    }

    @Test
    void knownPixelIsSavedAsynchronouslyWithItsSource() {
        TrackedEmail email = registerEmail(uniqueAccount());
        fetchPixel(email.token(), GMAIL_PROXY_UA);

        await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == 1);
        Map<String, Object> row = jdbc.sql("SELECT source, verdict, http_method, user_agent FROM tracking_event WHERE tracked_email_id = :id")
                .param("id", email.id()).query().singleRow();
        assertThat(row).containsEntry("source", "GMAIL_PROXY").containsEntry("verdict", "PENDING").containsEntry("http_method", "GET");
        assertThat((String) row.get("user_agent")).contains("GoogleImageProxy");
    }

    @Test
    void publicPortAnswersNothingButTrackingRoutes() {
        for (String path : List.of("/api/auth/status", "/api/emails", "/actuator/health", "/", "/index.html", "/t/", "/c/")) {
            TestHttp.Response response = http.get(pub(path));
            assertThat(response.status()).as(path).isEqualTo(404);
            assertThat(response.body()).as(path).isEmpty();
        }
        assertThat(http.post(pub("/t/" + RandomTokens.trackingToken() + ".gif"), "{}").status()).isEqualTo(404);
        assertThat(http.post(pub("/api/auth/login"), Map.of("password", PASSWORD)).status()).isEqualTo(404);
    }

    @Test
    void privatePortNeverServesTrackingRoutes() {
        TrackedEmail email = registerEmail(uniqueAccount());
        assertThat(http.get(api("/t/" + email.token() + ".gif")).status()).isEqualTo(404);
        assertThat(http.get(api("/c/" + email.token())).status()).isEqualTo(404);
    }

    @Test
    void clickRedirectsOnlyToTheStoredUrl() {
        TrackedEmail email = registerEmail(uniqueAccount());
        String target = "https://example.com/report?id=42&lang=en";
        TestHttp.Response links = http.post(api("/api/emails/" + email.id() + "/links"), Map.of("urls", List.of(target)), asExtension());
        String tracked = links.json().get("links").get(0).get("trackedUrl").asString();
        String token = tracked.substring(tracked.lastIndexOf('/') + 1);

        TestHttp.Response response = http.get(pub("/c/" + token + "?url=https://evil.example/&next=https://evil.example/"),
                "User-Agent", BROWSER_UA);

        assertThat(response.status()).isEqualTo(302);
        assertThat(response.header("Location")).hasValue(target);
        assertThat(response.header("Referrer-Policy")).hasValue("no-referrer");
        assertThat(response.header("Cache-Control").orElseThrow()).contains("no-store");
    }

    @Test
    void unknownClickTokenIsAPlain404() {
        TestHttp.Response response = http.get(pub("/c/" + RandomTokens.trackingToken()));
        assertThat(response.status()).isEqualTo(404);
        assertThat(response.header("Content-Type").orElseThrow()).startsWith("text/plain");
        assertThat(response.text()).isEqualTo("Not found");
        assertThat(response.header("Location")).isEmpty();
    }
}
