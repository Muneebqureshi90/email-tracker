package com.mailpulse.maintenance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.mailpulse.common.Sql;
import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestHttp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;

class UptimeIT extends IntegrationTest {

    @Autowired
    private UptimeService uptime;

    @BeforeEach
    void clean() {
        jdbc.sql("DELETE FROM heartbeat").update();
        jdbc.sql("DELETE FROM downtime_window").update();
    }

    @Test
    void recordsGapsLongerThanThreeMinutesAndReportsThem() {
        Instant start = clock.instant();
        try {
            assertThat(uptime.beat()).as("the first heartbeat ever").isEmpty();
            clock.advance(Duration.ofMinutes(1));
            assertThat(uptime.beat()).isEmpty();
            clock.advance(Duration.ofMinutes(3));
            assertThat(uptime.beat()).as("exactly three minutes is not downtime").isEmpty();
            Instant offAt = clock.instant();
            clock.advance(Duration.ofMinutes(200));
            UptimeService.Downtime window = uptime.beat().orElseThrow();
            assertThat(window.from()).isCloseTo(offAt, within(1, ChronoUnit.MILLIS));
            assertThat(window.to()).isEqualTo(clock.instant());
            assertThat(window.minutes()).isEqualTo(200);
            insertWindow(clock.instant().minus(Duration.ofDays(41)), clock.instant().minus(Duration.ofDays(40)));
            clock.advance(Duration.ofMinutes(10));
            assertThat(uptime.beat()).isPresent();

            TestHttp.Response response = http.get(api("/api/system/status"), asOwner());
            assertThat(response.status()).isEqualTo(200);
            JsonNode body = response.json();
            assertThat(Instant.parse(body.get("lastHeartbeatAt").asString())).isCloseTo(clock.instant(), within(1, ChronoUnit.MILLIS));
            JsonNode downtimes = body.get("downtimes");
            assertThat(downtimes.size()).as("only the last 30 days").isEqualTo(2);
            assertThat(downtimes.get(0).get("minutes").asLong()).as("newest first").isEqualTo(10);
            assertThat(downtimes.get(1).get("minutes").asLong()).isEqualTo(200);
            assertThat(body.get("databaseBytes").asLong()).isPositive();
            assertThat(body.get("documentBytes").asLong()).isNotNegative();
            assertThat(body.get("emails").asLong()).isNotNegative();
            assertThat(body.get("documents").asLong()).isNotNegative();
        } finally {
            clock.set(start);
        }
    }

    @Test
    void deletesWindowsOlderThanNinetyDays() {
        Instant now = clock.instant();
        insertWindow(now.minus(Duration.ofDays(100)), now.minus(Duration.ofDays(91)));
        insertWindow(now.minus(Duration.ofDays(10)), now.minus(Duration.ofDays(9)));
        uptime.beat();
        assertThat(jdbc.sql("SELECT count(*) FROM downtime_window").query(Long.class).single()).isEqualTo(1);
    }

    private void insertWindow(Instant from, Instant to) {
        jdbc.sql("INSERT INTO downtime_window (started_at, ended_at) VALUES (:a, :b)")
                .param("a", Sql.ts(from))
                .param("b", Sql.ts(to))
                .update();
    }
}
