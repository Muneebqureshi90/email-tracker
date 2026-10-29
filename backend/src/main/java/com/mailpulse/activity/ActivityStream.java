package com.mailpulse.activity;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Server-Sent Events to open dashboard tabs. Event ids are activity ids, so reconnects replay what was missed. */
@Component
public class ActivityStream {

    private static final long TIMEOUT_MILLIS = Duration.ofMinutes(30).toMillis();

    private final Set<SseEmitter> emitters = ConcurrentHashMap.newKeySet();

    SseEmitter connect(List<ActivityItem> replay) {
        SseEmitter emitter = new SseEmitter(TIMEOUT_MILLIS);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(emitter::complete);
        emitter.onError(error -> emitters.remove(emitter));
        try {
            emitter.send(SseEmitter.event().comment("connected"));
            for (ActivityItem item : replay) {
                send(emitter, item);
            }
            emitters.add(emitter);
        } catch (IOException e) {
            emitter.completeWithError(e);
        }
        return emitter;
    }

    void publish(List<ActivityItem> items) {
        for (SseEmitter emitter : emitters) {
            try {
                for (ActivityItem item : items) {
                    send(emitter, item);
                }
            } catch (IOException | IllegalStateException e) {
                emitters.remove(emitter);
            }
        }
    }

    /** Comment lines keep idle connections open through proxies and detect closed tabs. */
    public void heartbeat() {
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().comment("keep-alive"));
            } catch (IOException | IllegalStateException e) {
                emitters.remove(emitter);
            }
        }
    }

    private static void send(SseEmitter emitter, ActivityItem item) throws IOException {
        emitter.send(SseEmitter.event().id(Long.toString(item.id())).name("activity").data(item, MediaType.APPLICATION_JSON));
    }
}
