package com.mailpulse.documents;

import com.mailpulse.common.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Viewer pages (views), and the views, reads and downloads they count. */
@Repository
class DocumentEventRepository {

    record ViewRow(long id, Long mergedInto, boolean counted, Instant firstBeatAt, long ownMs, long visibleMs, Instant readAt) {}

    /** The n-th counted event of a sequence, and when the one before it happened. */
    record Seq(int number, Instant previousAt) {}

    record NewEvent(
            UUID linkId,
            Long viewId,
            String type,
            Instant at,
            String method,
            String userAgent,
            String ipPrefix,
            String source,
            String sourceKey,
            String reason,
            Seq seq) {

        boolean counted() {
            return reason == null;
        }
    }

    record EventRow(
            long id,
            UUID linkId,
            String type,
            Instant at,
            String verdict,
            String reason,
            String source,
            String userAgent,
            String ipPrefix,
            Long visibleMs,
            Integer pagesViewed) {}

    private static final String VIEW = "SELECT id, merged_into, counted, first_beat_at, own_ms, visible_ms, read_at FROM document_view";
    private static final String EVENTS = """
            SELECT e.id, e.link_id, e.type, e.received_at, e.verdict, e.reason, e.source, e.user_agent, e.ip_prefix,
                   v.visible_ms, cardinality(v.pages_viewed) AS pages_viewed
            FROM document_event e JOIN document_link l ON l.id = e.link_id LEFT JOIN document_view v ON v.id = e.view_id
            """;

    private final JdbcClient jdbc;

    DocumentEventRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Every view, read and download of one link is decided under this lock, one at a time. */
    void lockLink(UUID linkId) {
        jdbc.sql("SELECT id FROM document_link WHERE id = :id FOR UPDATE").param("id", linkId).query(UUID.class).optional();
    }

    Optional<ViewRow> findView(UUID linkId, UUID viewUuid) {
        return jdbc.sql(VIEW + " WHERE link_id = :link AND view_uuid = :view")
                .param("link", linkId)
                .param("view", viewUuid)
                .query(DocumentEventRepository::view)
                .optional();
    }

    Optional<ViewRow> view(long id) {
        return jdbc.sql(VIEW + " WHERE id = :id").param("id", id).query(DocumentEventRepository::view).optional();
    }

    /** The latest view of this link from the same reader that was still going on at {@code since} or later. */
    Optional<ViewRow> recentView(UUID linkId, String sourceKey, Instant since) {
        return jdbc.sql(VIEW + """
                 WHERE link_id = :link AND source_key = :key AND merged_into IS NULL AND last_beat_at >= :since
                 ORDER BY last_beat_at DESC, id DESC LIMIT 1
                """)
                .param("link", linkId)
                .param("key", sourceKey)
                .param("since", Sql.ts(since))
                .query(DocumentEventRepository::view)
                .optional();
    }

    long insertView(UUID linkId, UUID viewUuid, Long mergedInto, String sourceKey, boolean counted, Instant now) {
        return jdbc.sql("""
                INSERT INTO document_view (link_id, view_uuid, merged_into, source_key, counted, first_beat_at, last_beat_at)
                VALUES (:link, :view, :merged, :key, :counted, :now, :now) RETURNING id
                """)
                .param("link", linkId)
                .param("view", viewUuid)
                .param("merged", mergedInto)
                .param("key", sourceKey)
                .param("counted", counted)
                .param("now", Sql.ts(now))
                .query(Long.class)
                .single();
    }

    /**
     * Adds accepted visible time: to the page's own guard total and to the view it belongs to, which also
     * collects the pages seen and the latest page count.
     *
     * @param pages a PostgreSQL int array literal of validated page numbers, for example "{1,2}"
     */
    void addTime(long ownId, long viewId, long acceptedMs, String pages, int pageCount, Instant now) {
        jdbc.sql("UPDATE document_view SET own_ms = own_ms + :ms, last_beat_at = GREATEST(last_beat_at, :now) WHERE id = :id")
                .param("ms", acceptedMs)
                .param("now", Sql.ts(now))
                .param("id", ownId)
                .update();
        jdbc.sql("""
                UPDATE document_view SET visible_ms = visible_ms + :ms, last_beat_at = GREATEST(last_beat_at, :now),
                    pages_viewed = ARRAY(SELECT DISTINCT p FROM unnest(pages_viewed || CAST(:pages AS int[])) AS p ORDER BY p),
                    page_count = :pageCount
                WHERE id = :id
                """)
                .param("ms", acceptedMs)
                .param("now", Sql.ts(now))
                .param("pages", pages)
                .param("pageCount", pageCount)
                .param("id", viewId)
                .update();
    }

    void markRead(long viewId, Instant now) {
        jdbc.sql("UPDATE document_view SET read_at = :now WHERE id = :id").param("now", Sql.ts(now)).param("id", viewId).update();
    }

    long insertEvent(NewEvent event) {
        return jdbc.sql("""
                INSERT INTO document_event (link_id, view_id, type, received_at, http_method, user_agent, ip_prefix, source,
                    source_key, verdict, reason, seq_number, seq_previous_at)
                VALUES (:link, :view, :type, :at, :method, :userAgent, :ipPrefix, :source, :sourceKey, :verdict, :reason,
                    :number, :previous)
                RETURNING id
                """)
                .param("link", event.linkId())
                .param("view", event.viewId())
                .param("type", event.type())
                .param("at", Sql.ts(event.at()))
                .param("method", event.method())
                .param("userAgent", event.userAgent())
                .param("ipPrefix", event.ipPrefix())
                .param("source", event.source())
                .param("sourceKey", event.sourceKey())
                .param("verdict", event.counted() ? "COUNTED" : "IGNORED")
                .param("reason", event.reason())
                .param("number", event.seq() == null ? null : event.seq().number())
                .param("previous", event.seq() == null ? null : Sql.ts(event.seq().previousAt()))
                .query(Long.class)
                .single();
    }

