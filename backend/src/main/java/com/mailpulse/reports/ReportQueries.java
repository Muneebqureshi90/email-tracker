package com.mailpulse.reports;

import com.mailpulse.common.Sql;
import com.mailpulse.contacts.ContactQueries;
import com.mailpulse.emails.EmailApi;
import com.mailpulse.emails.EmailQueries;
import com.mailpulse.settings.SettingsService;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/** Daily and weekly reports in the owner's time zone, built from counted events only. */
@Service
public class ReportQueries {

    private static final int TOP = 5;

    public enum Period {
        DAY,
        WEEK
    }

    /** One bar of the chart: an hour of the day (DAY) or a date (WEEK). */
    public record Bucket(String label, int opens, int clicks) {}

    public record TopEmail(UUID id, String subject, String recipients, int opens, int clicks) {}

    public record TopContact(String email, String name, int opens) {}

    public record Report(
            Period period,
            LocalDate start,
            LocalDate end,
            String timeZone,
            int sent,
            int openedEmails,
            double openRate,
            int opens,
            int clicks,
            List<Bucket> buckets,
            List<TopEmail> topEmails,
            List<TopContact> topContacts) {}

    private record Counted(UUID emailId, String type, Instant receivedAt) {}

    private final JdbcClient jdbc;
    private final SettingsService settings;
    private final EmailQueries emails;
    private final ContactQueries contacts;
    private final Clock clock;

    ReportQueries(JdbcClient jdbc, SettingsService settings, EmailQueries emails, ContactQueries contacts, Clock clock) {
        this.jdbc = jdbc;
        this.settings = settings;
        this.emails = emails;
        this.contacts = contacts;
        this.clock = clock;
    }

    public ZoneId zone() {
        return ZoneId.of(settings.current().timeZone());
    }

    public Report daily(LocalDate date) {
        LocalDate day = date == null ? LocalDate.now(clock.withZone(zone())) : date;
        return build(Period.DAY, day, day.plusDays(1));
    }

    public Report weekly(LocalDate weekStart) {
        LocalDate start = weekStart == null
                ? LocalDate.now(clock.withZone(zone())).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
                : weekStart;
        return build(Period.WEEK, start, start.plusDays(7));
    }

    private Report build(Period period, LocalDate startDate, LocalDate endDate) {
        ZoneId zone = zone();
        Instant from = startDate.atStartOfDay(zone).toInstant();
        Instant to = endDate.atStartOfDay(zone).toInstant();

        var sentStats = jdbc.sql("""
                SELECT count(*) AS sent, count(*) FILTER (WHERE open_count > 0 OR click_count > 0) AS opened
                FROM tracked_email WHERE status IN ('SENT', 'SCHEDULED') AND sent_at >= :from AND sent_at < :to
                """)
                .param("from", Sql.ts(from))
                .param("to", Sql.ts(to))
                .query((rs, row) -> new int[] {rs.getInt("sent"), rs.getInt("opened")})
                .single();
        List<Counted> counted = jdbc.sql("""
                SELECT tracked_email_id, type, received_at FROM tracking_event
                WHERE verdict = 'COUNTED' AND received_at >= :from AND received_at < :to
                """)
                .param("from", Sql.ts(from))
                .param("to", Sql.ts(to))
                .query((rs, row) -> new Counted(Sql.uuid(rs, "tracked_email_id"), rs.getString("type"), Sql.instant(rs, "received_at")))
                .list();

        int opens = (int) counted.stream().filter(event -> event.type().equals("OPEN")).count();
        int clicks = counted.size() - opens;
        int sent = sentStats[0];
        double openRate = sent == 0 ? 0 : Math.round(1000.0 * sentStats[1] / sent) / 1000.0;
        return new Report(period, startDate, endDate, zone.getId(), sent, sentStats[1], openRate, opens, clicks,
                buckets(period, startDate, zone, counted), topEmails(counted), topContacts(from, to));
    }

    private static List<Bucket> buckets(Period period, LocalDate start, ZoneId zone, List<Counted> counted) {
        int size = period == Period.DAY ? 24 : 7;
        int[] opens = new int[size];
        int[] clicks = new int[size];
        for (Counted event : counted) {
            ZonedDateTime at = event.receivedAt().atZone(zone);
            int index = period == Period.DAY ? at.getHour() : (int) (at.toLocalDate().toEpochDay() - start.toEpochDay());
            if (index < 0 || index >= size) {
                continue;
            }
            if (event.type().equals("OPEN")) {
                opens[index]++;
            } else {
                clicks[index]++;
            }
        }
        List<Bucket> buckets = new ArrayList<>(size);
        for (int i = 0; i < size; i++) {
            String label = period == Period.DAY ? "%02d:00".formatted(i) : start.plusDays(i).toString();
            buckets.add(new Bucket(label, opens[i], clicks[i]));
        }
        return buckets;
    }

    private List<TopEmail> topEmails(List<Counted> counted) {
        Map<UUID, int[]> perEmail = counted.stream().collect(Collectors.toMap(
                Counted::emailId,
                event -> event.type().equals("OPEN") ? new int[] {1, 0} : new int[] {0, 1},
                (a, b) -> new int[] {a[0] + b[0], a[1] + b[1]}));
        List<UUID> top = perEmail.entrySet().stream()
                .sorted((a, b) -> a.getValue()[0] != b.getValue()[0]
                        ? Integer.compare(b.getValue()[0], a.getValue()[0])
                        : Integer.compare(b.getValue()[1], a.getValue()[1]))
                .limit(TOP)
                .map(Map.Entry::getKey)
                .toList();
        Map<UUID, EmailApi.EmailSummary> summaries = emails.summariesByIds(top).stream()
                .collect(Collectors.toMap(EmailApi.EmailSummary::id, Function.identity()));
        return top.stream()
                .filter(summaries::containsKey)
                .map(id -> {
                    EmailApi.EmailSummary summary = summaries.get(id);
                    String recipients = summary.recipients().stream().map(EmailApi.Recipient::email).collect(Collectors.joining(", "));
                    return new TopEmail(id, summary.subject(), recipients, perEmail.get(id)[0], perEmail.get(id)[1]);
                })
                .toList();
    }

    /** Opens of an email count for each of its recipients: per-recipient pixels do not exist yet. */
    private List<TopContact> topContacts(Instant from, Instant to) {
        List<Object[]> rows = jdbc.sql("""
                SELECT r.contact_id, count(*) AS opens
                FROM tracking_event ev
                JOIN (SELECT DISTINCT contact_id, tracked_email_id FROM recipient) r ON r.tracked_email_id = ev.tracked_email_id
                WHERE ev.verdict = 'COUNTED' AND ev.type = 'OPEN' AND ev.received_at >= :from AND ev.received_at < :to
                GROUP BY r.contact_id ORDER BY opens DESC LIMIT :limit
                """)
                .param("from", Sql.ts(from))
                .param("to", Sql.ts(to))
                .param("limit", TOP)
                .query((rs, row) -> new Object[] {Sql.uuid(rs, "contact_id"), rs.getInt("opens")})
                .list();
        List<UUID> ids = rows.stream().map(row -> (UUID) row[0]).toList();
        List<ContactQueries.ContactSummary> people = contacts.summariesByIds(ids);
        List<TopContact> result = new ArrayList<>();
        for (int i = 0; i < people.size() && i < rows.size(); i++) {
            result.add(new TopContact(people.get(i).email(), people.get(i).name(), (Integer) rows.get(i)[1]));
        }
        return result;
    }
}
