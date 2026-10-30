package com.mailpulse.maintenance;

import com.mailpulse.documents.DocumentRetention;
import com.mailpulse.emails.EmailRepository;
import com.mailpulse.settings.SettingsService;
import com.mailpulse.tracking.SelfViewRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.springframework.stereotype.Service;

/**
 * Housekeeping: unsent drafts, old self-view reports, and everything past the retention period (emails with their
 * events and document links; document views and downloads of share links).
 */
@Service
public class MaintenanceService {

    static final Duration DRAFT_LIFETIME = Duration.ofHours(24);
    static final Duration SELF_VIEW_LIFETIME = Duration.ofDays(2);

    public record Result(int draftsDeleted, int selfViewsDeleted, int emailsExpired, int documentEventsExpired) {}

    private final EmailRepository emails;
    private final SelfViewRepository selfViews;
    private final DocumentRetention documents;
    private final SettingsService settings;
    private final Clock clock;

    MaintenanceService(
            EmailRepository emails, SelfViewRepository selfViews, DocumentRetention documents, SettingsService settings, Clock clock) {
        this.emails = emails;
        this.selfViews = selfViews;
        this.documents = documents;
        this.settings = settings;
        this.clock = clock;
    }

    public Result runOnce() {
        Instant now = clock.instant();
        Instant cutoff = now.minus(Duration.ofDays(settings.current().retentionDays()));
        return new Result(
                emails.deleteStaleDrafts(now.minus(DRAFT_LIFETIME)),
                selfViews.deleteOlderThan(now.minus(SELF_VIEW_LIFETIME)),
                emails.deleteOlderThan(cutoff),
                documents.deleteOlderThan(cutoff));
    }
}
