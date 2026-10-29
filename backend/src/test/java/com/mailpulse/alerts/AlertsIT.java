package com.mailpulse.alerts;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestHttp;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/**
 * Alerts end to end, driven by the test clock. Runs in its own context and database because it moves
 * the clock by days, which would expire the shared tests' sessions.
 */
@TestPropertySource(properties = "test.context=alerts")
class AlertsIT extends IntegrationTest {

    private static final String IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
    private static final String OUTLOOK_UA = "Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.18129; Pro)";
    private static final String TABLET_UA = "Mozilla/5.0 (Linux; Android 15; Pixel Tablet) AppleWebKit/537.36 Chrome/141.0 Safari/537.36";

    @Autowired
    AlertService alerts;

    @Test
    void followUpFiresOnceAfterTheWaitingTimeWithPerEmailHours() {
        TrackedEmail regular = sentEmail(uniqueAccount(), "No answer yet", "f" + System.nanoTime(), "a@example.com");
        TrackedEmail quick = sentEmail(uniqueAccount(), "Quick question", "g" + System.nanoTime(), "b@example.com");
        assertThat(http.patch(api("/api/emails/" + quick.id() + "/preferences"), Map.of("followUpHours", 24), asExtension()).status())
                .isEqualTo(204);
        long before = lastActivityId();

        clock.advance(Duration.ofHours(25));
        alerts.runScheduled();
        assertThat(alertTypes(quick.id())).containsExactly("FOLLOW_UP");
        assertThat(alertTypes(regular.id())).isEmpty();

        clock.advance(Duration.ofHours(24));
        alerts.runScheduled();
        alerts.runScheduled();
        assertThat(alertTypes(regular.id())).containsExactly("FOLLOW_UP");
        assertThat(alertTypes(quick.id())).containsExactly("FOLLOW_UP");

        JsonNode item = alertActivity(before, quick.id());
        assertThat(item.get("alertType").asString()).isEqualTo("FOLLOW_UP");
        assertThat(item.get("alertText").asString()).isEqualTo("Not opened 24 hours after sending");
        assertThat(item.get("subject").asString()).isEqualTo("Quick question");
        assertThat(item.get("shouldNotify").asBoolean()).isTrue();
    }

    @Test
    void openSpikeFiresOnceWithinTheWindow() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Pricing", "s" + System.nanoTime(), "c@example.com");
        long before = lastActivityId();
        clock.advance(Duration.ofSeconds(20));
        for (String agent : List.of(BROWSER_UA, IPHONE_UA, OUTLOOK_UA)) {
            openFrom(email, agent);
        }
        clock.advance(Duration.ofSeconds(31));
        finalizer.runOnce();
        assertThat(alertTypes(email.id())).containsExactly("OPEN_SPIKE");
        assertThat(alertActivity(before, email.id()).get("alertText").asString()).isEqualTo("Opened 3 times within 60 minutes");

