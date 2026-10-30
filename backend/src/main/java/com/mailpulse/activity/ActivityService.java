package com.mailpulse.activity;

import com.mailpulse.common.crypto.FieldCipher;
import com.mailpulse.documents.DocumentService;
import com.mailpulse.emails.AddressBook;
import com.mailpulse.emails.EmailApi;
import com.mailpulse.emails.EmailService;
import com.mailpulse.emails.LinkRepository;
import com.mailpulse.settings.Settings;
import com.mailpulse.settings.SettingsService;
import com.mailpulse.tracking.RepeatOpens;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class ActivityService {

    /** Activity kinds that can be filtered on. */
    public static final List<String> KINDS = List.of("OPEN", "CLICK", "ALERT", "DOC_VIEW", "DOC_READ", "DOC_DOWNLOAD");

    record Slice(List<ActivityItem> items, boolean hasMore) {}

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
        return repository.insert(kind, emailId, eventId, now, false);
    }

    /** An item that never notifies, for an open or click the owner restored after "That was me". */
    public long recordSilently(String kind, UUID emailId, Long eventId, Instant now) {
        return repository.insert(kind, emailId, eventId, now, true);
    }

    /** Removes the item of an event the owner marked as their own. */
    public void removeForEvent(long eventId) {
        repository.deleteForEvent(eventId);
    }

    /** An alert as an activity item (inside the caller's transaction). Returns the new activity id. */
    public long recordAlert(UUID emailId, UUID alertId, Instant now) {
        return repository.insertAlert(emailId, alertId, now);
    }

    /** A counted document view, read or download (inside the caller's transaction); emailId null for a share link. */
    public long recordDocument(String kind, UUID emailId, long documentEventId, Instant now) {
        return repository.insertDocument(kind, emailId, documentEventId, now);
    }

    /** Pushes new items to open dashboard streams, after the finalizer's transaction has committed. */
    public void publish(Collection<Long> activityIds) {
        stream.publish(items(repository.findByIds(activityIds)));
    }

    List<ActivityItem> after(long afterId, int limit) {
        return items(repository.findAfter(afterId, limit, List.of()).rows());
    }

    Slice after(long afterId, int limit, Collection<String> kinds) {
        ActivityRepository.Slice slice = repository.findAfter(afterId, limit, kinds);
        return new Slice(items(slice.rows()), slice.hasMore());
    }

    Slice latest(Long beforeId, int limit, Collection<String> kinds) {
        ActivityRepository.Slice slice = repository.findLatest(beforeId, limit, kinds);
        return new Slice(items(slice.rows()), slice.hasMore());
    }

    long lastId() {
        return repository.maxId();
    }

    private List<ActivityItem> items(List<ActivityRepository.ActivityRow> rows) {
        Settings current = settings.current();
        Map<UUID, List<EmailApi.Recipient>> recipients = addressBook.recipientsOf(
                rows.stream().map(ActivityRepository.ActivityRow::emailId).filter(Objects::nonNull).distinct().toList());
        return rows.stream()
                .map(row -> {
                    boolean document = row.kind().startsWith("DOC_");
                    boolean reading = document && row.visibleMs() != null;
                    return new ActivityItem(
                            row.id(),
                            row.kind(),
                            row.emailId(),
                            cipher.decrypt(row.subjectEnc(), EmailService.SUBJECT_COLUMN),
                            recipientSummary(recipients.getOrDefault(row.emailId(), List.of())),
                            row.occurredAt() == null ? row.createdAt() : row.occurredAt(),
                            row.source(),
                            row.linkId() == null ? null : links.url(row.linkId()).orElse(null),
                            shouldNotify(row, current),
                            row.alertType(),
                            row.alertText(),
                            row.openNumber(),
                            row.accountEnc() == null ? null : addressBook.accountAddress(row.accountEnc()),
                            row.gmailThreadId(),
                            row.documentId(),
                            cipher.decrypt(row.documentNameEnc(), DocumentService.NAME_COLUMN),
                            cipher.decrypt(row.linkLabelEnc(), DocumentService.LABEL_COLUMN),
                            reading ? (int) (row.visibleMs() / 1000) : null,
                            reading ? row.pagesViewed() : null,
                            document ? row.pageCount() : null);
                })
                .toList();
    }

    /**
     * Muted emails and restored items never notify; opens follow the owner's repeat-open setting, and so do
     * document views, reads and downloads (each in its own sequence per link) when document notifications are on.
     */
    static boolean shouldNotify(ActivityRepository.ActivityRow row, Settings settings) {
        if (row.silent() || !row.emailNotify()) {
            return false;
        }
        return switch (row.kind()) {
            case "OPEN" -> settings.notifyOpens() && repeatRule(row, settings);
            case "CLICK" -> settings.notifyClicks();
            case "DOC_VIEW", "DOC_READ", "DOC_DOWNLOAD" -> settings.notifyDocuments() && repeatRule(row, settings);
            default -> settings.notifyAlerts();
        };
    }

    private static boolean repeatRule(ActivityRepository.ActivityRow row, Settings settings) {
        return row.openNumber() == null
                || RepeatOpens.notifies(settings.notifyOn(), row.openNumber(), row.occurredAt(), row.previousOpenAt());
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
