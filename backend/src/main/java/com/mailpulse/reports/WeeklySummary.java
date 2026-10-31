package com.mailpulse.reports;

import com.mailpulse.common.Sql;
import com.mailpulse.settings.SettingsService;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/** Numbers of one week (Monday 00:00 to the next Monday 00:00, owner's time zone) for the WEEKLY alert and the API. */
@Service
public class WeeklySummary {

    public record Week(Instant from, Instant to, long sent, long opened, long replied, long interviews, long documentViews) {

        public boolean empty() {
            return sent == 0 && opened == 0 && replied == 0 && interviews == 0 && documentViews == 0;
        }

        /** For example "Last week: 12 sent, 8 opened, 3 replied, 1 interview". */
        public String text() {
            return "Last week: " + sent + " sent, " + opened + " opened, " + replied + " replied, " + interviews
                    + (interviews == 1 ? " interview" : " interviews");
        }
    }

    private final JdbcClient jdbc;
    private final SettingsService settings;
    private final Clock clock;

    WeeklySummary(JdbcClient jdbc, SettingsService settings, Clock clock) {
        this.jdbc = jdbc;
        this.settings = settings;
        this.clock = clock;
    }

    public ZoneId zone() {
        try {
            return ZoneId.of(settings.current().timeZone());
        } catch (RuntimeException e) {
            return ZoneOffset.UTC;
        }
    }

    /** Monday of the current week in the owner's time zone. */
    public LocalDate thisMonday() {
        return LocalDate.now(clock.withZone(zone())).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    /** The week before the current one. */
    public Week lastWeek() {
        ZoneId zone = zone();
        LocalDate monday = thisMonday();
        return week(monday.minusWeeks(1).atStartOfDay(zone).toInstant(), monday.atStartOfDay(zone).toInstant());
    }

    Week week(Instant from, Instant to) {
        return new Week(from, to,
                count("SELECT count(*) FROM tracked_email WHERE status = 'SENT' AND tracking_enabled"
                        + " AND sent_at >= :from AND sent_at < :to", from, to),
                count("SELECT count(DISTINCT tracked_email_id) FROM tracking_event WHERE type = 'OPEN' AND verdict = 'COUNTED'"
                        + " AND received_at >= :from AND received_at < :to", from, to),
                count("SELECT count(*) FROM tracked_email WHERE replied_at >= :from AND replied_at < :to", from, to),
                count("SELECT count(*) FROM job_application WHERE status = 'INTERVIEW'"
                        + " AND updated_at >= :from AND updated_at < :to", from, to),
                count("SELECT count(*) FROM document_event WHERE type = 'DOC_VIEW' AND verdict = 'COUNTED'"
                        + " AND received_at >= :from AND received_at < :to", from, to));
    }

    private long count(String sql, Instant from, Instant to) {
        return jdbc.sql(sql).param("from", Sql.ts(from)).param("to", Sql.ts(to)).query(Long.class).single();
    }
}
