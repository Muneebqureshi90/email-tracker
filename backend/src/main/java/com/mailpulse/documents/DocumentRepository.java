package com.mailpulse.documents;

import com.mailpulse.common.Sql;
import com.mailpulse.emails.EmailStatus;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Documents, their (latest) files and their links. Counts come from the counted document events. */
@Repository
class DocumentRepository {

    record DocumentRow(
            UUID id,
            byte[] nameEnc,
            int sizeBytes,
            Integer pageCount,
            int version,
            Instant createdAt,
            Instant updatedAt,
            long views,
            long reads,
            long downloads,
            Instant lastActivityAt) {}

    record LinkRow(
            UUID id,
            UUID documentId,
            byte[] documentNameEnc,
            String token,
            UUID emailId,
            byte[] subjectEnc,
            byte[] labelEnc,
            boolean allowDownload,
            Instant expiresAt,
            Instant revokedAt,
            Instant createdAt,
            long views,
            long reads,
            long downloads,
            Instant lastActivityAt) {}

    /** A link as the public routes see it, with its document and (for an email link) the email's send state. */
    record PublicLink(
            UUID id,
            UUID documentId,
            String token,
            byte[] documentNameEnc,
            int sizeBytes,
            Integer pageCount,
            boolean allowDownload,
            Instant expiresAt,
            Instant revokedAt,
            UUID emailId,
            EmailStatus emailStatus,
            Instant sentAt,
            boolean trackingEnabled) {}

    private static final String COUNTS = """
            count(e.id) FILTER (WHERE e.type = 'DOC_VIEW') AS views,
            count(e.id) FILTER (WHERE e.type = 'DOC_READ') AS reads,
            count(e.id) FILTER (WHERE e.type = 'DOC_DOWNLOAD') AS downloads,
            max(e.received_at) AS last_activity_at
            """;

    private static final String DOCUMENTS = "SELECT d.id, d.name_enc, d.size_bytes, d.page_count, d.version, d.created_at, d.updated_at, "
            + COUNTS
            + " FROM document d LEFT JOIN document_link l ON l.document_id = d.id"
            + " LEFT JOIN document_event e ON e.link_id = l.id AND e.verdict = 'COUNTED'";

    private static final String LINKS = "SELECT l.id, l.document_id, d.name_enc AS document_name_enc, l.token, l.tracked_email_id,"
            + " te.subject_enc, l.label_enc, l.allow_download, l.expires_at, l.revoked_at, l.created_at, "
            + COUNTS
            + " FROM document_link l JOIN document d ON d.id = l.document_id"
            + " LEFT JOIN tracked_email te ON te.id = l.tracked_email_id"
            + " LEFT JOIN document_event e ON e.link_id = l.id AND e.verdict = 'COUNTED'";

    private static final String LINK_GROUP = " GROUP BY l.id, d.id, te.id";

    private final JdbcClient jdbc;

    DocumentRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Serializes uploads, so two at once cannot both pass the document limit. */
    void lockForInsert() {
        jdbc.sql("LOCK TABLE document IN SHARE ROW EXCLUSIVE MODE").update();
    }

    long count() {
        return jdbc.sql("SELECT count(*) FROM document").query(Long.class).single();
    }

    void insert(UUID id, byte[] nameEnc, int sizeBytes, Integer pageCount, Instant now) {
        jdbc.sql("""
                INSERT INTO document (id, name_enc, size_bytes, page_count, version, created_at, updated_at)
                VALUES (:id, :name, :size, :pages, 1, :now, :now)
                """)
                .param("id", id)
                .param("name", nameEnc)
                .param("size", sizeBytes)
                .param("pages", pageCount)
                .param("now", Sql.ts(now))
                .update();
    }

    void saveFile(UUID documentId, int version, byte[] contentEnc) {
        jdbc.sql("""
                INSERT INTO document_file (document_id, version, content_enc) VALUES (:id, :version, :content)
                ON CONFLICT (document_id) DO UPDATE SET version = EXCLUDED.version, content_enc = EXCLUDED.content_enc
                """)
                .param("id", documentId)
                .param("version", version)
                .param("content", contentEnc)
                .update();
    }

