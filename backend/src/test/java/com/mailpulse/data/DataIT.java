package com.mailpulse.data;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestHttp;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/** Runs in its own application context and database, because it deletes everything. */
@TestPropertySource(properties = "test.context=data")
class DataIT extends IntegrationTest {

    @Test
    void exportHoldsDecryptedDataAndDeleteAllKeepsAccountSettingsAndTokens() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Export me", "x" + System.nanoTime(), "Jane@Example.com");
        countOpen(email);

        TestHttp.Response export = http.get(api("/api/export"), asOwner());
        assertThat(export.status()).isEqualTo(200);
        assertThat(export.header("Content-Disposition").orElseThrow()).startsWith("attachment").contains("mailpulse-export-", ".json");
        JsonNode body = export.json();
        assertThat(body.get("format").asString()).isEqualTo("mailpulse-export-v1");
        assertThat(body.get("emails")).hasSize(1);
        JsonNode exported = body.get("emails").get(0);
        assertThat(exported.get("summary").get("subject").asString()).isEqualTo("Export me");
        assertThat(exported.get("summary").get("recipients").get(0).get("email").asString()).isEqualTo("jane@example.com");
        assertThat(exported.get("events").get(0).get("verdict").asString()).isEqualTo("COUNTED");
        assertThat(body.get("contacts").get(0).get("email").asString()).isEqualTo("jane@example.com");
        assertThat(body.get("settings").get("selfViewWindowSeconds").asInt()).isEqualTo(30);
        assertThat(http.get(api("/api/export"), asExtension()).status()).isEqualTo(403);

        String confirm = DataController.CONFIRMATION;
        assertThat(delete(Map.of("confirm", "delete everything", "password", PASSWORD)).status()).isEqualTo(400);
        assertThat(delete(Map.of("confirm", confirm, "password", "not the right password")).status()).isEqualTo(401);
        assertThat(http.send("DELETE", api("/api/data"), Map.of("confirm", confirm, "password", PASSWORD), asExtension()).status())
                .isEqualTo(403);
        assertThat(delete(Map.of("confirm", confirm, "password", PASSWORD)).status()).isEqualTo(204);

        assertThat(http.get(api("/api/emails"), asOwner()).json().get("total").asLong()).isZero();
        assertThat(http.get(api("/api/contacts"), asOwner()).json().get("total").asLong()).isZero();
        assertThat(http.get(api("/api/accounts"), asOwner()).json()).isEmpty();
        assertThat(http.get(api("/api/activity"), asOwner()).json().get("lastId").asLong()).isZero();
        assertThat(http.get(api("/api/settings"), asOwner()).status()).isEqualTo(200);
        assertThat(http.get(api("/api/config"), asExtension()).status()).isEqualTo(200);
        long rows = jdbc.sql("SELECT count(*) FROM tracking_event").query(Long.class).single();
        assertThat(rows).isZero();
        assertThat(fetchPixel(email.token(), GMAIL_PROXY_UA).status()).isEqualTo(200);
    }

    private TestHttp.Response delete(Map<String, Object> body) {
        return http.send("DELETE", api("/api/data"), body, asOwner());
    }
}
