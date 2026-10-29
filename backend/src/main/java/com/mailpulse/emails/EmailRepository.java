package com.mailpulse.emails;

import com.mailpulse.common.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class EmailRepository {

    public record EmailRow(
            UUID id,
            UUID accountId,
            byte[] accountEnc,
            UUID clientRef,
            EmailStatus status,
            byte[] subjectEnc,
            boolean trackOpens,
            boolean trackLinks,
            boolean trackingEnabled,
            boolean notifications,
            Integer followUpHours,
            boolean openStatusUnreliable,
            String gmailMessageId,
            String gmailThreadId,
            Instant createdAt,
            Instant sentAt,
            Instant cancelledAt,
            int openCount,
            int clickCount,
            Instant firstOpenedAt,
            Instant lastOpenedAt,
            Instant lastClickedAt) {}

    /** Filters for the email list. Null fields are not applied. */
    public record ListFilter(String state, UUID accountId, Instant from, Instant to) {}

    private static final String SELECT = """
            SELECT te.*, ga.address_enc AS account_enc
            FROM tracked_email te JOIN gmail_account ga ON ga.id = te.gmail_account_id
            """;

    private final JdbcClient jdbc;

    EmailRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<EmailRow> find(UUID id) {
        return jdbc.sql(SELECT + " WHERE te.id = :id").param("id", id).query(EmailRepository::map).optional();
    }

    public List<EmailRow> findByIds(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(SELECT + " WHERE te.id IN (:ids) ORDER BY te.sent_at DESC NULLS LAST, te.created_at DESC")
                .param("ids", ids)
                .query(EmailRepository::map)
                .list();
    }

    /** Every stored email, oldest first (data export). */
    public List<EmailRow> findAll() {
        return jdbc.sql(SELECT + " ORDER BY te.created_at, te.id").query(EmailRepository::map).list();
    }

    Optional<EmailRow> findByClientRef(UUID clientRef) {
        return jdbc.sql(SELECT + " WHERE te.client_ref = :ref").param("ref", clientRef).query(EmailRepository::map).optional();
    }

    Optional<EmailRow> findByPixelToken(String token) {
        return jdbc.sql(SELECT + " JOIN tracking_token tt ON tt.tracked_email_id = te.id WHERE tt.token = :token")
                .param("token", token)
                .query(EmailRepository::map)
                .optional();
    }

    void insert(UUID id, UUID accountId, UUID clientRef, boolean trackOpens, boolean trackLinks, Instant now) {
        jdbc.sql("""
                INSERT INTO tracked_email (id, gmail_account_id, client_ref, status, track_opens, track_links, created_at)
                VALUES (:id, :account, :ref, 'DRAFT', :opens, :links, :now)
                """)
                .param("id", id)
                .param("account", accountId)
                .param("ref", clientRef)
                .param("opens", trackOpens)
                .param("links", trackLinks)
                .param("now", Sql.ts(now))
                .update();
    }

    void insertPixelToken(String token, UUID emailId, Instant now) {
        jdbc.sql("INSERT INTO tracking_token (token, tracked_email_id, kind, created_at) VALUES (:token, :email, 'PIXEL', :now)")
                .param("token", token)
                .param("email", emailId)
                .param("now", Sql.ts(now))
                .update();
    }

    Optional<String> pixelToken(UUID emailId) {
        return jdbc.sql("SELECT token FROM tracking_token WHERE tracked_email_id = :email AND kind = 'PIXEL' ORDER BY created_at LIMIT 1")
                .param("email", emailId)
                .query(String.class)
                .optional();
    }

    void saveSendState(
            UUID id,
            EmailStatus status,
            Instant sentAt,
            Instant cancelledAt,
            String messageId,
            String threadId,
            byte[] subjectEnc,
            boolean openStatusUnreliable) {
        jdbc.sql("""
                UPDATE tracked_email SET status = :status, sent_at = :sentAt, cancelled_at = :cancelledAt,
                    gmail_message_id = :messageId, gmail_thread_id = :threadId, subject_enc = :subject,
                    open_status_unreliable = :unreliable
                WHERE id = :id
                """)
                .param("status", status.name())
                .param("sentAt", Sql.ts(sentAt))
                .param("cancelledAt", Sql.ts(cancelledAt))
                .param("messageId", messageId)
                .param("threadId", threadId)
                .param("subject", subjectEnc)
                .param("unreliable", openStatusUnreliable)
                .param("id", id)
                .update();
    }

    void updatePreferences(UUID id, boolean notify, Integer followUpHours, boolean trackingEnabled, boolean trackLinks) {
        jdbc.sql("""
                UPDATE tracked_email SET notify = :notify, follow_up_hours = :followUp, tracking_enabled = :enabled,
                    track_links = :links WHERE id = :id
                """)
                .param("notify", notify)
                .param("followUp", followUpHours)
                .param("enabled", trackingEnabled)
                .param("links", trackLinks)
                .param("id", id)
                .update();
    }

    /** A counted open; also proves the email went out (DECISIONS D-027). */
    public void countOpen(UUID id, Instant at) {
        jdbc.sql("""
                UPDATE tracked_email SET open_count = open_count + 1,
                    first_opened_at = COALESCE(first_opened_at, :at),
                    last_opened_at = GREATEST(COALESCE(last_opened_at, :at), :at),
                    status = 'SENT', sent_at = COALESCE(sent_at, :at), cancelled_at = NULL
                WHERE id = :id
                """)
                .param("at", Sql.ts(at))
                .param("id", id)
                .update();
    }

    public void countClick(UUID id, Instant at) {
        jdbc.sql("""
                UPDATE tracked_email SET click_count = click_count + 1,
                    last_clicked_at = GREATEST(COALESCE(last_clicked_at, :at), :at),
                    status = 'SENT', sent_at = COALESCE(sent_at, :at), cancelled_at = NULL
                WHERE id = :id
                """)
                .param("at", Sql.ts(at))
                .param("id", id)
                .update();
    }

    List<EmailRow> list(ListFilter filter, int limit, long offset) {
        Query query = where(filter);
        return jdbc.sql(SELECT + query.sql + " ORDER BY te.sent_at DESC NULLS LAST, te.created_at DESC LIMIT :limit OFFSET :offset")
                .params(query.params)
                .param("limit", limit)
                .param("offset", offset)
                .query(EmailRepository::map)
                .list();
    }

    long count(ListFilter filter) {
        Query query = where(filter);
        return jdbc.sql("SELECT count(*) FROM tracked_email te" + query.sql).params(query.params).query(Long.class).single();
    }

    /** Latest tracked email per Gmail thread (or message) for one account. */
    List<EmailRow> latestByGmailIds(UUID accountId, String column, List<String> ids) {
        if (!column.equals("gmail_thread_id") && !column.equals("gmail_message_id")) {
            throw new IllegalArgumentException("Unsupported column");
        }
        return jdbc.sql(SELECT.replace("SELECT te.*", "SELECT DISTINCT ON (te." + column + ") te.*")
                        + " WHERE te.gmail_account_id = :account AND te." + column + " IN (:ids)"
                        + " AND te.status IN ('SENT', 'SCHEDULED')"
                        + " ORDER BY te." + column + ", te.sent_at DESC NULLS LAST, te.created_at DESC")
                .param("account", accountId)
                .param("ids", ids)
                .query(EmailRepository::map)
                .list();
    }

    public int deleteStaleDrafts(Instant createdBefore) {
        return jdbc.sql("""
                DELETE FROM tracked_email te WHERE te.status = 'DRAFT' AND te.created_at < :before
                  AND NOT EXISTS (SELECT 1 FROM tracking_event ev WHERE ev.tracked_email_id = te.id)
                """)
                .param("before", Sql.ts(createdBefore))
                .update();
    }

    public int deleteOlderThan(Instant cutoff) {
        return jdbc.sql("DELETE FROM tracked_email WHERE COALESCE(sent_at, created_at) < :cutoff")
                .param("cutoff", Sql.ts(cutoff))
                .update();
    }

    private record Query(String sql, Map<String, Object> params) {}

    private static Query where(ListFilter filter) {
        List<String> conditions = new ArrayList<>(List.of("te.status IN ('SENT', 'SCHEDULED')"));
        Map<String, Object> params = new LinkedHashMap<>();
        if (filter.state() != null) {
            switch (filter.state()) {
                case "opened" -> conditions.add("te.open_count > 0");
                case "not_opened" -> conditions.add("te.open_count = 0 AND te.click_count = 0");
                case "clicked" -> conditions.add("te.click_count > 0");
                default -> throw new IllegalArgumentException("Unknown state filter");
            }
        }
        if (filter.accountId() != null) {
            conditions.add("te.gmail_account_id = :accountId");
            params.put("accountId", filter.accountId());
        }
        if (filter.from() != null) {
            conditions.add("COALESCE(te.sent_at, te.created_at) >= :from");
            params.put("from", Sql.ts(filter.from()));
        }
        if (filter.to() != null) {
            conditions.add("COALESCE(te.sent_at, te.created_at) < :to");
            params.put("to", Sql.ts(filter.to()));
        }
        return new Query(" WHERE " + String.join(" AND ", conditions), params);
    }

    private static EmailRow map(ResultSet rs, int row) throws SQLException {
        return new EmailRow(
                Sql.uuid(rs, "id"),
                Sql.uuid(rs, "gmail_account_id"),
                rs.getBytes("account_enc"),
                Sql.uuid(rs, "client_ref"),
                EmailStatus.valueOf(rs.getString("status")),
                rs.getBytes("subject_enc"),
                rs.getBoolean("track_opens"),
                rs.getBoolean("track_links"),
                rs.getBoolean("tracking_enabled"),
                rs.getBoolean("notify"),
                Sql.nullableInt(rs, "follow_up_hours"),
                rs.getBoolean("open_status_unreliable"),
                rs.getString("gmail_message_id"),
                rs.getString("gmail_thread_id"),
                Sql.instant(rs, "created_at"),
                Sql.instant(rs, "sent_at"),
                Sql.instant(rs, "cancelled_at"),
                rs.getInt("open_count"),
                rs.getInt("click_count"),
                Sql.instant(rs, "first_opened_at"),
                Sql.instant(rs, "last_opened_at"),
                Sql.instant(rs, "last_clicked_at"));
    }
}