        openFrom(email, TABLET_UA);
        clock.advance(Duration.ofSeconds(31));
        finalizer.runOnce();
        assertThat(alertTypes(email.id())).containsExactly("OPEN_SPIKE");
    }

    @Test
    void revivalAfterSevenSilentDays() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Old proposal", "r" + System.nanoTime(), "d@example.com");
        countOpen(email);
        clock.advance(Duration.ofDays(8));
        long before = lastActivityId();
        countOpen(email);
        assertThat(alertTypes(email.id())).contains("REVIVAL");
        assertThat(alertActivity(before, email.id()).get("alertText").asString()).isEqualTo("Opened again after 8 days without opens");
    }

    @Test
    void mutedEmailsStillGetAlertsButNoNotification() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Muted thread", "m" + System.nanoTime(), "e@example.com");
        assertThat(http.patch(api("/api/emails/" + email.id() + "/preferences"), Map.of("notifications", false), asExtension()).status())
                .isEqualTo(204);
        long before = lastActivityId();
        clock.advance(Duration.ofSeconds(20));
        for (String agent : List.of(BROWSER_UA, IPHONE_UA, OUTLOOK_UA)) {
            openFrom(email, agent);
        }
        clock.advance(Duration.ofSeconds(31));
        finalizer.runOnce();
        assertThat(alertActivity(before, email.id()).get("shouldNotify").asBoolean()).isFalse();
    }

    @Test
    void alertsCanBeSeenSnoozedAndDismissed() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Hot lead", "h" + System.nanoTime(), "f@example.com");
        clock.advance(Duration.ofSeconds(20));
        for (String agent : List.of(BROWSER_UA, IPHONE_UA, OUTLOOK_UA)) {
            openFrom(email, agent);
        }
        clock.advance(Duration.ofSeconds(31));
        finalizer.runOnce();
        String[] owner = freshOwnerCookie();
        String id = alertId(email.id());

        JsonNode page = http.get(api("/api/alerts"), owner).json();
        assertThat(page.get("newCount").asLong()).isPositive();
        assertThat(ids(page)).contains(id);
        JsonNode seen = http.patch(api("/api/alerts/" + id), Map.of("status", "SEEN"), owner).json();
        assertThat(seen.get("status").asString()).isEqualTo("SEEN");
        assertThat(seen.get("subject").asString()).isEqualTo("Hot lead");
        assertThat(http.patch(api("/api/alerts/" + id), Map.of("status", "SNOOZED"), owner).status()).isEqualTo(400);
        assertThat(http.patch(api("/api/alerts/" + id), Map.of("status", "SNOOZED", "snoozeHours", 1), owner).status()).isEqualTo(200);
        assertThat(ids(http.get(api("/api/alerts"), owner).json())).doesNotContain(id);

        long before = lastActivityId();
        clock.advance(Duration.ofMinutes(61));
        alerts.runScheduled();
        assertThat(ids(http.get(api("/api/alerts"), owner).json())).contains(id);
        assertThat(alertActivity(before, email.id()).get("alertType").asString()).isEqualTo("OPEN_SPIKE");

        assertThat(http.patch(api("/api/alerts/" + id), Map.of("status", "DISMISSED"), owner).status()).isEqualTo(200);
        assertThat(ids(http.get(api("/api/alerts"), owner).json())).doesNotContain(id);
        assertThat(ids(http.get(api("/api/alerts?status=all&size=100"), owner).json())).contains(id);
        assertThat(http.get(api("/api/alerts"), asExtension()).status()).isEqualTo(403);
        assertThat(http.get(api("/api/alerts?status=bogus"), owner).status()).isEqualTo(400);
        assertThat(http.patch(api("/api/alerts/" + UUID.randomUUID()), Map.of("status", "SEEN"), owner).status()).isEqualTo(404);
    }

    private void openFrom(TrackedEmail email, String agent) {
        long before = eventCount(email.id());
        assertThat(fetchPixel(email.token(), agent).status()).isEqualTo(200);
        await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == before + 1);
    }

    private List<String> alertTypes(UUID emailId) {
        return jdbc.sql("SELECT type FROM alert WHERE tracked_email_id = :id ORDER BY created_at").param("id", emailId)
                .query(String.class).list();
    }

    private String alertId(UUID emailId) {
        return jdbc.sql("SELECT id FROM alert WHERE tracked_email_id = :id").param("id", emailId).query(UUID.class).single().toString();
    }

    private long lastActivityId() {
        return http.get(api("/api/activity?limit=1"), asExtension()).json().get("lastId").asLong();
    }

    /** The newest ALERT activity item for an email after the cursor, read with the extension token. */
    private JsonNode alertActivity(long since, UUID emailId) {
        JsonNode found = null;
        for (JsonNode item : http.get(api("/api/activity?since=" + since + "&limit=100"), asExtension()).json().get("items")) {
            if (item.get("kind").asString().equals("ALERT") && item.get("emailId").asString().equals(emailId.toString())) {
                found = item;
            }
        }
        assertThat(found).as("alert activity for " + emailId).isNotNull();
        return found;
    }

    /** Sessions expire after 12 h of test clock, so this test signs in again when it needs the owner. */
    private String[] freshOwnerCookie() {
        TestHttp.Response login = http.post(api("/api/auth/login"), Map.of("password", PASSWORD));
        assertThat(login.status()).isEqualTo(204);
        return new String[] {"Cookie", "mp_session=" + login.cookie("mp_session")};
    }

    private static List<String> ids(JsonNode page) {
        List<String> ids = new ArrayList<>();
        page.get("items").forEach(item -> ids.add(item.get("id").asString()));
        return ids;
    }
}
