package com.mailpulse.alerts;

import com.mailpulse.activity.ActivityService;
import com.mailpulse.common.crypto.FieldCipher;
import com.mailpulse.common.web.ApiException;
import com.mailpulse.emails.AddressBook;
import com.mailpulse.emails.EmailApi;
import com.mailpulse.emails.EmailService;
import com.mailpulse.settings.Settings;
import com.mailpulse.settings.SettingsService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Raises follow-up, open-spike and revival alerts (PLAN §4.7). Every alert is also an activity item,
 * so it reaches desktop notifications (if the email is not muted) and the live dashboard.
 */
@Service
public class AlertService {

    static final int MAX_PAGE_SIZE = 100;

    public record AlertView(
            UUID id,
            AlertType type,
            String text,
            String status,
            Instant createdAt,
            Instant snoozedUntil,
            UUID emailId,
            String subject,
            String recipients) {}

    public record AlertPage(List<AlertView> items, int page, int size, long total, long newCount) {}

    private final AlertRepository repository;
    private final ActivityService activity;
    private final SettingsService settings;
    private final AddressBook addressBook;
    private final FieldCipher cipher;
    private final TransactionTemplate transactions;
    private final Clock clock;

    AlertService(
            AlertRepository repository,
            ActivityService activity,
            SettingsService settings,
            AddressBook addressBook,
            FieldCipher cipher,
            TransactionTemplate transactions,
            Clock clock) {
        this.repository = repository;
        this.activity = activity;
        this.settings = settings;
        this.addressBook = addressBook;
        this.cipher = cipher;
        this.transactions = transactions;
        this.clock = clock;
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
                AlertType.REVIVAL, emailId, now, details("days", silence.toDays(),
                        "Opened again after " + silence.toDays() + " days without opens"))));
        Duration window = Duration.ofMinutes(current.spikeWindowMinutes());
        int opens = repository.countedOpensBetween(emailId, openedAt.minus(window), openedAt);
        if (AlertRules.openSpike(opens, current.spikeOpens(), repository.existsSince(emailId, AlertType.OPEN_SPIKE, openedAt.minus(window)))) {
            created.add(raise(AlertType.OPEN_SPIKE, emailId, now, details("opens", opens,
                    "Opened " + opens + " times within " + current.spikeWindowMinutes() + " minutes")));
        }
        return created;
    }

    /** Due follow-ups and finished snoozes. Runs every five minutes (maintenance Jobs); tests call it directly. */
    public int runScheduled() {
        Instant now = clock.instant();
        Settings current = settings.current();
        List<Long> created = transactions.execute(status -> {
            List<Long> ids = new ArrayList<>();
            for (AlertRepository.FollowUpCandidate candidate : repository.followUpCandidates(now, current.followUpHours())) {
                if (AlertRules.followUpDue(candidate.sentAt(), candidate.hours(), candidate.opens(), candidate.clicks(), now)) {
                    ids.add(raise(AlertType.FOLLOW_UP, candidate.emailId(), now, details("hours", candidate.hours(),
                            "Not opened " + candidate.hours() + " hours after sending")));
                }
            }
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
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw ApiException.badRequest("page must be >= 0 and size between 1 and " + MAX_PAGE_SIZE);
        }
        boolean active = "active".equals(status);
        List<AlertRepository.AlertRow> rows = repository.list(active, size, (long) page * size);
        return new AlertPage(views(rows), page, size, repository.count(active), repository.countNew());
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

    private long raise(AlertType type, UUID emailId, Instant now, Map<String, Object> details) {
        UUID id = UUID.randomUUID();
        repository.insert(id, type, emailId, now, details);
        return activity.recordAlert(emailId, id, now);
    }

    private static Map<String, Object> details(String key, Object value, String text) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put(key, value);
        details.put("text", text);
        return details;
    }

    private List<AlertView> views(List<AlertRepository.AlertRow> rows) {
        Map<UUID, List<EmailApi.Recipient>> recipients =
                addressBook.recipientsOf(rows.stream().map(AlertRepository.AlertRow::emailId).distinct().toList());
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
                        ActivityService.recipientSummary(recipients.getOrDefault(row.emailId(), List.of()))))
                .toList();
    }
}
