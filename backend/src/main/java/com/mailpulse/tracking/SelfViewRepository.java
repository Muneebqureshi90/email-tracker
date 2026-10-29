package com.mailpulse.tracking;

import com.mailpulse.common.Sql;
import java.time.Instant;
import java.util.Collection;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Times at which the owner was seen viewing a tracked email. Server time only; the browser's clock is ignored. */
@Repository
public class SelfViewRepository {

    private final JdbcClient jdbc;

    SelfViewRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Records a view for each email whose pixel token is listed; unknown tokens are skipped. */
    int recordForTokens(Collection<String> tokens, String context, Instant now) {
        return jdbc.sql("""
                INSERT INTO self_view (tracked_email_id, received_at, context)
                SELECT DISTINCT tracked_email_id, :now, :context FROM tracking_token WHERE token IN (:tokens)
                """)
                .param("now", Sql.ts(now))
                .param("context", context)
                .param("tokens", tokens)
                .update();
    }

    boolean existsBetween(UUID emailId, Instant from, Instant to) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM self_view WHERE tracked_email_id = :email AND received_at BETWEEN :from AND :to)
                """)
                .param("email", emailId)
                .param("from", Sql.ts(from))
                .param("to", Sql.ts(to))
                .query(Boolean.class)
                .single();
    }

    public int deleteOlderThan(Instant cutoff) {
        return jdbc.sql("DELETE FROM self_view WHERE received_at < :cutoff").param("cutoff", Sql.ts(cutoff)).update();
    }
}
