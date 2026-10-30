package com.mailpulse.activity;

import com.mailpulse.common.Sql;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The dashboard's bell: the latest activity, newest first, and how much of it is unread (owner only). */
@RestController
class NotificationController {

    private static final int MAX_LIMIT = 100;

    record Notifications(List<ActivityItem> items, long unread, long lastReadId) {}

    record ReadRequest(@NotNull @Min(0) Long upToId) {}

    private final ActivityService activity;
    private final JdbcClient jdbc;
    private final Clock clock;

    NotificationController(ActivityService activity, JdbcClient jdbc, Clock clock) {
        this.activity = activity;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @GetMapping("/api/notifications")
    Notifications list(@RequestParam(defaultValue = "30") int limit) {
        List<ActivityItem> items = new ArrayList<>(activity.latest(null, Math.clamp(limit, 1, MAX_LIMIT), List.of()).items());
        Collections.reverse(items);
        long lastReadId = lastReadId();
        long unread = jdbc.sql("SELECT count(*) FROM activity WHERE id > :read").param("read", lastReadId).query(Long.class).single();
        return new Notifications(items, unread, lastReadId);
    }

    /** Marks everything up to this id as read. Never moves backwards and never past the newest item. */
    @PostMapping("/api/notifications/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void read(@Valid @RequestBody ReadRequest body) {
        jdbc.sql("""
                UPDATE notification_state SET updated_at = :now,
                    last_read_id = GREATEST(last_read_id, LEAST(:upTo, (SELECT COALESCE(max(id), 0) FROM activity)))
                WHERE id = 1
                """)
                .param("upTo", body.upToId())
                .param("now", Sql.ts(clock.instant()))
                .update();
    }

    private long lastReadId() {
        return jdbc.sql("SELECT last_read_id FROM notification_state WHERE id = 1").query(Long.class).single();
    }
}
