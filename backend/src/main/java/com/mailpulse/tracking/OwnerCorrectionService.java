package com.mailpulse.tracking;

import com.mailpulse.activity.ActivityService;
import com.mailpulse.common.Sql;
import com.mailpulse.common.web.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * "That was me": the owner turns a counted open or click into IGNORED (reason OWNER), or undoes it.
 * Counters are recomputed from the counted events that remain. The email row is locked first, so a
 * finalizer counting a new event for the same email at the same moment cannot be lost.
 */
@Service
public class OwnerCorrectionService {

    private record EventState(String type, String verdict, String reason) {}

    private final JdbcClient jdbc;
    private final ActivityService activity;
    private final Clock clock;

    OwnerCorrectionService(JdbcClient jdbc, ActivityService activity, Clock clock) {
        this.jdbc = jdbc;
        this.activity = activity;
        this.clock = clock;
    }

    @Transactional
    public void markMine(UUID emailId, long eventId) {
        EventState event = lock(emailId, eventId);
        if (Verdict.IGNORED.name().equals(event.verdict()) && Reason.OWNER.name().equals(event.reason())) {
            return;
        }
        if (!Verdict.COUNTED.name().equals(event.verdict())) {
            throw ApiException.conflict("Only counted opens and clicks can be marked as yours");
        }
        jdbc.sql("UPDATE tracking_event SET verdict = 'IGNORED', reason = 'OWNER', decided_at = :now WHERE id = :id")
                .param("now", Sql.ts(clock.instant()))
                .param("id", eventId)
                .update();
        activity.removeForEvent(eventId);
        recompute(emailId);
    }

    /** Counts the event again without a new notification. */
    @Transactional
    public void undoMine(UUID emailId, long eventId) {
        EventState event = lock(emailId, eventId);
        if (Verdict.COUNTED.name().equals(event.verdict())) {
            return;
        }
        if (!Reason.OWNER.name().equals(event.reason())) {
            throw ApiException.conflict("Only events you marked as yours can be restored");
        }
        Instant now = clock.instant();
        jdbc.sql("UPDATE tracking_event SET verdict = 'COUNTED', reason = NULL, decided_at = :now WHERE id = :id")
                .param("now", Sql.ts(now))
                .param("id", eventId)
                .update();
        activity.recordSilently(event.type(), emailId, eventId, now);
        recompute(emailId);
    }

    private EventState lock(UUID emailId, long eventId) {
        jdbc.sql("SELECT id FROM tracked_email WHERE id = :id FOR UPDATE")
                .param("id", emailId)
                .query(UUID.class)
                .optional()
                .orElseThrow(() -> ApiException.notFound("Email not found"));
        return jdbc.sql("SELECT type, verdict, reason FROM tracking_event WHERE id = :id AND tracked_email_id = :email FOR UPDATE")
                .param("id", eventId)
                .param("email", emailId)
                .query((rs, row) -> new EventState(rs.getString("type"), rs.getString("verdict"), rs.getString("reason")))
                .optional()
                .orElseThrow(() -> ApiException.notFound("Event not found"));
    }

    private void recompute(UUID emailId) {
        jdbc.sql("""
                UPDATE tracked_email te SET open_count = s.opens, first_opened_at = s.first_open, last_opened_at = s.last_open,
                    click_count = s.clicks, last_clicked_at = s.last_click
                FROM (SELECT count(*) FILTER (WHERE type = 'OPEN') AS opens,
                             min(received_at) FILTER (WHERE type = 'OPEN') AS first_open,
                             max(received_at) FILTER (WHERE type = 'OPEN') AS last_open,
                             count(*) FILTER (WHERE type = 'CLICK') AS clicks,
                             max(received_at) FILTER (WHERE type = 'CLICK') AS last_click
                      FROM tracking_event WHERE tracked_email_id = :email AND verdict = 'COUNTED') s
                WHERE te.id = :email
                """)
                .param("email", emailId)
                .update();
        jdbc.sql("""
                UPDATE tracked_link tl SET click_count = s.clicks, first_clicked_at = s.first_click, last_clicked_at = s.last_click
                FROM (SELECT l.id, count(ev.id) AS clicks, min(ev.received_at) AS first_click, max(ev.received_at) AS last_click
                      FROM tracked_link l
                      LEFT JOIN tracking_event ev ON ev.tracked_link_id = l.id AND ev.type = 'CLICK' AND ev.verdict = 'COUNTED'
                      WHERE l.tracked_email_id = :email GROUP BY l.id) s
                WHERE tl.id = s.id
                """)
                .param("email", emailId)
                .update();
    }
}
