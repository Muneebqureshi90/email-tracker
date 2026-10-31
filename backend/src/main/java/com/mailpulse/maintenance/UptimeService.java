package com.mailpulse.maintenance;

import com.mailpulse.common.Sql;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * Heartbeats and downtime windows: when the previous heartbeat is older than {@link #GAP}, MailPulse was not running
 * (the PC was off or asleep) from that heartbeat until now, and opens in that time were not recorded.
 */
@Service
public class UptimeService {

    static final Duration GAP = Duration.ofMinutes(3);
    static final Duration KEEP = Duration.ofDays(90);

    public record Downtime(Instant from, Instant to, long minutes) {}

    private final JdbcClient jdbc;
    private final Clock clock;

    UptimeService(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /** Saves now as the last heartbeat; returns the downtime window it recorded, if the previous one was too old. */
    public Optional<Downtime> beat() {
        Instant now = clock.instant();
        Optional<Instant> previous = lastHeartbeat();
        Optional<Downtime> window = Optional.empty();
        if (previous.isPresent() && Duration.between(previous.get(), now).compareTo(GAP) > 0) {
            jdbc.sql("INSERT INTO downtime_window (started_at, ended_at) VALUES (:from, :to)")
                    .param("from", Sql.ts(previous.get()))
                    .param("to", Sql.ts(now))
                    .update();
            window = Optional.of(downtime(previous.get(), now));
        }
        jdbc.sql("""
                INSERT INTO heartbeat (id, last_seen) VALUES (1, :now)
                ON CONFLICT (id) DO UPDATE SET last_seen = EXCLUDED.last_seen
                """)
                .param("now", Sql.ts(now))
                .update();
        jdbc.sql("DELETE FROM downtime_window WHERE ended_at < :cutoff").param("cutoff", Sql.ts(now.minus(KEEP))).update();
        return window;
    }

    public Optional<Instant> lastHeartbeat() {
        return jdbc.sql("SELECT last_seen FROM heartbeat WHERE id = 1")
                .query((rs, row) -> Sql.instant(rs, "last_seen"))
                .optional();
    }

    /** Windows that ended at or after {@code from}, newest first. */
    public List<Downtime> since(Instant from) {
        return jdbc.sql("SELECT started_at, ended_at FROM downtime_window WHERE ended_at >= :from ORDER BY started_at DESC, id DESC")
                .param("from", Sql.ts(from))
                .query((rs, row) -> downtime(Sql.instant(rs, "started_at"), Sql.instant(rs, "ended_at")))
                .list();
    }

    private static Downtime downtime(Instant from, Instant to) {
        return new Downtime(from, to, (Duration.between(from, to).toSeconds() + 30) / 60);
    }
}