    /** The number and predecessor the next counted event of this type on the link gets (call under the link lock). */
    Seq next(UUID linkId, String type) {
        return jdbc.sql("""
                SELECT count(*) AS n, max(received_at) AS last FROM document_event
                WHERE link_id = :link AND type = :type AND verdict = 'COUNTED'
                """)
                .param("link", linkId)
                .param("type", type)
                .query((rs, row) -> new Seq(rs.getInt("n") + 1, Sql.instant(rs, "last")))
                .single();
    }

    /** The sequence of the counted view a read belongs to. */
    Seq viewSeq(long viewId) {
        return jdbc.sql("""
                SELECT seq_number, seq_previous_at FROM document_event
                WHERE view_id = :view AND type = 'DOC_VIEW' AND verdict = 'COUNTED' ORDER BY id LIMIT 1
                """)
                .param("view", viewId)
                .query((rs, row) -> new Seq(rs.getInt("seq_number"), Sql.instant(rs, "seq_previous_at")))
                .optional()
                .orElse(null);
    }

    boolean countedDuplicate(UUID linkId, String type, String sourceKey, Instant from, Instant to) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM document_event WHERE link_id = :link AND type = :type AND verdict = 'COUNTED'
                    AND source_key = :key AND received_at BETWEEN :from AND :to)
                """)
                .param("link", linkId)
                .param("type", type)
                .param("key", sourceKey)
                .param("from", Sql.ts(from))
                .param("to", Sql.ts(to))
                .query(Boolean.class)
                .single();
    }

    /** Events of every link of a document, newest first. */
    List<EventRow> forDocument(UUID documentId, int limit, long offset) {
        return jdbc.sql(EVENTS + " WHERE l.document_id = :document ORDER BY e.received_at DESC, e.id DESC LIMIT :limit OFFSET :offset")
                .param("document", documentId)
                .param("limit", limit)
                .param("offset", offset)
                .query(DocumentEventRepository::event)
                .list();
    }

    long countForDocument(UUID documentId) {
        return jdbc.sql("SELECT count(*) FROM document_event e JOIN document_link l ON l.id = e.link_id WHERE l.document_id = :document")
                .param("document", documentId)
                .query(Long.class)
                .single();
    }

    /** Events of the document links of one email, newest first. */
    List<EventRow> forEmail(UUID emailId, int limit) {
        return jdbc.sql(EVENTS + " WHERE l.tracked_email_id = :email ORDER BY e.received_at DESC, e.id DESC LIMIT :limit")
                .param("email", emailId)
                .param("limit", limit)
                .query(DocumentEventRepository::event)
                .list();
    }

    /** Counted document views per email, for the Gmail marks. */
    Map<UUID, Integer> countedViewsByEmail(Collection<UUID> emailIds) {
        Map<UUID, Integer> result = new LinkedHashMap<>();
        if (emailIds.isEmpty()) {
            return result;
        }
        jdbc.sql("""
                SELECT l.tracked_email_id, count(*) AS views FROM document_event e JOIN document_link l ON l.id = e.link_id
                WHERE l.tracked_email_id IN (:ids) AND e.type = 'DOC_VIEW' AND e.verdict = 'COUNTED' GROUP BY l.tracked_email_id
                """)
                .param("ids", emailIds)
                .query(rs -> {
                    result.put(Sql.uuid(rs, "tracked_email_id"), rs.getInt("views"));
                });
        return result;
    }

    /** Retention: views that ended before the cutoff (with their reads) and older downloads. */
    int deleteOlderThan(Instant cutoff) {
        int views = jdbc.sql("DELETE FROM document_view WHERE merged_into IS NULL AND last_beat_at < :cutoff")
                .param("cutoff", Sql.ts(cutoff))
                .update();
        int events = jdbc.sql("DELETE FROM document_event WHERE received_at < :cutoff")
                .param("cutoff", Sql.ts(cutoff))
                .update();
        return views + events;
    }

    private static ViewRow view(ResultSet rs, int row) throws SQLException {
        long merged = rs.getLong("merged_into");
        Long mergedInto = rs.wasNull() ? null : merged;  // read wasNull() before any other column
        return new ViewRow(
                rs.getLong("id"),
                mergedInto,
                rs.getBoolean("counted"),
                Sql.instant(rs, "first_beat_at"),
                rs.getLong("own_ms"),
                rs.getLong("visible_ms"),
                Sql.instant(rs, "read_at"));
    }

    private static EventRow event(ResultSet rs, int row) throws SQLException {
        long visible = rs.getLong("visible_ms");
        Long visibleMs = rs.wasNull() ? null : visible;
        return new EventRow(
                rs.getLong("id"),
                Sql.uuid(rs, "link_id"),
                rs.getString("type"),
                Sql.instant(rs, "received_at"),
                rs.getString("verdict"),
                rs.getString("reason"),
                rs.getString("source"),
                rs.getString("user_agent"),
                rs.getString("ip_prefix"),
                visibleMs,
                Sql.nullableInt(rs, "pages_viewed"));
    }
}
