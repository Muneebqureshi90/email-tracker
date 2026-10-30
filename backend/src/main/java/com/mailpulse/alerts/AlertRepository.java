package com.mailpulse.alerts;

import com.mailpulse.common.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

@Repository
class AlertRepository {

    record AlertRow(UUID id, String type, UUID emailId, Instant createdAt, String status, Instant snoozedUntil, String text,
            byte[] subjectEnc) {}

    record FollowUpCandidate(UUID emailId, Instant sentAt, int hours, int opens, int clicks) {}

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String SELECT = """
            SELECT a.id, a.type, a.tracked_email_id, a.created_at, a.status, a.snoozed_until, a.details ->> 'text' AS text,
                   te.subject_enc
            FROM alert a JOIN tracked_email te ON te.id = a.tracked_email_id
            """;

    private final JdbcClient jdbc;

    AlertRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    void insert(UUID id, AlertType type, UUID emailId, Instant now, Map<String, Object> details) {
        jdbc.sql("INSERT INTO alert (id, type, tracked_email_id, created_at, details) VALUES (:id, :type, :email, :now, CAST(:details AS jsonb))")
                .param("id", id)
                .param("type", type.name())
                .param("email", emailId)
                .param("now", Sql.ts(now))
                .param("details", JSON.writeValueAsString(details))
                .update();
    }

    boolean existsSince(UUID emailId, AlertType type, Instant since) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM alert WHERE tracked_email_id = :email AND type = :type AND created_at >= :since)")
                .param("email", emailId)
                .param("type", type.name())
                .param("since", Sql.ts(since))
                .query(Boolean.class)
                .single();
    }

    int countedOpensBetween(UUID emailId, Instant from, Instant to) {
        return jdbc.sql("""
                SELECT count(*) FROM tracking_event
                WHERE tracked_email_id = :email AND type = 'OPEN' AND verdict = 'COUNTED' AND received_at BETWEEN :from AND :to
                """)
                .param("email", emailId)
                .param("from", Sql.ts(from))
                .param("to", Sql.ts(to))
                .query(Integer.class)
                .single();
    }

    /** Sent, still unopened emails whose follow-up time has passed and that have no follow-up alert yet. */
    List<FollowUpCandidate> followUpCandidates(Instant now, int defaultHours) {
        return jdbc.sql("""
                SELECT te.id, te.sent_at, COALESCE(te.follow_up_hours, :defaultHours) AS hours, te.open_count, te.click_count
                FROM tracked_email te
                WHERE te.status = 'SENT' AND te.tracking_enabled AND te.open_count = 0 AND te.click_count = 0
                  AND te.sent_at <= CAST(:now AS timestamptz) - make_interval(hours => COALESCE(te.follow_up_hours, :defaultHours))
                  AND NOT EXISTS (SELECT 1 FROM alert a WHERE a.tracked_email_id = te.id AND a.type = 'FOLLOW_UP')
                """)
                .param("now", Sql.ts(now))
                .param("defaultHours", defaultHours)
                .query((rs, row) -> new FollowUpCandidate(
                        Sql.uuid(rs, "id"), Sql.instant(rs, "sent_at"), rs.getInt("hours"), rs.getInt("open_count"), rs.getInt("click_count")))
                .list();
    }

    /** Snoozed alerts whose time is up. They become NEW again. */
    List<UUID> reopenSnoozed(Instant now) {
        return jdbc.sql("""
                UPDATE alert SET status = 'NEW', snoozed_until = NULL
                WHERE status = 'SNOOZED' AND snoozed_until <= :now RETURNING id
                """)
                .param("now", Sql.ts(now))
                .query((rs, row) -> Sql.uuid(rs, "id"))
                .list();
    }

    List<AlertRow> list(boolean activeOnly, int limit, long offset) {
        return jdbc.sql(SELECT + (activeOnly ? " WHERE a.status IN ('NEW', 'SEEN')" : "")
                        + " ORDER BY a.created_at DESC, a.id LIMIT :limit OFFSET :offset")
                .param("limit", limit)
                .param("offset", offset)
                .query(AlertRepository::map)
                .list();
    }

    long count(boolean activeOnly) {
        return jdbc.sql("SELECT count(*) FROM alert" + (activeOnly ? " WHERE status IN ('NEW', 'SEEN')" : ""))
                .query(Long.class)
                .single();
    }

    long countNew() {
        return jdbc.sql("SELECT count(*) FROM alert WHERE status = 'NEW'").query(Long.class).single();
    }

    List<AlertService.AlertBrief> activeForEmail(UUID emailId) {
        return jdbc.sql("""
                SELECT type, details ->> 'text' AS text FROM alert
                WHERE tracked_email_id = :email AND status IN ('NEW', 'SEEN') ORDER BY created_at DESC, id
                """)
                .param("email", emailId)
                .query((rs, row) -> new AlertService.AlertBrief(AlertType.valueOf(rs.getString("type")), rs.getString("text")))
                .list();
    }

    Optional<AlertRow> find(UUID id) {
        return jdbc.sql(SELECT + " WHERE a.id = :id").param("id", id).query(AlertRepository::map).optional();
    }

    void updateStatus(UUID id, String status, Instant snoozedUntil) {
        jdbc.sql("UPDATE alert SET status = :status, snoozed_until = :until WHERE id = :id")
                .param("status", status)
                .param("until", Sql.ts(snoozedUntil))
                .param("id", id)
                .update();
    }

    private static AlertRow map(ResultSet rs, int row) throws SQLException {
        return new AlertRow(
                Sql.uuid(rs, "id"),
                rs.getString("type"),
                Sql.uuid(rs, "tracked_email_id"),
                Sql.instant(rs, "created_at"),
                rs.getString("status"),
                Sql.instant(rs, "snoozed_until"),
                rs.getString("text"),
                rs.getBytes("subject_enc"));
    }
}
