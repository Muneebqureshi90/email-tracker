package com.mailpulse.tracking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestHttp;
import com.mailpulse.support.TestPdfs;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/** Chrome on Android sends the phone model once MailPulse asks with Accept-CH; it is stored and shown (D-135). */
class DeviceModelIT extends IntegrationTest {

    private static final String MODEL = "Sec-CH-UA-Model";
    private static final String ANDROID_UA =
            "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

    @Test
    void clicksAskForTheModelAndTheEmailDetailShowsIt() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Which phone", "dm" + System.nanoTime(), "reader@example.com");
        List<String> tokens = linkTokens(email, "https://example.com/model", "https://example.com/plain", "https://example.com/long");
        clock.advance(Duration.ofSeconds(40));

        TestHttp.Response withModel = http.get(pub("/c/" + tokens.get(0)), "User-Agent", ANDROID_UA, MODEL, "\"SM-S911B\"");
        assertThat(withModel.status()).isEqualTo(302);
        assertThat(withModel.header("Accept-CH")).hasValue(MODEL);
        assertThat(withModel.header("Critical-CH")).as("a retry would record the click twice").isEmpty();

        clock.advance(Duration.ofSeconds(40));
        assertThat(http.get(pub("/c/" + tokens.get(1)), "User-Agent", BROWSER_UA).status()).isEqualTo(302);
        clock.advance(Duration.ofSeconds(40));
        assertThat(http.get(pub("/c/" + tokens.get(2)), "User-Agent", ANDROID_UA, MODEL, "\"" + "X".repeat(65) + "\"").status())
                .isEqualTo(302);
        await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == 3);

        assertThat(jdbc.sql("SELECT device_model FROM tracking_event WHERE tracked_email_id = :id ORDER BY received_at, id")
                .param("id", email.id()).query(String.class).list())
                .containsExactly("SM-S911B", null, null);

        TestHttp.Response detail = http.get(api("/api/emails/" + email.id()), asOwner());
        assertThat(detail.status()).as(detail.text()).isEqualTo(200);
        List<String> models = new ArrayList<>();
        detail.json().get("events").forEach(event -> models.add(text(event.get("deviceModel"))));
        assertThat(models).hasSize(3).containsOnlyOnce("SM-S911B").filteredOn(Objects::isNull).hasSize(2);
    }

    @Test
    void thePixelDoesNotAskForTheModel() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Pixel only", "dp" + System.nanoTime(), "reader@example.com");
        TestHttp.Response pixel = fetchPixel(email.token(), BROWSER_UA);
        assertThat(pixel.status()).isEqualTo(200);
        assertThat(pixel.header("Accept-CH")).isEmpty();
    }

    @Test
    void theDocumentViewerAsksForTheModelAndItsRequestsStoreIt() {
        String docId = uploadPdf("Model test.pdf", TestPdfs.pdf(1, "Model test")).get("id").asString();
        String token = linkToken(createLink(docId, Map.of("label", "Phone check"), asOwner()));

        TestHttp.Response page = http.get(pub("/d/" + token), reader(77));
        assertThat(page.status()).isEqualTo(200);
        assertThat(page.header("Accept-CH")).hasValue(MODEL);
        assertThat(page.header("Critical-CH")).isEmpty();

        // The viewer's first heartbeat records the view.
        assertThat(beat(token, UUID.randomUUID(), 0, List.of(1), 1, join(reader(77), MODEL, "\"Pixel 8 Pro\"")).status()).isEqualTo(204);
        await().atMost(Duration.ofSeconds(10)).until(() -> !models(token).isEmpty());
        assertThat(models(token)).contains("Pixel 8 Pro");
    }

    private List<String> linkTokens(TrackedEmail email, String... urls) {
        List<String> tokens = new ArrayList<>();
        http.post(api("/api/emails/" + email.id() + "/links"), Map.of("urls", List.of(urls)), asExtension()).json().get("links")
                .forEach(link -> {
                    String tracked = link.get("trackedUrl").asString();
                    tokens.add(tracked.substring(tracked.lastIndexOf('/') + 1));
                });
        return tokens;
    }

    private List<String> models(String token) {
        return jdbc.sql("""
                SELECT e.device_model FROM document_event e JOIN document_link l ON l.id = e.link_id
                WHERE l.token = :t AND e.device_model IS NOT NULL
                """).param("t", token).query(String.class).list();
    }

    private static String text(JsonNode node) {
        return node == null || node.isNull() ? null : node.asString();
    }
}
