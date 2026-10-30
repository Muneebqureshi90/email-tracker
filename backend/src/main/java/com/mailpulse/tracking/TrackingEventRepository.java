package com.mailpulse.tracking;

import com.mailpulse.common.Sql;
import com.mailpulse.emails.EmailApi;
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
public class TrackingEventRepository {

    record PixelTarget(UUID emailId, boolean trackingEnabled) {}

    record NewEvent(
            UUID emailId,
            UUID linkId,
            EventType type,
            Instant receivedAt,
            String method,
            String userAgent,
            String ipPrefix,
            Source source,
            String sourceKey,
            Verdict verdict,
            Reason reason,
            Instant decidedAt) {}

    record PendingEvent(long id, UUID emailId, UUID linkId, EventType type, Instant receivedAt, Source source, String sourceKey) {}

    private final JdbcClient jdbc;

    TrackingEventRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    Optional<PixelTarget> findPixelTarget(String token) {
        return jdbc.sql("""
                SELECT tt.tracked_email_id, te.tracking_enabled
                FROM tracking_token tt JOIN tracked_email te ON te.id = tt.tracked_email_id
                WHERE tt.token = :token
                """)
                .param("token", token)
                .query((rs, row) -> new PixelTarget(Sql.uuid(rs, "tracked_email_id"), rs.getBoolean("tracking_enabled")))
                .optional();
    }

    long insert(NewEvent event) {
        return jdbc.sql("""
                INSERT INTO tracking_event (tracked_email_id, tracked_link_id, type, received_at, http_method, user_agent,
                    ip_prefix, source, source_key, verdict, reason, decided_at)
                VALUES (:email, :link, :type, :receivedAt, :method, :userAgent, :ipPrefix, :source, :sourceKey,
                    :verdict, :reason, :decidedAt)
                RETURNING id
                """)
                .param("email", event.emailId())
                .param("link", event.linkId())
                .param("type", event.type().name())
                .param("receivedAt", Sql.ts(event.receivedAt()))
                .param("method", event.method())
                .param("userAgent", event.userAgent())
                .param("ipPrefix", event.ipPrefix())
                .param("source", event.source().name())
                .param("sourceKey", event.sourceKey())
                .param("verdict", event.verdict().name())
                .param("reason", event.reason() == null ? null : event.reason().name())
                .param("decidedAt", Sql.ts(event.decidedAt()))
                .query(Long.class)
                .single();
    }

    /** Pending events old enough to decide, locked so two finalizers can never decide the same event. */
    List<PendingEvent> lockPending(Instant receivedBefore, int limit) {
        return jdbc.sql("""
                SELECT id, tracked_email_id, tracked_link_id, type, received_at, source, source_key
                FROM tracking_event WHERE verdict = 'PENDING' AND received_at <= :before
                ORDER BY received_at, id LIMIT :limit FOR UPDATE SKIP LOCKED
                """)
                .param("before", Sql.ts(receivedBefore))
                .param("limit", limit)
                .query((rs, row) -> new PendingEvent(
                        rs.getLong("id"),
                        Sql.uuid(rs, "tracked_email_id"),
                        Sql.uuid(rs, "tracked_link_id"),
                        EventType.valueOf(rs.getString("type")),
                        Sql.instant(rs, "received_at"),
                        Source.valueOf(rs.getString("source")),
                        rs.getString("source_key")))
                .list();
    }

