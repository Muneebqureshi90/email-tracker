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
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/**
 * Repeat opens (history, open numbers, "opened again", the notify-on setting) and "That was me".
 * Runs in its own context because it moves the clock by hours and changes notification settings.
 */
@TestPropertySource(properties = "test.context=repeat-opens")
class RepeatOpensIT extends IntegrationTest {

    @Test
    void everyCountedOpenIsKeptNumberedAndNotifiedPerSetting() {
        long cursor = lastActivityId();
        String thread = "ro" + System.nanoTime();
        TrackedEmail email = sentEmail(uniqueAccount(), "Repeat opens", thread, "jane@example.com");
        countOpen(email);
        clock.advance(Duration.ofMinutes(10));
        countOpen(email);
        clock.advance(Duration.ofMinutes(65));
        countOpen(email);

        JsonNode detail = detail(email);
        JsonNode summary = detail.get("summary");
        assertThat(summary.get("openCount").asInt()).isEqualTo(3);
        assertThat(summary.get("openedAgain").asBoolean()).isTrue();
        List<String> recent = texts(summary.get("recentOpens"));
        assertThat(recent).hasSize(3);
        assertThat(recent.getFirst()).isEqualTo(summary.get("lastOpenedAt").asString());
        List<String> opens = new ArrayList<>();
        detail.get("opens").forEach(open -> opens.add(open.get("at").asString()));
        assertThat(opens).hasSize(3).containsExactlyElementsOf(recent.reversed());
        assertThat(detail.get("opens").get(0).get("source").asString()).isEqualTo("GMAIL_PROXY");

        JsonNode mark = http.get(api("/api/marks?account=" + email.account() + "&threadIds=" + thread), asExtension())
                .json().get("marks").get(thread);
        assertThat(mark.get("openCount").asInt()).isEqualTo(3);
        assertThat(mark.get("openedAgain").asBoolean()).isTrue();
        assertThat(texts(mark.get("recentOpens"))).isEqualTo(recent);
        assertThat(mark.get("firstOpenedAt").asString()).isEqualTo(summary.get("firstOpenedAt").asString());

        List<JsonNode> items = opens(cursor, email);
        assertThat(items).extracting(item -> item.get("openNumber").asInt()).containsExactly(1, 2, 3);
        assertThat(items.getFirst().get("account").asString()).isEqualTo(email.account());
        assertThat(items.getFirst().get("gmailThreadId").asString()).isEqualTo(thread);
        assertThat(notified(cursor, email)).containsExactly(true, true, true);

        withNotifyOn("FIRST", () -> assertThat(notified(cursor, email)).containsExactly(true, false, false));
        withNotifyOn("EVERY_AFTER_GAP", () -> assertThat(notified(cursor, email)).containsExactly(true, false, true));
    }

    @Test
    void thatWasMeRemovesTheOpenAndUndoRestoresItWithoutANotification() {
        long cursor = lastActivityId();
        TrackedEmail email = sentEmail(uniqueAccount(), "My phone", "me" + System.nanoTime(), "joe@example.com");
        countOpen(email);
        clock.advance(Duration.ofMinutes(38));
        countOpen(email);
        JsonNode before = detail(email);
        long first = before.get("opens").get(0).get("eventId").asLong();
        long second = before.get("opens").get(1).get("eventId").asLong();

        TestHttp.Response marked = http.post(api("/api/emails/" + email.id() + "/events/" + second + "/mine"), null, asOwner());
        assertThat(marked.status()).isEqualTo(200);
        JsonNode after = marked.json();
        assertThat(after.get("summary").get("openCount").asInt()).isEqualTo(1);
        assertThat(after.get("summary").get("lastOpenedAt").asString()).isEqualTo(after.get("opens").get(0).get("at").asString());
        assertThat(after.get("opens")).hasSize(1);
        assertThat(reason(second)).isEqualTo("OWNER");
        assertThat(opens(cursor, email)).hasSize(1);
        assertThat(http.post(api("/api/emails/" + email.id() + "/events/" + second + "/mine"), null, asOwner()).status())
                .as("marking twice is harmless").isEqualTo(200);

        long newest = lastActivityId();
        TestHttp.Response undone = http.delete(api("/api/emails/" + email.id() + "/events/" + second + "/mine"), asOwner());
        assertThat(undone.status()).isEqualTo(200);
        assertThat(undone.json().get("summary").get("openCount").asInt()).isEqualTo(2);
        assertThat(reason(second)).isNull();
        List<JsonNode> restored = opens(newest, email);
        assertThat(restored).hasSize(1);
        assertThat(restored.getFirst().get("shouldNotify").asBoolean()).as("undo never notifies").isFalse();
        assertThat(restored.getFirst().get("openNumber").asInt()).isEqualTo(2);

        assertThat(http.post(api("/api/emails/" + email.id() + "/events/" + first + "/mine"), null, asExtension()).status())
                .isEqualTo(403);
        assertThat(http.post(api("/api/emails/" + email.id() + "/events/999999999/mine"), null, asOwner()).status()).isEqualTo(404);
        assertThat(http.delete(api("/api/emails/" + email.id() + "/events/" + first + "/mine"), asOwner()).status())
                .as("a counted event is already restored").isEqualTo(200);
    }

