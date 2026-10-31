package com.mailpulse.alerts;

import com.mailpulse.activity.ActivityService;
import com.mailpulse.common.crypto.FieldCipher;
import com.mailpulse.common.web.ApiException;
import com.mailpulse.common.web.Paging;
import com.mailpulse.documents.DocumentService;
import com.mailpulse.emails.AddressBook;
import com.mailpulse.emails.EmailApi;
import com.mailpulse.emails.EmailService;
import com.mailpulse.reports.WeeklySummary;
import com.mailpulse.settings.Settings;
import com.mailpulse.settings.SettingsService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Raises follow-up, open-spike and revival alerts (PLAN §4.7), NO_REPLY for often-opened unanswered emails and
 * DOC_VIEWS for document links. Every alert is
 * also an activity item, so it reaches desktop notifications (if the email is not muted) and the live dashboard.
 */
@Service
public class AlertService {

    /**
     * @param emailId null (and subject, recipients empty) for a DOC_VIEWS alert of a share link
     * @param documentId the document of a DOC_VIEWS alert, otherwise null (also documentName and linkLabel)
     */
    public record AlertView(
            UUID id,
            AlertType type,
            String text,
            String status,
            Instant createdAt,
            Instant snoozedUntil,
            UUID emailId,
            String subject,
            String recipients,
            UUID documentId,
            String documentName,
            String linkLabel) {}

    public record AlertBrief(AlertType type, String text) {}

    public record AlertPage(List<AlertView> items, int page, int size, long total, long newCount) {}

    private final AlertRepository repository;
    private final ActivityService activity;
    private final SettingsService settings;
    private final AddressBook addressBook;
    private final FieldCipher cipher;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final WeeklySummary weeklySummary;

    AlertService(
            AlertRepository repository,
            ActivityService activity,
            SettingsService settings,
            AddressBook addressBook,
            FieldCipher cipher,
            TransactionTemplate transactions,
            Clock clock,
            WeeklySummary weeklySummary) {
        this.repository = repository;
        this.activity = activity;
        this.settings = settings;
        this.addressBook = addressBook;
        this.cipher = cipher;
        this.transactions = transactions;
        this.clock = clock;
        this.weeklySummary = weeklySummary;
    }

    /**
     * Called by the finalizer inside its transaction, right after an open was counted.
     *
     * @param previousOpenAt the email's last counted open before this one, or null
     * @return ids of new activity items, to publish after the transaction commits
     */
    public List<Long> onOpenCounted(UUID emailId, Instant openedAt, Instant previousOpenAt, Instant now) {
        Settings current = settings.current();
        List<Long> created = new ArrayList<>();
        AlertRules.revival(previousOpenAt, openedAt, current.revivalDays()).ifPresent(silence -> created.add(raise(
                AlertType.REVIVAL, emailId, null, now, details("days", silence.toDays(),
                        "Opened again after " + silence.toDays() + " days without opens"))));
        Duration window = Duration.ofMinutes(current.spikeWindowMinutes());
        int opens = repository.countedOpensBetween(emailId, openedAt.minus(window), openedAt);
        if (AlertRules.openSpike(opens, current.spikeOpens(), repository.existsSince(emailId, AlertType.OPEN_SPIKE, openedAt.minus(window)))) {
            created.add(raise(AlertType.OPEN_SPIKE, emailId, null, now, details("opens", opens,
                    "Opened " + opens + " times within " + current.spikeWindowMinutes() + " minutes")));
        }
        return created;
    }

    /**
     * Called inside the document tracker's transaction after a document view was counted: DOC_VIEWS once the
     * link reaches three counted views (once per link).
     *
     * @param emailId the link's email, or null for a share link
     * @return the id of the new activity item, to publish after the transaction commits
     */
    public Optional<Long> onDocumentViewCounted(UUID documentLinkId, UUID emailId, int countedViews, Instant now) {
        if (!AlertRules.documentViews(countedViews, repository.existsForLink(documentLinkId, AlertType.DOC_VIEWS))) {
            return Optional.empty();
        }
        return Optional.of(raise(AlertType.DOC_VIEWS, emailId, documentLinkId, now,
                details("views", countedViews, "Document viewed " + countedViews + " times")));
    }

