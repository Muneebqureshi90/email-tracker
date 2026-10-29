package com.mailpulse.tracking;

import com.mailpulse.activity.ActivityService;
import com.mailpulse.alerts.AlertService;
import com.mailpulse.emails.EmailRepository;
import com.mailpulse.emails.LinkRepository;
import com.mailpulse.settings.Settings;
import com.mailpulse.settings.SettingsService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Decides pending events once the self-view hold has passed: a self-view report on either side of the
 * event, the send grace period, unsent drafts, scanner clicks and duplicates all lead to IGNORED; the rest
 * are COUNTED, update the counters, become activity (notifications and live dashboard updates) and may
 * raise alerts.
 */
@Component
public class EventFinalizer {

    private static final int BATCH_SIZE = 500;

    private final TrackingEventRepository events;
    private final SelfViewRepository selfViews;
    private final EmailRepository emails;
    private final LinkRepository links;
    private final ActivityService activity;
    private final AlertService alerts;
    private final SettingsService settings;
    private final TransactionTemplate transactions;
    private final Clock clock;

    EventFinalizer(
            TrackingEventRepository events,
            SelfViewRepository selfViews,
            EmailRepository emails,
            LinkRepository links,
            ActivityService activity,
            AlertService alerts,
            SettingsService settings,
            TransactionTemplate transactions,
            Clock clock) {
        this.events = events;
        this.selfViews = selfViews;
        this.emails = emails;
        this.links = links;
        this.activity = activity;
        this.alerts = alerts;
        this.settings = settings;
        this.transactions = transactions;
        this.clock = clock;
    }

    /** Returns how many events were decided. */
    public int runOnce() {
        Settings current = settings.current();
        Instant now = clock.instant();
        Duration hold = Duration.ofSeconds(current.selfViewWindowSeconds());
        Duration dedupe = Duration.ofSeconds(current.dedupeWindowSeconds());
        Duration grace = Duration.ofSeconds(current.sendGraceSeconds());
        List<Long> newActivity = new ArrayList<>();
        Integer decided = transactions.execute(status -> {
            List<TrackingEventRepository.PendingEvent> batch = events.lockPending(now.minus(hold), BATCH_SIZE);
            for (TrackingEventRepository.PendingEvent event : batch) {
                Optional<EmailRepository.EmailRow> email = emails.find(event.emailId());
                if (email.isEmpty()) {
                    continue;
                }
                var facts = new FinalizerRules.Facts(
                        event.receivedAt(),
                        event.source(),
                        email.get().status(),
                        email.get().sentAt(),
                        selfViews.existsBetween(event.emailId(), event.receivedAt().minus(hold), event.receivedAt().plus(hold)),
                        events.countedDuplicateExists(event, event.receivedAt().minus(dedupe)),
                        event.type(),
                        event.type() == EventType.CLICK && events.distinctLinksClicked(event.emailId(),
                                event.receivedAt().minus(FinalizerRules.BURST_WINDOW),
                                event.receivedAt().plus(FinalizerRules.BURST_WINDOW)) >= FinalizerRules.BURST_LINKS);
                Optional<Reason> reason = FinalizerRules.decide(facts, grace);
                if (reason.isPresent()) {
                    events.markIgnored(event.id(), reason.get(), now);
                    continue;
                }
                events.markCounted(event.id(), now);
                if (event.type() == EventType.OPEN) {
                    emails.countOpen(event.emailId(), event.receivedAt());
                } else {
                    emails.countClick(event.emailId(), event.receivedAt());
                    links.countClick(event.linkId(), event.receivedAt());
                }
                newActivity.add(activity.record(event.type().name(), event.emailId(), event.id(), now));
                if (event.type() == EventType.OPEN) {
                    newActivity.addAll(alerts.onOpenCounted(event.emailId(), event.receivedAt(), email.get().lastOpenedAt(), now));
                }
            }
            return batch.size();
        });
        if (!newActivity.isEmpty()) {
            activity.publish(newActivity);
        }
        return decided == null ? 0 : decided;
    }
}
