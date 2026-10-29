package com.mailpulse.auth;

import com.mailpulse.common.Sql;
import java.time.Instant;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class OwnerAccountRepository {

    record OwnerAccount(String passwordHash, Instant passwordChangedAt, int failedLogins, Instant lockedUntil) {}

    private final JdbcClient jdbc;

    OwnerAccountRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    Optional<OwnerAccount> find() {
        return jdbc.sql("SELECT password_hash, password_changed_at, failed_logins, locked_until FROM owner_account WHERE id = 1")
                .query((rs, row) -> new OwnerAccount(
                        rs.getString("password_hash"),
                        Sql.instant(rs, "password_changed_at"),
                        rs.getInt("failed_logins"),
                        Sql.instant(rs, "locked_until")))
                .optional();
    }

    boolean exists() {
        return jdbc.sql("SELECT count(*) FROM owner_account").query(Long.class).single() > 0;
    }

    /** Returns false when an owner already exists. */
    boolean create(String passwordHash, Instant now) {
        return jdbc.sql("""
                INSERT INTO owner_account (id, password_hash, password_changed_at, created_at)
                VALUES (1, :hash, :now, :now) ON CONFLICT (id) DO NOTHING
                """)
                .param("hash", passwordHash)
                .param("now", Sql.ts(now))
                .update() == 1;
    }

    void updatePassword(String passwordHash, Instant changedAt) {
        jdbc.sql("""
                UPDATE owner_account SET password_hash = :hash, password_changed_at = :changedAt,
                    failed_logins = 0, locked_until = NULL
                WHERE id = 1
                """)
                .param("hash", passwordHash)
                .param("changedAt", Sql.ts(changedAt))
                .update();
    }

    void recordFailure(int failedLogins, Instant lockedUntil) {
        jdbc.sql("UPDATE owner_account SET failed_logins = :failed, locked_until = :lockedUntil WHERE id = 1")
                .param("failed", failedLogins)
                .param("lockedUntil", Sql.ts(lockedUntil))
                .update();
    }

    void resetFailures() {
        jdbc.sql("UPDATE owner_account SET failed_logins = 0, locked_until = NULL WHERE id = 1").update();
    }
}