    Optional<byte[]> content(UUID documentId) {
        return jdbc.sql("SELECT content_enc FROM document_file WHERE document_id = :id")
                .param("id", documentId)
                .query((rs, row) -> rs.getBytes("content_enc"))
                .optional();
    }

    /** Locks the document row and returns its current version. */
    Optional<Integer> lockVersion(UUID id) {
        return jdbc.sql("SELECT version FROM document WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query(Integer.class)
                .optional();
    }

    void rename(UUID id, byte[] nameEnc, Instant now) {
        jdbc.sql("UPDATE document SET name_enc = :name, updated_at = :now WHERE id = :id")
                .param("name", nameEnc)
                .param("now", Sql.ts(now))
                .param("id", id)
                .update();
    }

    void newVersion(UUID id, int version, int sizeBytes, Integer pageCount, Instant now) {
        jdbc.sql("UPDATE document SET version = :version, size_bytes = :size, page_count = :pages, updated_at = :now WHERE id = :id")
                .param("version", version)
                .param("size", sizeBytes)
                .param("pages", pageCount)
                .param("now", Sql.ts(now))
                .param("id", id)
                .update();
    }

    boolean delete(UUID id) {
        return jdbc.sql("DELETE FROM document WHERE id = :id").param("id", id).update() > 0;
    }

    List<DocumentRow> list() {
        return jdbc.sql(DOCUMENTS + " GROUP BY d.id ORDER BY d.updated_at DESC, d.id").query(DocumentRepository::document).list();
    }

    Optional<DocumentRow> find(UUID id) {
        return jdbc.sql(DOCUMENTS + " WHERE d.id = :id GROUP BY d.id").param("id", id).query(DocumentRepository::document).optional();
    }

    List<DocumentRow> findByIds(List<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(DOCUMENTS + " WHERE d.id IN (:ids) GROUP BY d.id ORDER BY d.updated_at DESC, d.id")
                .param("ids", ids)
                .query(DocumentRepository::document)
                .list();
    }

    /** Ids and encrypted names of every document, newest first (quick search decrypts them in memory). */
    List<DocumentRow> names() {
        return jdbc.sql("SELECT id, name_enc FROM document ORDER BY updated_at DESC, id")
                .query((rs, row) -> new DocumentRow(Sql.uuid(rs, "id"), rs.getBytes("name_enc"), 0, null, 0, null, null, 0, 0, 0, null))
                .list();
    }

    /** Locks the email row (one link per email even when the extension retries), false when it does not exist. */
    boolean lockEmail(UUID emailId) {
        return jdbc.sql("SELECT id FROM tracked_email WHERE id = :id FOR UPDATE")
                .param("id", emailId)
                .query(UUID.class)
                .optional()
                .isPresent();
    }

    /** The newest link of this document for this email that still works (not revoked, not expired). */
    Optional<UUID> activeLinkFor(UUID documentId, UUID emailId, Instant now) {
        return jdbc.sql("""
                SELECT id FROM document_link
                WHERE document_id = :document AND tracked_email_id = :email AND revoked_at IS NULL
                  AND (expires_at IS NULL OR expires_at > :now)
                ORDER BY created_at DESC, id LIMIT 1
                """)
                .param("document", documentId)
                .param("email", emailId)
                .param("now", Sql.ts(now))
                .query(UUID.class)
                .optional();
    }

    void insertLink(UUID id, UUID documentId, String token, UUID emailId, byte[] labelEnc, boolean allowDownload, Instant expiresAt,
            Instant now) {
        jdbc.sql("""
                INSERT INTO document_link (id, document_id, token, tracked_email_id, label_enc, allow_download, expires_at, created_at)
                VALUES (:id, :document, :token, :email, :label, :download, :expires, :now)
                """)
                .param("id", id)
                .param("document", documentId)
                .param("token", token)
                .param("email", emailId)
                .param("label", labelEnc)
                .param("download", allowDownload)
                .param("expires", Sql.ts(expiresAt))
                .param("now", Sql.ts(now))
                .update();
    }

    void updateLink(UUID id, byte[] labelEnc, Instant expiresAt, boolean allowDownload, Instant revokedAt) {
        jdbc.sql("""
                UPDATE document_link SET label_enc = :label, expires_at = :expires, allow_download = :download, revoked_at = :revoked
                WHERE id = :id
                """)
                .param("label", labelEnc)
                .param("expires", Sql.ts(expiresAt))
                .param("download", allowDownload)
                .param("revoked", Sql.ts(revokedAt))
                .param("id", id)
                .update();
    }

    Optional<LinkRow> findLink(UUID id) {
        return jdbc.sql(LINKS + " WHERE l.id = :id" + LINK_GROUP).param("id", id).query(DocumentRepository::link).optional();
    }

    List<LinkRow> links(UUID documentId, int limit, long offset) {
        return jdbc.sql(LINKS + " WHERE l.document_id = :document" + LINK_GROUP + " ORDER BY l.created_at DESC, l.id LIMIT :limit OFFSET :offset")
                .param("document", documentId)
                .param("limit", limit)
                .param("offset", offset)
                .query(DocumentRepository::link)
                .list();
    }

    long countLinks(UUID documentId) {
        return jdbc.sql("SELECT count(*) FROM document_link WHERE document_id = :document")
                .param("document", documentId)
                .query(Long.class)
                .single();
    }

    List<LinkRow> linksForEmail(UUID emailId) {
        return jdbc.sql(LINKS + " WHERE l.tracked_email_id = :email" + LINK_GROUP + " ORDER BY l.created_at, l.id")
                .param("email", emailId)
                .query(DocumentRepository::link)
                .list();
    }

    Optional<PublicLink> findByToken(String token) {
        return jdbc.sql("""
                SELECT l.id, l.document_id, l.token, d.name_enc, d.size_bytes, d.page_count, l.allow_download, l.expires_at,
                       l.revoked_at, l.tracked_email_id, te.status, te.sent_at, te.tracking_enabled
                FROM document_link l
                JOIN document d ON d.id = l.document_id
                LEFT JOIN tracked_email te ON te.id = l.tracked_email_id
                WHERE l.token = :token
                """)
                .param("token", token)
                .query((rs, row) -> new PublicLink(
                        Sql.uuid(rs, "id"),
                        Sql.uuid(rs, "document_id"),
                        rs.getString("token"),
                        rs.getBytes("name_enc"),
                        rs.getInt("size_bytes"),
                        Sql.nullableInt(rs, "page_count"),
                        rs.getBoolean("allow_download"),
                        Sql.instant(rs, "expires_at"),
                        Sql.instant(rs, "revoked_at"),
                        Sql.uuid(rs, "tracked_email_id"),
                        rs.getString("status") == null ? null : EmailStatus.valueOf(rs.getString("status")),
                        Sql.instant(rs, "sent_at"),
                        rs.getObject("tracking_enabled") == null || rs.getBoolean("tracking_enabled")))
                .optional();
    }

    private static DocumentRow document(ResultSet rs, int row) throws SQLException {
        return new DocumentRow(
                Sql.uuid(rs, "id"),
                rs.getBytes("name_enc"),
                rs.getInt("size_bytes"),
                Sql.nullableInt(rs, "page_count"),
                rs.getInt("version"),
                Sql.instant(rs, "created_at"),
                Sql.instant(rs, "updated_at"),
                rs.getLong("views"),
                rs.getLong("reads"),
                rs.getLong("downloads"),
                Sql.instant(rs, "last_activity_at"));
    }

    private static LinkRow link(ResultSet rs, int row) throws SQLException {
        return new LinkRow(
                Sql.uuid(rs, "id"),
                Sql.uuid(rs, "document_id"),
                rs.getBytes("document_name_enc"),
                rs.getString("token"),
                Sql.uuid(rs, "tracked_email_id"),
                rs.getBytes("subject_enc"),
                rs.getBytes("label_enc"),
                rs.getBoolean("allow_download"),
                Sql.instant(rs, "expires_at"),
                Sql.instant(rs, "revoked_at"),
                Sql.instant(rs, "created_at"),
                rs.getLong("views"),
                rs.getLong("reads"),
                rs.getLong("downloads"),
                Sql.instant(rs, "last_activity_at"));
    }
}