    /**
     * Due follow-ups (unopened, or opened often without a reply) and finished snoozes. Runs every five minutes
     * (maintenance Jobs); tests call it directly.
     */
    public int runScheduled() {
        Instant now = clock.instant();
        Settings current = settings.current();
        List<Long> created = transactions.execute(status -> {
            List<Long> ids = new ArrayList<>();
            for (AlertRepository.FollowUpCandidate candidate : repository.followUpCandidates(now, current.followUpHours())) {
                if (AlertRules.followUpDue(candidate.sentAt(), candidate.hours(), candidate.opens(), candidate.clicks(), now)) {
                    ids.add(raise(AlertType.FOLLOW_UP, candidate.emailId(), null, now, details("hours", candidate.hours(),
                            "Not opened " + candidate.hours() + " hours after sending")));
                }
            }
            Instant sentTo = now.minus(AlertRules.NO_REPLY_AFTER);
            for (AlertRepository.NoReplyCandidate candidate : repository.noReplyCandidates(
                    AlertRules.NO_REPLY_OPENS, sentTo.minus(AlertRules.FOLLOW_UP_LATEST), sentTo)) {
                if (AlertRules.noReplyDue(candidate.sentAt(), candidate.opens(), null, now)) {
                    ids.add(raise(AlertType.NO_REPLY, candidate.emailId(), null, now, details("opens", candidate.opens(),
                            "Opened " + candidate.opens() + " times, no reply yet: a good time to follow up")));
                }
            }
            weekly(now).ifPresent(ids::add);
            for (UUID id : repository.reopenSnoozed(now)) {
                repository.find(id).ifPresent(alert -> ids.add(activity.recordAlert(alert.emailId(), id, now)));
            }
            return ids;
        });
        if (created == null || created.isEmpty()) {
            return 0;
        }
        activity.publish(created);
        return created.size();
    }

    public AlertPage list(String status, int page, int size) {
        if (!"active".equals(status) && !"all".equals(status)) {
            throw ApiException.badRequest("status must be active or all");
        }
        Paging.check(page, size);
        boolean active = "active".equals(status);
        List<AlertRepository.AlertRow> rows = repository.list(active, size, (long) page * size);
        return new AlertPage(views(rows), page, size, repository.count(active), repository.countNew());
    }

    /** Type and text of the email's new and seen alerts, newest first (the Gmail hover card). */
    public List<AlertBrief> activeForEmail(UUID emailId) {
        return repository.activeForEmail(emailId);
    }

    public AlertView update(UUID id, String status, Integer snoozeHours) {
        repository.find(id).orElseThrow(() -> ApiException.notFound("Alert not found"));
        Instant until = null;
        if ("SNOOZED".equals(status)) {
            if (snoozeHours == null) {
                throw ApiException.badRequest("snoozeHours is required to snooze");
            }
            until = clock.instant().plus(Duration.ofHours(snoozeHours));
        }
        repository.updateStatus(id, status, until);
        return views(List.of(repository.find(id).orElseThrow())).getFirst();
    }

    /**
     * WEEKLY: from Monday 09:00 (owner's time zone) one summary of the previous week, unless every number is 0.
     * details.week (this Monday) keeps it to one per week.
     */
    private Optional<Long> weekly(Instant now) {
        LocalDate monday = weeklySummary.thisMonday();
        if (now.isBefore(monday.atTime(9, 0).atZone(weeklySummary.zone()).toInstant())
                || repository.weeklyExists(monday.toString())) {
            return Optional.empty();
        }
        WeeklySummary.Week week = weeklySummary.lastWeek();
        if (week.empty()) {
            return Optional.empty();
        }
        return Optional.of(raise(AlertType.WEEKLY, null, null, now, details("week", monday.toString(), week.text())));
    }

    private long raise(AlertType type, UUID emailId, UUID documentLinkId, Instant now, Map<String, Object> details) {
        UUID id = UUID.randomUUID();
        repository.insert(id, type, emailId, documentLinkId, now, details);
        return activity.recordAlert(emailId, id, now);
    }

    private static Map<String, Object> details(String key, Object value, String text) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put(key, value);
        details.put("text", text);
        return details;
    }

    private List<AlertView> views(List<AlertRepository.AlertRow> rows) {
        Map<UUID, List<EmailApi.Recipient>> recipients = addressBook.recipientsOf(
                rows.stream().map(AlertRepository.AlertRow::emailId).filter(Objects::nonNull).distinct().toList());
        return rows.stream()
                .map(row -> new AlertView(
                        row.id(),
                        AlertType.valueOf(row.type()),
                        row.text(),
                        row.status(),
                        row.createdAt(),
                        row.snoozedUntil(),
                        row.emailId(),
                        cipher.decrypt(row.subjectEnc(), EmailService.SUBJECT_COLUMN),
                        ActivityService.recipientSummary(recipients.getOrDefault(row.emailId(), List.of())),
                        row.documentId(),
                        cipher.decrypt(row.documentNameEnc(), DocumentService.NAME_COLUMN),
                        cipher.decrypt(row.linkLabelEnc(), DocumentService.LABEL_COLUMN)))
                .toList();
    }
}