    @Test
    void thatWasMeOnAClickRecomputesTheLinkAndOnlyCountedEventsQualify() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Own click", "mc" + System.nanoTime(), "kim@example.com");
        String tracked = http.post(api("/api/emails/" + email.id() + "/links"), Map.of("urls", List.of("https://example.com/x")),
                asExtension()).json().get("links").get(0).get("trackedUrl").asString();
        clock.advance(Duration.ofSeconds(40));
        assertThat(http.get(pub(tracked.substring(tracked.indexOf("/c/"))), "User-Agent", BROWSER_UA).status()).isEqualTo(302);
        assertThat(http.get(pub(tracked.substring(tracked.indexOf("/c/"))), "User-Agent", BROWSER_UA).status()).isEqualTo(302);
        await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == 2);
        clock.advance(Duration.ofSeconds(31));
        finalizer.runOnce();
        long counted = eventId(email, "COUNTED");
        long duplicate = eventId(email, "IGNORED");

        assertThat(http.post(api("/api/emails/" + email.id() + "/events/" + duplicate + "/mine"), null, asOwner()).status())
                .isEqualTo(409);
        JsonNode after = http.post(api("/api/emails/" + email.id() + "/events/" + counted + "/mine"), null, asOwner()).json();
        assertThat(after.get("summary").get("clickCount").asInt()).isZero();
        assertThat(after.get("links").get(0).get("clickCount").asInt()).isZero();
        assertThat(after.get("links").get(0).get("lastClickedAt").isNull()).isTrue();
    }

    @Test
    void theOwnersOwnViewsNeverChangeCounts() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Own views", "ov" + System.nanoTime(), "lee@example.com");
        countOpen(email);
        clock.advance(Duration.ofMinutes(5));
        assertThat(fetchPixel(email.token(), BROWSER_UA, "X-MailPulse-Self", "test-self-secret").status()).isEqualTo(200);
        await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == 2);
        clock.advance(Duration.ofMinutes(5));
        assertThat(http.post(api("/api/self-views"), Map.of("tokens", List.of(email.token()), "context", "THREAD"), asExtension())
                .status()).isEqualTo(202);
        assertThat(fetchPixel(email.token(), GMAIL_PROXY_UA).status()).isEqualTo(200);
        await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == 3);
        clock.advance(Duration.ofSeconds(31));
        finalizer.runOnce();
        for (int i = 0; i < 3; i++) {
            detail(email);
        }
        JsonNode detail = detail(email);
        assertThat(detail.get("summary").get("openCount").asInt()).isEqualTo(1);
        assertThat(detail.get("opens")).hasSize(1);
        assertThat(jdbc.sql("SELECT reason FROM tracking_event WHERE tracked_email_id = :id AND verdict = 'IGNORED' ORDER BY id")
                .param("id", email.id()).query(String.class).list()).containsExactly("SELF", "SELF_VIEW");
    }

    @Test
    void activityFiltersByKindPagesBackwardsAndCarriesTheConfigVersion() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Pages", "pg" + System.nanoTime(), "pat@example.com");
        countOpen(email);
        clock.advance(Duration.ofMinutes(2));
        countOpen(email);
        JsonNode latest = http.get(api("/api/activity?kinds=OPEN&limit=1"), asExtension()).json();
        assertThat(latest.get("items")).hasSize(1);
        assertThat(latest.get("hasMore").asBoolean()).isTrue();
        assertThat(latest.get("configVersion").asString())
                .isEqualTo(http.get(api("/api/config"), asExtension()).json().get("configVersion").asString());
        long newest = latest.get("items").get(0).get("id").asLong();
        JsonNode older = http.get(api("/api/activity?kinds=OPEN&limit=1&before=" + newest), asOwner()).json();
        assertThat(older.get("items").get(0).get("id").asLong()).isLessThan(newest);
        JsonNode alertsOnly = http.get(api("/api/activity?kinds=ALERT&limit=100"), asOwner()).json();
        alertsOnly.get("items").forEach(item -> assertThat(item.get("kind").asString()).isEqualTo("ALERT"));
        assertThat(http.get(api("/api/activity?kinds=BOGUS"), asOwner()).status()).isEqualTo(400);
        assertThat(http.get(api("/api/activity?since=1&before=5"), asOwner()).status()).isEqualTo(400);
        JsonNode viaAfter = http.get(api("/api/activity?after=" + (newest - 1) + "&kinds=OPEN"), asOwner()).json();
        assertThat(viaAfter.get("items").get(0).get("id").asLong()).isEqualTo(newest);
        assertThat(viaAfter.get("hasMore").asBoolean()).isFalse();
    }

    @SuppressWarnings("unchecked")
    private void withNotifyOn(String mode, Runnable check) {
        JsonNode original = http.get(api("/api/settings"), asOwner()).json();
        Map<String, Object> changed = TestHttp.JSON.convertValue(original, Map.class);
        changed.put("notifyOn", mode);
        assertThat(http.put(api("/api/settings"), changed, asOwner()).status()).isEqualTo(200);
        try {
            check.run();
        } finally {
            assertThat(http.put(api("/api/settings"), original, asOwner()).status()).isEqualTo(200);
        }
    }

    private JsonNode detail(TrackedEmail email) {
        TestHttp.Response response = http.get(api("/api/emails/" + email.id()), asOwner());
        assertThat(response.status()).isEqualTo(200);
        return response.json();
    }

    private long lastActivityId() {
        return http.get(api("/api/activity?limit=1"), asExtension()).json().get("lastId").asLong();
    }

    private List<JsonNode> opens(long since, TrackedEmail email) {
        List<JsonNode> found = new ArrayList<>();
        for (JsonNode item : http.get(api("/api/activity?since=" + since + "&limit=100&kinds=OPEN"), asExtension()).json().get("items")) {
            if (item.get("emailId").asString().equals(email.id().toString())) {
                found.add(item);
            }
        }
        return found;
    }

    private List<Boolean> notified(long since, TrackedEmail email) {
        return opens(since, email).stream().map(item -> item.get("shouldNotify").asBoolean()).toList();
    }

    private String reason(long eventId) {
        return jdbc.sql("SELECT reason FROM tracking_event WHERE id = :id").param("id", eventId)
                .query((rs, row) -> rs.getString("reason")).list().getFirst();
    }

    private long eventId(TrackedEmail email, String verdict) {
        return jdbc.sql("SELECT id FROM tracking_event WHERE tracked_email_id = :id AND verdict = :verdict ORDER BY id LIMIT 1")
                .param("id", email.id()).param("verdict", verdict).query(Long.class).single();
    }

    private static List<String> texts(JsonNode array) {
        List<String> values = new ArrayList<>();
        array.forEach(value -> values.add(value.asString()));
        return values;
    }
}
