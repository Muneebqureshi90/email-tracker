package com.mailpulse.tracking;

import com.mailpulse.common.net.ClientAddress;
import com.mailpulse.emails.LinkRepository;
import com.mailpulse.settings.Settings;
import com.mailpulse.settings.SettingsService;
import java.time.Clock;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** Saves one raw request as a tracking event. Unknown tokens are dropped without a database write. */
@Service
class EventIngestService {

    private static final int MAX_USER_AGENT = 512;

    private final TrackingEventRepository events;
    private final LinkRepository links;
    private final SettingsService settings;
    private final Clock clock;

    EventIngestService(TrackingEventRepository events, LinkRepository links, SettingsService settings, Clock clock) {
        this.events = events;
        this.links = links;
        this.settings = settings;
        this.clock = clock;
    }

    void ingest(RawEvent raw) {
        UUID emailId;
        UUID linkId = null;
        boolean trackingEnabled;
        if (raw.type() == EventType.OPEN) {
            Optional<TrackingEventRepository.PixelTarget> target = events.findPixelTarget(raw.token());
            if (target.isEmpty()) {
                return;
            }
            emailId = target.get().emailId();
            trackingEnabled = target.get().trackingEnabled();
        } else {
            Optional<LinkRepository.LinkTarget> target = links.findTarget(raw.token());
            if (target.isEmpty()) {
                return;
            }
            emailId = target.get().emailId();
            linkId = target.get().linkId();
            trackingEnabled = target.get().trackingEnabled();
        }
        Settings current = settings.current();
        Source source = EventClassifier.source(raw.userAgent());
        String ipPrefix = current.ipMode() == Settings.IpMode.TRUNCATED && raw.clientIp() != null
                ? ClientAddress.truncate(raw.clientIp())
                : null;
        Optional<Reason> reason = EventClassifier.immediateReason(raw, source, trackingEnabled, current.countApplePrefetch());
        String userAgent = raw.userAgent() == null || raw.userAgent().length() <= MAX_USER_AGENT
                ? raw.userAgent()
                : raw.userAgent().substring(0, MAX_USER_AGENT);
        events.insert(new TrackingEventRepository.NewEvent(
                emailId,
                linkId,
                raw.type(),
                raw.receivedAt(),
                raw.method(),
                userAgent,
                ipPrefix,
                source,
                EventClassifier.sourceKey(source, ipPrefix, raw.userAgent()),
                reason.isPresent() ? Verdict.IGNORED : Verdict.PENDING,
                reason.orElse(null),
                reason.isPresent() ? clock.instant() : null));
    }
}
