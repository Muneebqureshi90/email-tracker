package com.mailpulse.reports;

import com.mailpulse.common.Sql;
import com.mailpulse.settings.SettingsService;
import java.time.Clock;
import java.time.DateTimeException;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/** "Best time to send" (counted opens per weekday and hour) and "This week" numbers, in the owner's time zone. */
@Service
public class BestTimeQueries {

    static final Duration WINDOW = Duration.ofDays(180);
    private static final ZoneId UTC = ZoneId.of("UTC");

    /** weekday: 1 = Monday to 7 = Sunday; hour: 0 to 23. */
    public record Cell(int weekday, int hour, int opens) {}

    public record BestTime(String timezone, int totalOpens, List<Cell> cells) {}

    public record ThisWeek(Instant from, Instant to, int sent, int opened, int clicked, int documentViews) {}

    private final JdbcClient jdbc;
    private final SettingsService settings;
    private final Clock clock;

    BestTimeQueries(JdbcClient jdbc, SettingsService settings, Clock clock) {
        this.jdbc = jdbc;
        this.settings = settings;
        this.clock = clock;
    }

    /** The owner's zone from Settings; UTC when none is set or it is not a valid zone. */
    ZoneId zone() {
        String id = settings.current().timeZone();
        if (id == null || id.isBlank()) {
            return UTC;
        }
        try {
            return ZoneId.of(id);
        } catch (DateTimeException invalid) {
            return UTC;
        }
    }

    public BestTime bestTime() {
        ZoneId zone = zone();
        Instant to = clock.instant();
        Instant from = to.minus(WINDOW);
        List<Instant> opens = jdbc.sql("""
                SELECT received_at FROM tracking_event
                WHERE verdict = 'COUNTED' AND type = 'OPEN' AND received_at >= :from AND received_at <= :to
                """)
                .param("from", Sql.ts(from))
                .param("to", Sql.ts(to))
                .query((rs, row) -> Sql.instant(rs, "received_at"))
                .list();
        int[][] grid = new int[7][24];
        for (Instant at : opens) {
            ZonedDateTime local = at.atZone(zone);
            grid[local.getDayOfWeek().getValue() - 1][local.getHour()]++;
        }
        List<Cell> cells = new ArrayList<>();
        for (int day = 0; day < 7; day++) {
            for (int hour = 0; hour < 24; hour++) {
                if (grid[day][hour] > 0) {
                    cells.add(new Cell(day + 1, hour, grid[day][hour]));
                }
            }
        }
        return new BestTime(zone.getId(), opens.size(), cells);
    }

    /**
     * From Monday 00:00 of the current week (owner's zone) until now: emails sent, distinct emails with a counted
     * open, distinct emails with a counted click, and counted document views in that time.
     */
    public ThisWeek thisWeek() {
        ZoneId zone = zone();
        Instant to = clock.instant();
        LocalDate monday = LocalDate.ofInstant(to, zone).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        Instant from = monday.atStartOfDay(zone).toInstant();
        int sent = jdbc.sql("""
                SELECT count(*) FROM tracked_email
                WHERE status IN ('SENT', 'SCHEDULED') AND sent_at >= :from AND sent_at <= :to
                """)
                .param("from", Sql.ts(from))
                .param("to", Sql.ts(to))
                .query(Integer.class)
                .single();
        int[] engaged = jdbc.sql("""
                SELECT count(DISTINCT tracked_email_id) FILTER (WHERE type = 'OPEN') AS opened,
                       count(DISTINCT tracked_email_id) FILTER (WHERE type = 'CLICK') AS clicked
                FROM tracking_event
                WHERE verdict = 'COUNTED' AND received_at >= :from AND received_at <= :to
                """)
                .param("from", Sql.ts(from))
                .param("to", Sql.ts(to))
                .query((rs, row) -> new int[] {rs.getInt("opened"), rs.getInt("clicked")})
                .single();
        int documentViews = jdbc.sql("""
                SELECT count(*) FROM document_event
                WHERE type = 'DOC_VIEW' AND verdict = 'COUNTED' AND received_at >= :from AND received_at <= :to
                """)
                .param("from", Sql.ts(from))
                .param("to", Sql.ts(to))
                .query(Integer.class)
                .single();
        return new ThisWeek(from, to, sent, engaged[0], engaged[1], documentViews);
    }
}