    boolean countedDuplicateExists(PendingEvent event, Instant windowStart) {
        String linkCondition = event.linkId() == null ? "" : " AND tracked_link_id = :link";
        var spec = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM tracking_event WHERE tracked_email_id = :email AND type = :type
                    AND verdict = 'COUNTED' AND source_key = :sourceKey AND received_at BETWEEN :from AND :to
                """ + linkCondition + ")")
                .param("email", event.emailId())
                .param("type", event.type().name())
                .param("sourceKey", event.sourceKey())
                .param("from", Sql.ts(windowStart))
                .param("to", Sql.ts(event.receivedAt()));
        if (event.linkId() != null) {
            spec = spec.param("link", event.linkId());
        }
        return spec.query(Boolean.class).single();
    }

    /** Different links of one email clicked between two instants, whatever their verdict. */
    int distinctLinksClicked(UUID emailId, Instant from, Instant to) {
        return jdbc.sql("""
                SELECT count(DISTINCT tracked_link_id) FROM tracking_event
                WHERE tracked_email_id = :email AND type = 'CLICK' AND received_at BETWEEN :from AND :to
                """)
                .param("email", emailId)
                .param("from", Sql.ts(from))
                .param("to", Sql.ts(to))
                .query(Integer.class)
                .single();
    }

    void markIgnored(long id, Reason reason, Instant now) {
        jdbc.sql("UPDATE tracking_event SET verdict = 'IGNORED', reason = :reason, decided_at = :now WHERE id = :id")
                .param("reason", reason.name())
                .param("now", Sql.ts(now))
                .param("id", id)
                .update();
    }

    void markCounted(long id, Instant now) {
        jdbc.sql("UPDATE tracking_event SET verdict = 'COUNTED', decided_at = :now WHERE id = :id")
                .param("now", Sql.ts(now))
                .param("id", id)
                .update();
    }

    /** Every event of every email, grouped by email (data export). */
    public Map<UUID, List<EmailApi.EventView>> findAllByEmail() {
        Map<UUID, List<EmailApi.EventView>> result = new LinkedHashMap<>();
        jdbc.sql("SELECT * FROM tracking_event ORDER BY tracked_email_id, received_at, id").query(rs -> {
            result.computeIfAbsent(Sql.uuid(rs, "tracked_email_id"), id -> new ArrayList<>()).add(eventView(rs));
        });
        return result;
    }

    /** Up to {@code perEmail} latest counted open times per email, newest first. */
    public Map<UUID, List<Instant>> latestCountedOpens(Collection<UUID> emailIds, int perEmail) {
        Map<UUID, List<Instant>> result = new LinkedHashMap<>();
        if (emailIds.isEmpty()) {
            return result;
        }
        jdbc.sql("""
                SELECT tracked_email_id, received_at FROM (
                    SELECT tracked_email_id, received_at,
                           row_number() OVER (PARTITION BY tracked_email_id ORDER BY received_at DESC, id DESC) AS n
                    FROM tracking_event WHERE tracked_email_id IN (:ids) AND type = 'OPEN' AND verdict = 'COUNTED'
                ) latest WHERE n <= :perEmail ORDER BY tracked_email_id, received_at DESC
                """)
                .param("ids", emailIds)
                .param("perEmail", perEmail)
                .query(rs -> {
                    result.computeIfAbsent(Sql.uuid(rs, "tracked_email_id"), id -> new ArrayList<>()).add(Sql.instant(rs, "received_at"));
                });
        return result;
    }

    /** Every counted open of an email, oldest first. */
    public List<EmailApi.OpenView> countedOpens(UUID emailId) {
        return jdbc.sql("""
                SELECT id, received_at, source FROM tracking_event
                WHERE tracked_email_id = :email AND type = 'OPEN' AND verdict = 'COUNTED' ORDER BY received_at, id
                """)
                .param("email", emailId)
                .query((rs, row) -> new EmailApi.OpenView(rs.getLong("id"), Sql.instant(rs, "received_at"), rs.getString("source")))
                .list();
    }

    /** Events of an email, newest first. */
    public List<EmailApi.EventView> findForEmail(UUID emailId, int limit, long offset) {
        return jdbc.sql("""
                SELECT id, type, received_at, verdict, reason, source, tracked_link_id, user_agent, ip_prefix
                FROM tracking_event WHERE tracked_email_id = :email ORDER BY received_at DESC, id DESC
                LIMIT :limit OFFSET :offset
                """)
                .param("email", emailId)
                .param("limit", limit)
                .param("offset", offset)
                .query((rs, row) -> eventView(rs))
                .list();
    }

    public long countForEmail(UUID emailId) {
        return jdbc.sql("SELECT count(*) FROM tracking_event WHERE tracked_email_id = :email")
                .param("email", emailId)
                .query(Long.class)
                .single();
    }

    private static EmailApi.EventView eventView(ResultSet rs) throws SQLException {
        return new EmailApi.EventView(
                rs.getLong("id"),
                rs.getString("type"),
                Sql.instant(rs, "received_at"),
                rs.getString("verdict"),
                rs.getString("reason"),
                rs.getString("source"),
                Sql.uuid(rs, "tracked_link_id"),
                rs.getString("user_agent"),
                rs.getString("ip_prefix"));
    }
}
