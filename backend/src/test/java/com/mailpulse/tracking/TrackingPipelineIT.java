package com.mailpulse.tracking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestHttp;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/** From pixel request to counted open: hold window, self-views, grace, duplicates, bots, drafts, clicks. */
class TrackingPipelineIT extends IntegrationTest {

    @Test
    void openIsHeldThenCountedAndBecomesActivity() {
        long lastActivity = http.get(api("/api/activity"), asExtension()).json().get("lastId").asLong();
        TrackedEmail email = sentEmail(uniqueAccount(), "Counted " + UUID.randomUUID(), "p" + System.nanoTime(), "r@gmail.com");
        clock.advance(Duration.ofSeconds(20));
        fetchPixelAndWait(email, GMAIL_PROXY_UA);

        clock.advance(Duration.ofSeconds(29));
        finalizer.runOnce();
        assertThat(verdicts(email.id())).containsExactly("PENDING");

        clock.advance(Duration.ofSeconds(2));
        finalizer.runOnce();
        assertThat(verdicts(email.id())).containsExactly("COUNTED");

        JsonNode detail = http.get(api("/api/emails/" + email.id()), asOwner()).json();
        assertThat(detail.get("summary").get("openCount").asInt()).isEqualTo(1);
        assertThat(detail.get("summary").get("firstOpenedAt").isNull()).isFalse();

        JsonNode items = http.get(api("/api/activity?since=" + lastActivity), asExtension()).json().get("items");
        JsonNode item = find(items, email.id());
        assertThat(item.get("kind").asString()).isEqualTo("OPEN");
        assertThat(item.get("source").asString()).isEqualTo("GMAIL_PROXY");
        assertThat(item.get("recipients").asString()).isEqualTo("r@gmail.com");
        assertThat(item.get("shouldNotify").asBoolean()).isTrue();
    }

    @Test
    void selfViewReportedAfterTheOpenStillWins() {
        TrackedEmail email = sentEmail(uniqueAccount(), "s", "s" + System.nanoTime(), "r@gmail.com");
        clock.advance(Duration.ofSeconds(20));
        fetchPixelAndWait(email, GMAIL_PROXY_UA);
        clock.advance(Duration.ofSeconds(5));
        reportSelfView(email.token());

        clock.advance(Duration.ofSeconds(31));
        finalizer.runOnce();
        assertThat(reasons(email.id())).containsExactly("SELF_VIEW");
    }

    @Test
    void selfViewReportedBeforeTheOpenWins() {
        TrackedEmail email = sentEmail(uniqueAccount(), "s", "b" + System.nanoTime(), "r@gmail.com");
        clock.advance(Duration.ofSeconds(20));
        reportSelfView(email.token());
        clock.advance(Duration.ofSeconds(3));
        fetchPixelAndWait(email, GMAIL_PROXY_UA);

        clock.advance(Duration.ofSeconds(31));
        finalizer.runOnce();
        assertThat(reasons(email.id())).containsExactly("SELF_VIEW");
    }

    @Test
    void openOutsideTheSelfViewWindowCounts() {
        TrackedEmail email = sentEmail(uniqueAccount(), "s", "o" + System.nanoTime(), "r@gmail.com");
        clock.advance(Duration.ofSeconds(20));
        reportSelfView(email.token());
        clock.advance(Duration.ofSeconds(45));
        fetchPixelAndWait(email, GMAIL_PROXY_UA);

        clock.advance(Duration.ofSeconds(31));
        finalizer.runOnce();
        assertThat(verdicts(email.id())).containsExactly("COUNTED");
    }

    @Test
    void opensInTheSendGracePeriodAreIgnored() {
        TrackedEmail email = sentEmail(uniqueAccount(), "g", "g" + System.nanoTime(), "r@gmail.com");
        clock.advance(Duration.ofSeconds(3));
        fetchPixelAndWait(email, GMAIL_PROXY_UA);

        clock.advance(Duration.ofSeconds(31));
        finalizer.runOnce();
        assertThat(reasons(email.id())).containsExactly("SEND_GRACE");
    }

    @Test
    void repeatOpensFromTheSameSourceWithinAMinuteCountOnce() {
        TrackedEmail email = sentEmail(uniqueAccount(), "d", "d" + System.nanoTime(), "r@gmail.com");
        clock.advance(Duration.ofSeconds(20));
        fetchPixelAndWait(email, GMAIL_PROXY_UA);
        clock.advance(Duration.ofSeconds(10));
        fetchPixel(email.token(), GMAIL_PROXY_UA);
        await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == 2);

