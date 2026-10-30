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
        assertThat(settings.get("timeZoneSource").asString()).as("V4 marks an untouched UTC zone as the default").isEqualTo("DEFAULT");
        assertThat(settings.get("notifyOn").asString()).isEqualTo("EVERY");
        assertThat(settings.get("notifyDocuments").asBoolean()).isTrue();
        assertThat(settings.get("quietHoursEnabled").asBoolean()).isFalse();
        assertThat(settings.get("quietHoursStart").asString()).isEqualTo("22:00");
        assertThat(settings.get("quietHoursEnd").asString()).isEqualTo("07:00");
        assertThat(settings.get("docReadSeconds").asInt()).isEqualTo(30);
    }

    @Test
    @SuppressWarnings("unchecked")
    void updatesAreValidatedAndApplied() {
        JsonNode original = http.get(api("/api/settings"), asOwner()).json();
        Map<String, Object> changed = TestHttp.JSON.convertValue(original, Map.class);
        try {
            for (Map.Entry<String, Object> invalid : Map.<String, Object>of(
                    "selfViewWindowSeconds", 2, "followUpHours", 36, "timeZone", "Mars/Olympus", "retentionDays", 1, "sendMode", "LATER",
                    "quietHoursStart", "24:00", "docReadSeconds", 5, "notifyOn", "SOMETIMES", "timeZoneSource", "BROWSER").entrySet()) {
                Map<String, Object> body = new java.util.HashMap<>(changed);
                body.put(invalid.getKey(), invalid.getValue());
                assertThat(http.put(api("/api/settings"), body, asOwner()).status()).as(invalid.getKey()).isEqualTo(400);
            }
            Map<String, Object> sameQuietHours = new java.util.HashMap<>(changed);
            sameQuietHours.put("quietHoursEnd", sameQuietHours.get("quietHoursStart"));
            assertThat(http.put(api("/api/settings"), sameQuietHours, asOwner()).status()).isEqualTo(400);
            String versionBefore = http.get(api("/api/config"), asExtension()).json().get("configVersion").asString();
            changed.put("timeZone", "Asia/Karachi");
            changed.put("timeZoneSource", "AUTO");
            changed.put("notifyOn", "EVERY_AFTER_GAP");
            changed.put("quietHoursEnabled", true);
            changed.put("quietHoursStart", "23:30");
            changed.put("docReadSeconds", 45);
            changed.put("followUpHours", 72);
            changed.put("sendMode", "CANCEL_RESEND");
            changed.put("dnrBlocking", false);
            assertThat(http.put(api("/api/settings"), changed, asOwner()).status()).isEqualTo(200);
            JsonNode saved = http.get(api("/api/settings"), asOwner()).json();
            assertThat(saved.get("timeZone").asString()).isEqualTo("Asia/Karachi");
            assertThat(saved.get("followUpHours").asInt()).isEqualTo(72);
            assertThat(saved.get("sendMode").asString()).isEqualTo("CANCEL_RESEND");
            assertThat(saved.get("dnrBlocking").asBoolean()).isFalse();
            assertThat(saved.get("timeZoneSource").asString()).isEqualTo("AUTO");
            assertThat(saved.get("docReadSeconds").asInt()).isEqualTo(45);
            JsonNode config = http.get(api("/api/config"), asExtension()).json();
            assertThat(config.get("sendMode").asString()).isEqualTo("CANCEL_RESEND");
            assertThat(config.get("notifyOn").asString()).isEqualTo("EVERY_AFTER_GAP");
            assertThat(config.get("quietHoursEnabled").asBoolean()).isTrue();
            assertThat(config.get("quietHoursStart").asString()).isEqualTo("23:30");
            assertThat(config.get("timeZone").asString()).isEqualTo("Asia/Karachi");
            assertThat(config.get("configVersion").asString()).isNotEqualTo(versionBefore);
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
        assertThat(config.get("notifyDocuments").asBoolean()).isTrue();
        assertThat(config.get("quietHoursEnd").asString()).isEqualTo("07:00");
        assertThat(config.get("configVersion").asString()).matches("[0-9a-f]{16}")
                .isEqualTo(http.get(api("/api/config"), asExtension()).json().get("configVersion").asString())
                .isEqualTo(http.get(api("/api/activity?limit=1"), asExtension()).json().get("configVersion").asString());
    }
}
