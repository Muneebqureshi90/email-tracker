package com.mailpulse.reports;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.mailpulse.support.IntegrationTest;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

class BestTimeIT extends IntegrationTest {

    @Test
    void bestTimeCountsOpensOfTheLast180DaysPerWeekdayAndHour() {
        // Sessions first: tokens issued while the clock is moved would be expired afterwards.
        ownerCookie();
        extensionToken();
        JsonNode before = http.get(api("/api/reports/best-time"), asOwner()).json();
        ZoneId zone = ZoneId.of(before.get("timezone").asString());
        Instant recent = now().minus(Duration.ofDays(3)).truncatedTo(ChronoUnit.HOURS).plus(Duration.ofMinutes(10));
        sendAndOpenAt(recent);
        sendAndOpenAt(now().minus(Duration.ofDays(200)));

        JsonNode after = http.get(api("/api/reports/best-time"), asOwner()).json();
        assertThat(after.get("timezone").asString()).isEqualTo(zone.getId());
        assertThat(after.get("totalOpens").asInt()).isEqualTo(before.get("totalOpens").asInt() + 1);
        ZonedDateTime local = recent.plus(Duration.ofSeconds(20)).atZone(zone);
        int weekday = local.getDayOfWeek().getValue();
        int hour = local.getHour();
        assertThat(cell(after, weekday, hour)).isEqualTo(cell(before, weekday, hour) + 1);
        for (JsonNode cell : after.get("cells")) {
            assertThat(cell.get("opens").asInt()).isPositive();
            assertThat(cell.get("weekday").asInt()).isBetween(1, 7);
            assertThat(cell.get("hour").asInt()).isBetween(0, 23);
        }
    }

    @Test
    void thisWeekCountsSentOpenedClickedAndDocumentViewsSinceMonday() {
        JsonNode before = http.get(api("/api/reports/this-week"), asOwner()).json();
        TrackedEmail email = sentEmail(uniqueAccount(), "Week " + UUID.randomUUID(), "w" + System.nanoTime(),
                "week-" + UUID.randomUUID() + "@example.com");
        countOpen(email);

        JsonNode after = http.get(api("/api/reports/this-week"), asOwner()).json();
        assertThat(after.get("sent").asInt()).isEqualTo(before.get("sent").asInt() + 1);
        assertThat(after.get("opened").asInt()).isEqualTo(before.get("opened").asInt() + 1);
        assertThat(after.get("clicked").asInt()).isEqualTo(before.get("clicked").asInt());
        assertThat(after.get("documentViews").asInt()).isGreaterThanOrEqualTo(0);
        String zone = http.get(api("/api/reports/best-time"), asOwner()).json().get("timezone").asString();
        ZonedDateTime from = Instant.parse(after.get("from").asString()).atZone(ZoneId.of(zone));
        assertThat(from.getDayOfWeek()).isEqualTo(DayOfWeek.MONDAY);
        assertThat(from.getHour()).isZero();
        assertThat(from.getMinute()).isZero();
        assertThat(Instant.parse(after.get("to").asString())).isAfterOrEqualTo(Instant.parse(after.get("from").asString()));
    }

    private static int cell(JsonNode report, int weekday, int hour) {
        for (JsonNode cell : report.get("cells")) {
            if (cell.get("weekday").asInt() == weekday && cell.get("hour").asInt() == hour) {
                return cell.get("opens").asInt();
            }
        }
        return 0;
    }

    private void sendAndOpenAt(Instant sentAt) {
        Instant original = clock.instant();
        clock.set(sentAt);
        try {
            TrackedEmail email = sentEmail(uniqueAccount(), "Best time " + UUID.randomUUID(), "b" + System.nanoTime(),
                    "best-" + UUID.randomUUID() + "@example.com");
            clock.advance(Duration.ofSeconds(20));
            long before = eventCount(email.id());
            assertThat(fetchPixel(email.token(), GMAIL_PROXY_UA).status()).isEqualTo(200);
            await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == before + 1);
        } finally {
            clock.set(original);
            finalizer.runOnce();
        }
    }
}
