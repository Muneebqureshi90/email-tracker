package com.mailpulse.activity;

import com.mailpulse.common.crypto.FieldCipher;
import com.mailpulse.emails.AddressBook;
import com.mailpulse.emails.EmailApi;
import com.mailpulse.emails.EmailService;
import com.mailpulse.emails.LinkRepository;
import com.mailpulse.settings.Settings;
import com.mailpulse.settings.SettingsService;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class ActivityService {

    private final ActivityRepository repository;
    private final ActivityStream stream;
    private final AddressBook addressBook;
    private final LinkRepository links;
    private final SettingsService settings;
    private final FieldCipher cipher;

    ActivityService(
            ActivityRepository repository,
            ActivityStream stream,
            AddressBook addressBook,
            LinkRepository links,
            SettingsService settings,
            FieldCipher cipher) {
        this.repository = repository;
        this.stream = stream;
        this.addressBook = addressBook;
        this.links = links;
        this.settings = settings;
        this.cipher = cipher;
    }

    /** Called inside the finalizer's transaction. Returns the new activity id. */
    public long record(String kind, UUID emailId, Long eventId, Instant now) {
        return repository.insert(kind, emailId, eventId, now);
    }

    /** An alert as an activity item (inside the caller's transaction). Returns the new activity id. */
    public long recordAlert(UUID emailId, UUID alertId, Instant now) {
        return repository.insertAlert(emailId, alertId, now);
    }

    /** Pushes new items to open dashboard streams, after the finalizer's transaction has committed. */
    public void publish(Collection<Long> activityIds) {
        stream.publish(items(repository.findByIds(activityIds)));
    }

    List<ActivityItem> after(long afterId, int limit) {
        return items(repository.findAfter(afterId, limit));
    }

    List<ActivityItem> latest(int limit) {
        return items(repository.findLatest(limit));
    }

    long lastId() {
        return repository.maxId();
    }

    private List<ActivityItem> items(List<ActivityRepository.ActivityRow> rows) {
        Settings current = settings.current();
        Map<UUID, List<EmailApi.Recipient>> recipients =
                addressBook.recipientsOf(rows.stream().map(ActivityRepository.ActivityRow::emailId).distinct().toList());
        return rows.stream()
                .map(row -> new ActivityItem(
                        row.id(),
                        row.kind(),
                        row.emailId(),
                        cipher.decrypt(row.subjectEnc(), EmailService.SUBJECT_COLUMN),
                        recipientSummary(recipients.getOrDefault(row.emailId(), List.of())),
                        row.occurredAt() == null ? row.createdAt() : row.occurredAt(),
                        row.source(),
                        row.linkId() == null ? null : links.url(row.linkId()).orElse(null),
                        row.emailNotify() && switch (row.kind()) {
                            case "OPEN" -> current.notifyOpens();
                            case "CLICK" -> current.notifyClicks();
                            default -> current.notifyAlerts();
                        },
                        row.alertType(),
                        row.alertText()))
                .toList();
    }

    /** "Jane Doe" or "Jane Doe +2". */
    public static String recipientSummary(List<EmailApi.Recipient> recipients) {
        if (recipients.isEmpty()) {
            return "";
        }
        EmailApi.Recipient first = recipients.getFirst();
        String label = first.name() == null || first.name().isBlank() ? first.email() : first.name();
        return recipients.size() == 1 ? label : label + " +" + (recipients.size() - 1);
    }
}
