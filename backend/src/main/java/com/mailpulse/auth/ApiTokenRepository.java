package com.mailpulse.auth;

import com.mailpulse.common.Sql;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class ApiTokenRepository {

    record ApiTokenRow(UUID id, String name, String prefix, Instant createdAt, Instant lastUsedAt, Instant revokedAt) {}

    record ActiveToken(UUID id, Instant lastUsedAt) {}

    private final JdbcClient jdbc;

    ApiTokenRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    void insert(UUID id, String name, byte[] hash, String prefix, Instant now) {
        jdbc.sql("""
                INSERT INTO api_token (id, name, token_hash, token_prefix, scope, created_at)
                VALUES (:id, :name, :hash, :prefix, 'EXTENSION', :now)
                """)
                .param("id", id)
                .param("name", name)
                .param("hash", hash)
                .param("prefix", prefix)
                .param("now", Sql.ts(now))
                .update();
    }

    Optional<ActiveToken> findActiveByHash(byte[] hash) {
        return jdbc.sql("SELECT id, last_used_at FROM api_token WHERE token_hash = :hash AND revoked_at IS NULL")
                .param("hash", hash)
                .query((rs, row) -> new ActiveToken(Sql.uuid(rs, "id"), Sql.instant(rs, "last_used_at")))
                .optional();
    }

    void touch(UUID id, Instant now) {
        jdbc.sql("UPDATE api_token SET last_used_at = :now WHERE id = :id").param("now", Sql.ts(now)).param("id", id).update();
    }

    List<ApiTokenRow> findAll() {
        return jdbc.sql("SELECT id, name, token_prefix, created_at, last_used_at, revoked_at FROM api_token ORDER BY created_at DESC")
                .query((rs, row) -> new ApiTokenRow(
                        Sql.uuid(rs, "id"),
                        rs.getString("name"),
                        rs.getString("token_prefix"),
                        Sql.instant(rs, "created_at"),
                        Sql.instant(rs, "last_used_at"),
                        Sql.instant(rs, "revoked_at")))
                .list();
    }

    boolean exists(UUID id) {
        return jdbc.sql("SELECT count(*) FROM api_token WHERE id = :id").param("id", id).query(Long.class).single() > 0;
    }

    void revoke(UUID id, Instant now) {
        jdbc.sql("UPDATE api_token SET revoked_at = :now WHERE id = :id AND revoked_at IS NULL")
                .param("now", Sql.ts(now))
                .param("id", id)
                .update();
    }
}
