package com.mailpulse.activity;

import com.mailpulse.common.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Counted opens, clicks and alerts, in the order they happened. The id is the feed cursor. */
@Repository
class ActivityRepository {

    record ActivityRow(
            long id,
            String kind,
            UUID emailId,
            Instant createdAt,
            byte[] subjectEnc,
            boolean emailNotify,
            Instant occurredAt,
            String source,
            UUID linkId,
            String alertType,
            String alertText,
            boolean silent,
            Integer openNumber,
            Instant previousOpenAt,
            byte[] accountEnc,
            String gmailThreadId) {}

    /** One page of rows plus whether more exist beyond it (older ones for latest/before, newer ones for after). */
    record Slice(List<ActivityRow> rows, boolean hasMore) {}

    private static final String COUNTED_OPENS = "FROM tracking_event o WHERE o.tracked_email_id = ev.tracked_email_id"
            + " AND o.type = 'OPEN' AND o.verdict = 'COUNTED' AND (o.received_at, o.id) ";

    private static final String SELECT = "SELECT a.id, a.kind, a.tracked_email_id, a.created_at, a.silent, te.subject_enc,"
            + " te.notify, te.gmail_thread_id, ga.address_enc AS account_enc, ev.received_at, ev.source, ev.tracked_link_id,"
            + " al.type AS alert_type, al.details ->> 'text' AS alert_text,"
            + " CASE WHEN a.kind = 'OPEN' AND ev.id IS NOT NULL THEN (SELECT count(*) " + COUNTED_OPENS
            + "<= (ev.received_at, ev.id)) END AS open_number,"
            + " CASE WHEN a.kind = 'OPEN' AND ev.id IS NOT NULL THEN (SELECT max(o.received_at) " + COUNTED_OPENS
            + "< (ev.received_at, ev.id)) END AS previous_open_at"
            + " FROM activity a"
            + " JOIN tracked_email te ON te.id = a.tracked_email_id"
            + " JOIN gmail_account ga ON ga.id = te.gmail_account_id"
            + " LEFT JOIN tracking_event ev ON ev.id = a.event_id"
            + " LEFT JOIN alert al ON al.id = a.alert_id";

    private final JdbcClient jdbc;

    ActivityRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    long insert(String kind, UUID emailId, Long eventId, Instant now, boolean silent) {
        return jdbc.sql("""
                INSERT INTO activity (kind, tracked_email_id, event_id, created_at, silent)
                VALUES (:kind, :email, :event, :now, :silent) RETURNING id
                """)
                .param("kind", kind)
                .param("email", emailId)
                .param("event", eventId)
                .param("now", Sql.ts(now))
                .param("silent", silent)
                .query(Long.class)
                .single();
    }

    long insertAlert(UUID emailId, UUID alertId, Instant now) {
        return jdbc.sql("INSERT INTO activity (kind, tracked_email_id, alert_id, created_at) VALUES ('ALERT', :email, :alert, :now) RETURNING id")
                .param("email", emailId)
                .param("alert", alertId)
                .param("now", Sql.ts(now))
                .query(Long.class)
                .single();
    }

    int deleteForEvent(long eventId) {
        return jdbc.sql("DELETE FROM activity WHERE event_id = :event").param("event", eventId).update();
    }

    /** Items after the cursor, oldest first. */
    Slice findAfter(long afterId, int limit, Collection<String> kinds) {
        List<ActivityRow> rows = jdbc.sql(SELECT + " WHERE a.id > :after" + kindFilter(kinds) + " ORDER BY a.id LIMIT :limit")
                .param("after", afterId)
                .param("limit", limit + 1)
                .param("kinds", kindParam(kinds))
                .query(ActivityRepository::map)
                .list();
        boolean more = rows.size() > limit;
        return new Slice(more ? rows.subList(0, limit) : rows, more);
    }

    /** The newest items, or the newest before the cursor when one is given; returned oldest first. */
    Slice findLatest(Long beforeId, int limit, Collection<String> kinds) {
        String where = beforeId == null ? " WHERE a.id > -1" : " WHERE a.id < :before";
        var spec = jdbc.sql(SELECT + where + kindFilter(kinds) + " ORDER BY a.id DESC LIMIT :limit")
                .param("limit", limit + 1)
                .param("kinds", kindParam(kinds));
        if (beforeId != null) {
            spec = spec.param("before", beforeId);
        }
        List<ActivityRow> rows = spec.query(ActivityRepository::map).list();
        boolean more = rows.size() > limit;
        List<ActivityRow> page = new ArrayList<>(more ? rows.subList(0, limit) : rows);
        Collections.reverse(page);
        return new Slice(page, more);
    }

    List<ActivityRow> findByIds(Collection<Long> ids) {
        return jdbc.sql(SELECT + " WHERE a.id IN (:ids) ORDER BY a.id").param("ids", ids).query(ActivityRepository::map).list();
    }

    long maxId() {
        return jdbc.sql("SELECT COALESCE(max(id), 0) FROM activity").query(Long.class).single();
    }

    private static String kindFilter(Collection<String> kinds) {
        return kinds.isEmpty() ? "" : " AND a.kind IN (:kinds)";
    }

    /** Bound even when unused, so the statement never has a missing parameter. */
    private static Collection<String> kindParam(Collection<String> kinds) {
        return kinds.isEmpty() ? List.of("-") : kinds;
    }

    private static ActivityRow map(ResultSet rs, int row) throws SQLException {
        return new ActivityRow(
                rs.getLong("id"),
                rs.getString("kind"),
                Sql.uuid(rs, "tracked_email_id"),
                Sql.instant(rs, "created_at"),
                rs.getBytes("subject_enc"),
                rs.getBoolean("notify"),
                Sql.instant(rs, "received_at"),
                rs.getString("source"),
                Sql.uuid(rs, "tracked_link_id"),
                rs.getString("alert_type"),
                rs.getString("alert_text"),
                rs.getBoolean("silent"),
                Sql.nullableInt(rs, "open_number"),
                Sql.instant(rs, "previous_open_at"),
                rs.getBytes("account_enc"),
                rs.getString("gmail_thread_id"));
    }
}