        clock.advance(Duration.ofSeconds(31));
        finalizer.runOnce();
        assertThat(jdbc.sql("SELECT coalesce(reason, verdict) FROM tracking_event WHERE tracked_email_id = :id ORDER BY received_at")
                .param("id", email.id()).query(String.class).list()).containsExactly("COUNTED", "DUPLICATE");
    }

    @Test
    void obviousNonHumanRequestsAreIgnoredOnArrival() {
        TrackedEmail email = sentEmail(uniqueAccount(), "b", "x" + System.nanoTime(), "r@gmail.com");
        clock.advance(Duration.ofSeconds(20));
        http.send("HEAD", pub("/t/" + email.token() + ".gif"), null, "User-Agent", GMAIL_PROXY_UA);
        fetchPixel(email.token(), "curl/8.9.0");
        fetchPixel(email.token(), "Mozilla/5.0");
        fetchPixel(email.token(), BROWSER_UA, "X-MailPulse-Self", "test-self-secret");
        fetchPixel(email.token(), BROWSER_UA, "X-MailPulse-Self", "wrong-secret");
        await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == 5);

        assertThat(jdbc.sql("SELECT coalesce(reason, verdict) FROM tracking_event WHERE tracked_email_id = :id")
                .param("id", email.id()).query(String.class).list())
                .containsExactlyInAnyOrder("BOT_HEAD", "BOT_UA", "PREFETCH", "SELF", "PENDING");
    }

    @Test
    void draftsCountOnlyThroughAMailProxyAndAreThenMarkedSent() {
        TrackedEmail email = registerEmail(uniqueAccount());
        fetchPixelAndWait(email, BROWSER_UA);
        clock.advance(Duration.ofSeconds(31));
        finalizer.runOnce();
        assertThat(reasons(email.id())).containsExactly("BEFORE_SEND");

        fetchPixel(email.token(), GMAIL_PROXY_UA);
        await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == 2);
        clock.advance(Duration.ofSeconds(31));
        finalizer.runOnce();
        JsonNode lookup = http.get(api("/api/emails/by-token/" + email.token()), asExtension()).json();
        assertThat(lookup.get("status").asString()).isEqualTo("SENT");
    }

    @Test
    void stoppedTrackingIgnoresNewEvents() {
        TrackedEmail email = sentEmail(uniqueAccount(), "off", "f" + System.nanoTime(), "r@gmail.com");
        http.patch(api("/api/emails/" + email.id() + "/preferences"), Map.of("trackingEnabled", false), asOwner());
        clock.advance(Duration.ofSeconds(20));
        fetchPixelAndWait(email, GMAIL_PROXY_UA);
        assertThat(reasons(email.id())).containsExactly("TRACKING_OFF");
    }

    @Test
    void clicksAreCountedPerLink() {
        long lastActivity = http.get(api("/api/activity"), asExtension()).json().get("lastId").asLong();
        TrackedEmail email = sentEmail(uniqueAccount(), "click", "c" + System.nanoTime(), "r@gmail.com");
        String target = "https://example.com/pricing";
        String tracked = http.post(api("/api/emails/" + email.id() + "/links"), Map.of("urls", List.of(target)), asExtension())
                .json().get("links").get(0).get("trackedUrl").asString();
        clock.advance(Duration.ofSeconds(20));
        TestHttp.Response redirect = http.get(pub(tracked.substring(tracked.indexOf("/c/"))), "User-Agent", BROWSER_UA);
        assertThat(redirect.status()).isEqualTo(302);
        await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == 1);

        clock.advance(Duration.ofSeconds(31));
        finalizer.runOnce();
        JsonNode detail = http.get(api("/api/emails/" + email.id()), asOwner()).json();
        assertThat(detail.get("summary").get("clickCount").asInt()).isEqualTo(1);
        assertThat(detail.get("links").get(0).get("clickCount").asInt()).isEqualTo(1);
        JsonNode item = find(http.get(api("/api/activity?since=" + lastActivity), asExtension()).json().get("items"), email.id());
        assertThat(item.get("kind").asString()).isEqualTo("CLICK");
        assertThat(item.get("linkUrl").asString()).isEqualTo(target);
        String threadId = detail.get("gmailThreadId").asString();
        JsonNode marks = http.get(api("/api/marks?account=" + email.account() + "&threadIds=" + threadId), asExtension()).json();
        assertThat(marks.get("marks").get(threadId).get("state").asString()).isEqualTo("OPENED");
    }

    @Test
    void holdWindowIsASetting() {
        JsonNode settings = http.get(api("/api/settings"), asOwner()).json();
        assertThat(settings.get("selfViewWindowSeconds").asInt()).isEqualTo(30);
        Map<String, Object> shorter = TestHttp.JSON.convertValue(settings, Map.class);
        shorter.put("selfViewWindowSeconds", 15);
        assertThat(http.put(api("/api/settings"), shorter, asOwner()).status()).isEqualTo(200);
        try {
            TrackedEmail email = sentEmail(uniqueAccount(), "h", "h" + System.nanoTime(), "r@gmail.com");
            clock.advance(Duration.ofSeconds(20));
            fetchPixelAndWait(email, GMAIL_PROXY_UA);
            clock.advance(Duration.ofSeconds(16));
            finalizer.runOnce();
            assertThat(verdicts(email.id())).containsExactly("COUNTED");
        } finally {
            assertThat(http.put(api("/api/settings"), settings, asOwner()).status()).isEqualTo(200);
        }
    }

    private void fetchPixelAndWait(TrackedEmail email, String userAgent) {
        long before = eventCount(email.id());
        assertThat(fetchPixel(email.token(), userAgent).status()).isEqualTo(200);
        await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == before + 1);
    }

    private void reportSelfView(String token) {
        TestHttp.Response response = http.post(api("/api/self-views"),
                Map.of("tokens", List.of(token, "unknown-token"), "context", "THREAD"), asExtension());
        assertThat(response.status()).isEqualTo(202);
        assertThat(response.json().get("matched").asInt()).isEqualTo(1);
    }

    private List<String> verdicts(UUID emailId) {
        return jdbc.sql("SELECT verdict FROM tracking_event WHERE tracked_email_id = :id ORDER BY received_at")
                .param("id", emailId).query(String.class).list();
    }

    private List<String> reasons(UUID emailId) {
        return jdbc.sql("SELECT reason FROM tracking_event WHERE tracked_email_id = :id ORDER BY received_at")
                .param("id", emailId).query(String.class).list();
    }

    private static JsonNode find(JsonNode items, UUID emailId) {
        for (JsonNode item : items) {
            if (item.get("emailId").asString().equals(emailId.toString())) {
                return item;
            }
        }
        throw new AssertionError("No activity for " + emailId);
    }
}
