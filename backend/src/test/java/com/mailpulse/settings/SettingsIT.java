package com.mailpulse.settings;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestHttp;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

class SettingsIT extends IntegrationTest {

    @Test
    void defaultsMatchTheApprovedPlan() {
        JsonNode settings = http.get(api("/api/settings"), asOwner()).json();
        assertThat(settings.get("trackingDefault").asBoolean()).isTrue();
        assertThat(settings.get("linkTrackingDefault").asBoolean()).isFalse();
        assertThat(settings.get("sendGraceSeconds").asInt()).isEqualTo(10);
        assertThat(settings.get("selfViewWindowSeconds").asInt()).isEqualTo(30);
        assertThat(settings.get("dedupeWindowSeconds").asInt()).isEqualTo(60);
        assertThat(settings.get("followUpHours").asInt()).isEqualTo(48);
        assertThat(settings.get("spikeOpens").asInt()).isEqualTo(3);
        assertThat(settings.get("spikeWindowMinutes").asInt()).isEqualTo(60);
        assertThat(settings.get("revivalDays").asInt()).isEqualTo(7);
        assertThat(settings.get("retentionDays").asInt()).isEqualTo(365);
        assertThat(settings.get("ipMode").asString()).isEqualTo("TRUNCATED");
        assertThat(settings.get("countApplePrefetch").asBoolean()).isFalse();
        assertThat(settings.get("sendMode").asString()).isEqualTo("PRESYNC");
        assertThat(settings.get("dnrBlocking").asBoolean()).isTrue();
        assertThat(settings.get("trackConfidential").asBoolean()).isTrue();
    }

    @Test
    @SuppressWarnings("unchecked")
    void updatesAreValidatedAndApplied() {
        JsonNode original = http.get(api("/api/settings"), asOwner()).json();
        Map<String, Object> changed = TestHttp.JSON.convertValue(original, Map.class);
        try {
            for (Map.Entry<String, Object> invalid : Map.<String, Object>of(
                    "selfViewWindowSeconds", 2, "followUpHours", 36, "timeZone", "Mars/Olympus", "retentionDays", 1, "sendMode", "LATER").entrySet()) {
                Map<String, Object> body = new java.util.HashMap<>(changed);
                body.put(invalid.getKey(), invalid.getValue());
                assertThat(http.put(api("/api/settings"), body, asOwner()).status()).as(invalid.getKey()).isEqualTo(400);
            }
            changed.put("timeZone", "Asia/Karachi");
            changed.put("followUpHours", 72);
            changed.put("sendMode", "CANCEL_RESEND");
            changed.put("dnrBlocking", false);
            assertThat(http.put(api("/api/settings"), changed, asOwner()).status()).isEqualTo(200);
            JsonNode saved = http.get(api("/api/settings"), asOwner()).json();
            assertThat(saved.get("timeZone").asString()).isEqualTo("Asia/Karachi");
            assertThat(saved.get("followUpHours").asInt()).isEqualTo(72);
            assertThat(saved.get("sendMode").asString()).isEqualTo("CANCEL_RESEND");
            assertThat(saved.get("dnrBlocking").asBoolean()).isFalse();
            assertThat(http.get(api("/api/config"), asExtension()).json().get("sendMode").asString()).isEqualTo("CANCEL_RESEND");
        } finally {
            assertThat(http.put(api("/api/settings"), original, asOwner()).status()).isEqualTo(200);
        }
    }

    @Test
    void extensionConfigExposesWhatTheExtensionNeeds() {
        JsonNode config = http.get(api("/api/config"), asExtension()).json();
        assertThat(config.get("publicBaseUrl").asString()).isEqualTo("https://track.test");
        assertThat(config.get("selfHeaderName").asString()).isEqualTo("X-MailPulse-Self");
        assertThat(config.get("selfHeaderValue").asString()).isEqualTo("test-self-secret");
        assertThat(config.get("linkTrackingDefault").asBoolean()).isFalse();
        assertThat(config.get("sendMode").asString()).isEqualTo("PRESYNC");
        assertThat(config.get("dnrBlocking").asBoolean()).isTrue();
        assertThat(config.get("trackConfidential").asBoolean()).isTrue();
        assertThat(config.get("selfViewWindowSeconds").asInt()).isEqualTo(30);
        assertThat(config.get("followUpHours").asInt()).isEqualTo(48);
    }
}
