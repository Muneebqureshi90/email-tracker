package com.mailpulse.activity;

import com.mailpulse.common.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Collection;
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
            String alertText) {}

    private static final String SELECT = """
            SELECT a.id, a.kind, a.tracked_email_id, a.created_at, te.subject_enc, te.notify,
                   ev.received_at, ev.source, ev.tracked_link_id, al.type AS alert_type, al.details ->> 'text' AS alert_text
            FROM activity a
            JOIN tracked_email te ON te.id = a.tracked_email_id
            LEFT JOIN tracking_event ev ON ev.id = a.event_id
            LEFT JOIN alert al ON al.id = a.alert_id
            """;

    private final JdbcClient jdbc;

    ActivityRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    long insert(String kind, UUID emailId, Long eventId, Instant now) {
        return jdbc.sql("INSERT INTO activity (kind, tracked_email_id, event_id, created_at) VALUES (:kind, :email, :event, :now) RETURNING id")
                .param("kind", kind)
                .param("email", emailId)
                .param("event", eventId)
                .param("now", Sql.ts(now))
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

    List<ActivityRow> findAfter(long afterId, int limit) {
        return jdbc.sql(SELECT + " WHERE a.id > :after ORDER BY a.id LIMIT :limit")
                .param("after", afterId)
                .param("limit", limit)
                .query(ActivityRepository::map)
                .list();
    }

    List<ActivityRow> findLatest(int limit) {
        return jdbc.sql("SELECT * FROM (" + SELECT + " ORDER BY a.id DESC LIMIT :limit) latest ORDER BY id")
                .param("limit", limit)
                .query(ActivityRepository::map)
                .list();
    }

    List<ActivityRow> findByIds(Collection<Long> ids) {
        return jdbc.sql(SELECT + " WHERE a.id IN (:ids) ORDER BY a.id").param("ids", ids).query(ActivityRepository::map).list();
    }

    long maxId() {
        return jdbc.sql("SELECT COALESCE(max(id), 0) FROM activity").query(Long.class).single();
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
                rs.getString("alert_text"));
    }
}
