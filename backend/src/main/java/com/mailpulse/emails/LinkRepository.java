package com.mailpulse.emails;

import com.mailpulse.common.RandomTokens;
import com.mailpulse.common.Sql;
import com.mailpulse.common.crypto.BlindIndex;
import com.mailpulse.common.crypto.FieldCipher;
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

/** Tracked links. Original URLs are encrypted; a blind index keeps one row per email and URL. */
@Repository
public class LinkRepository {

    static final String URL_COLUMN = "tracked_link.url";
    private static final String URL_INDEX = "link-url";

    public record LinkTarget(UUID linkId, UUID emailId, String url, boolean trackingEnabled) {}

    record StoredLink(UUID id, String token) {}

    private final JdbcClient jdbc;
    private final FieldCipher cipher;
    private final BlindIndex index;

    LinkRepository(JdbcClient jdbc, FieldCipher cipher, BlindIndex index) {
        this.jdbc = jdbc;
        this.cipher = cipher;
        this.index = index;
    }

    StoredLink findOrCreate(UUID emailId, String url, Instant now) {
        byte[] hash = index.of(URL_INDEX, url);
        jdbc.sql("""
                INSERT INTO tracked_link (id, tracked_email_id, token, url_enc, url_hash, created_at)
                VALUES (:id, :email, :token, :enc, :hash, :now)
                ON CONFLICT (tracked_email_id, url_hash) DO NOTHING
                """)
                .param("id", UUID.randomUUID())
                .param("email", emailId)
                .param("token", RandomTokens.trackingToken())
                .param("enc", cipher.encrypt(url, URL_COLUMN))
                .param("hash", hash)
                .param("now", Sql.ts(now))
                .update();
        return jdbc.sql("SELECT id, token FROM tracked_link WHERE tracked_email_id = :email AND url_hash = :hash")
                .param("email", emailId)
                .param("hash", hash)
                .query((rs, row) -> new StoredLink(Sql.uuid(rs, "id"), rs.getString("token")))
                .single();
    }

    public Optional<LinkTarget> findTarget(String token) {
        return jdbc.sql("""
                SELECT tl.id, tl.tracked_email_id, tl.url_enc, te.tracking_enabled
                FROM tracked_link tl JOIN tracked_email te ON te.id = tl.tracked_email_id
                WHERE tl.token = :token
                """)
                .param("token", token)
                .query((rs, row) -> new LinkTarget(
                        Sql.uuid(rs, "id"),
                        Sql.uuid(rs, "tracked_email_id"),
                        cipher.decrypt(rs.getBytes("url_enc"), URL_COLUMN),
                        rs.getBoolean("tracking_enabled")))
                .optional();
    }

    List<EmailApi.LinkView> findForEmail(UUID emailId) {
        return jdbc.sql("""
                SELECT id, url_enc, used, click_count, first_clicked_at, last_clicked_at
                FROM tracked_link WHERE tracked_email_id = :email ORDER BY created_at
                """)
                .param("email", emailId)
                .query((rs, row) -> new EmailApi.LinkView(
                        Sql.uuid(rs, "id"),
                        cipher.decrypt(rs.getBytes("url_enc"), URL_COLUMN),
                        rs.getBoolean("used"),
                        rs.getInt("click_count"),
                        Sql.instant(rs, "first_clicked_at"),
                        Sql.instant(rs, "last_clicked_at")))
                .list();
    }

    /** All links of all emails, grouped by email (data export). */
    public Map<UUID, List<EmailApi.LinkView>> findAllByEmail() {
        Map<UUID, List<EmailApi.LinkView>> result = new LinkedHashMap<>();
        jdbc.sql("SELECT * FROM tracked_link ORDER BY tracked_email_id, created_at").query(rs -> {
            result.computeIfAbsent(Sql.uuid(rs, "tracked_email_id"), id -> new ArrayList<>()).add(new EmailApi.LinkView(
                    Sql.uuid(rs, "id"),
                    cipher.decrypt(rs.getBytes("url_enc"), URL_COLUMN),
                    rs.getBoolean("used"),
                    rs.getInt("click_count"),
                    Sql.instant(rs, "first_clicked_at"),
                    Sql.instant(rs, "last_clicked_at")));
        });
        return result;
    }

    public Optional<String> url(UUID linkId) {
        return jdbc.sql("SELECT url_enc FROM tracked_link WHERE id = :id")
                .param("id", linkId)
                .query((rs, row) -> cipher.decrypt(rs.getBytes("url_enc"), URL_COLUMN))
                .optional();
    }

    void setUsed(UUID emailId, Collection<UUID> usedIds) {
        jdbc.sql("UPDATE tracked_link SET used = FALSE WHERE tracked_email_id = :email").param("email", emailId).update();
        if (!usedIds.isEmpty()) {
            jdbc.sql("UPDATE tracked_link SET used = TRUE WHERE tracked_email_id = :email AND id IN (:ids)")
                    .param("email", emailId)
                    .param("ids", usedIds)
                    .update();
        }
    }

    public void countClick(UUID linkId, Instant at) {
        jdbc.sql("""
                UPDATE tracked_link SET click_count = click_count + 1,
                    first_clicked_at = COALESCE(first_clicked_at, :at),
                    last_clicked_at = GREATEST(COALESCE(last_clicked_at, :at), :at)
                WHERE id = :id
                """)
                .param("at", Sql.ts(at))
                .param("id", linkId)
                .update();
    }
}
