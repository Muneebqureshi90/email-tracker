package com.mailpulse.maintenance;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** System status for the Account page and the Overview banner: heartbeat, recent downtime and storage use. */
@RestController
class SystemController {

    static final Duration DOWNTIME_PERIOD = Duration.ofDays(30);

    record Status(
            Instant lastHeartbeatAt,
            List<UptimeService.Downtime> downtimes,
            long databaseBytes,
            long documentBytes,
            long emails,
            long documents) {}

    private final UptimeService uptime;
    private final JdbcClient jdbc;
    private final Clock clock;

    SystemController(UptimeService uptime, JdbcClient jdbc, Clock clock) {
        this.uptime = uptime;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @GetMapping("/api/system/status")
    Status status() {
        Instant now = clock.instant();
        return new Status(
                uptime.lastHeartbeat().orElse(null),
                uptime.since(now.minus(DOWNTIME_PERIOD)),
                number("SELECT pg_database_size(current_database())"),
                number("SELECT COALESCE(SUM(size_bytes), 0) FROM document"),
                number("SELECT count(*) FROM tracked_email WHERE status = 'SENT'"),
                number("SELECT count(*) FROM document"));
    }

    private long number(String sql) {
        Long value = jdbc.sql(sql).query(Long.class).single();
        return value == null ? 0 : value;
    }
}
