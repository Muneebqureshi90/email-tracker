package com.mailpulse.activity;

import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
class ActivityController {

    private static final int MAX_LIMIT = 100;

    record ActivityPage(List<ActivityItem> items, long lastId) {}

    private final ActivityService activity;
    private final ActivityStream stream;

    ActivityController(ActivityService activity, ActivityStream stream) {
        this.activity = activity;
        this.stream = stream;
    }

    /**
     * Without {@code since}: the newest items, so a new client can start from {@code lastId} without a
     * flood of old notifications. With {@code since}: everything after that id, oldest first.
     */
    @GetMapping("/api/activity")
    ActivityPage activity(@RequestParam(required = false) Long since, @RequestParam(defaultValue = "50") int limit) {
        int size = Math.clamp(limit, 1, MAX_LIMIT);
        List<ActivityItem> items = since == null ? activity.latest(size) : activity.after(since, size);
        return new ActivityPage(items, activity.lastId());
    }

    @GetMapping(path = "/api/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    SseEmitter stream(@RequestHeader(name = "Last-Event-ID", required = false) Long lastEventId) {
        List<ActivityItem> replay = lastEventId == null ? List.of() : activity.after(lastEventId, MAX_LIMIT);
        return stream.connect(replay);
    }
}
