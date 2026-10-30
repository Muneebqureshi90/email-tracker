package com.mailpulse.activity;

import com.mailpulse.common.web.ApiException;
import com.mailpulse.settings.ClientConfigService;
import java.util.Arrays;
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

    /**
     * @param lastId the newest activity id overall (the cursor for live polling, whatever the filter)
     * @param hasMore with since/after: newer items exist beyond this page; otherwise older items exist
     * @param configVersion changes whenever the extension's configuration changes
     */
    record ActivityPage(List<ActivityItem> items, long lastId, boolean hasMore, String configVersion) {}

    private final ActivityService activity;
    private final ActivityStream stream;
    private final ClientConfigService config;

    ActivityController(ActivityService activity, ActivityStream stream, ClientConfigService config) {
        this.activity = activity;
        this.stream = stream;
        this.config = config;
    }

    /**
     * Without a cursor: the newest items, so a new client can start from {@code lastId} without a flood
     * of old notifications. With {@code since} (alias {@code after}): everything after that id. With
     * {@code before}: the page of older items just before that id. Items are always oldest first.
     */
    @GetMapping("/api/activity")
    ActivityPage activity(
            @RequestParam(required = false) Long since,
            @RequestParam(required = false) Long after,
            @RequestParam(required = false) Long before,
            @RequestParam(required = false) String kinds,
            @RequestParam(defaultValue = "50") int limit) {
        if (since != null && after != null && !since.equals(after)) {
            throw ApiException.badRequest("Send since or after, not both");
        }
        Long cursor = since != null ? since : after;
        if (cursor != null && before != null) {
            throw ApiException.badRequest("Send since/after or before, not both");
        }
        int size = Math.clamp(limit, 1, MAX_LIMIT);
        List<String> filter = kinds(kinds);
        ActivityService.Slice slice = cursor == null ? activity.latest(before, size, filter) : activity.after(cursor, size, filter);
        return new ActivityPage(slice.items(), activity.lastId(), slice.hasMore(), config.version());
    }

    @GetMapping(path = "/api/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    SseEmitter stream(@RequestHeader(name = "Last-Event-ID", required = false) Long lastEventId) {
        List<ActivityItem> replay = lastEventId == null ? List.of() : activity.after(lastEventId, MAX_LIMIT);
        return stream.connect(replay);
    }

    private static List<String> kinds(String kinds) {
        if (kinds == null || kinds.isBlank()) {
            return List.of();
        }
        List<String> parsed = Arrays.stream(kinds.split(",")).map(String::trim).filter(kind -> !kind.isEmpty()).distinct().toList();
        if (parsed.stream().anyMatch(kind -> !ActivityService.KINDS.contains(kind))) {
            throw ApiException.badRequest("kinds may contain " + String.join(", ", ActivityService.KINDS));
        }
        return parsed;
    }
}
