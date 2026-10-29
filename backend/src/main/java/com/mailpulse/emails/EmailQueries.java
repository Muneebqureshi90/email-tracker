package com.mailpulse.emails;

import com.mailpulse.common.crypto.FieldCipher;
import com.mailpulse.common.web.ApiException;
import com.mailpulse.tracking.TrackingEventRepository;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * Read side: list, detail and Gmail marks. Subjects and addresses are encrypted, so text search
 * decrypts the matching rows in memory (fine for one person's mail volume).
 */
@Service
public class EmailQueries {

    static final int MAX_PAGE_SIZE = 100;
    private static final int MAX_SEARCH_ROWS = 5000;
    private static final int MAX_EVENTS = 500;
    private static final int MAX_GMAIL_IDS = 100;

    private final EmailRepository emails;
    private final AddressBook addressBook;
    private final LinkRepository links;
    private final TrackingEventRepository events;
    private final FieldCipher cipher;

    EmailQueries(
            EmailRepository emails,
            AddressBook addressBook,
            LinkRepository links,
            TrackingEventRepository events,
            FieldCipher cipher) {
        this.emails = emails;
        this.addressBook = addressBook;
        this.links = links;
        this.events = events;
        this.cipher = cipher;
    }

    public EmailApi.Page<EmailApi.EmailSummary> list(
            String state, String account, Instant from, Instant to, String text, int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw ApiException.badRequest("page must be >= 0 and size between 1 and " + MAX_PAGE_SIZE);
        }
        if (state != null && !List.of("opened", "not_opened", "clicked").contains(state)) {
            throw ApiException.badRequest("state must be opened, not_opened or clicked");
        }
        UUID accountId = null;
        if (account != null && !account.isBlank()) {
            var found = addressBook.findAccountId(Addresses.normalize(account));
            if (found.isEmpty()) {
                return new EmailApi.Page<>(List.of(), page, size, 0);
            }
            accountId = found.get();
        }
        var filter = new EmailRepository.ListFilter(state, accountId, from, to);
        if (text == null || text.isBlank()) {
            List<EmailRepository.EmailRow> rows = emails.list(filter, size, (long) page * size);
            return new EmailApi.Page<>(summaries(rows), page, size, emails.count(filter));
        }
        String needle = text.trim().toLowerCase(Locale.ROOT);
        List<EmailApi.EmailSummary> matches = summaries(emails.list(filter, MAX_SEARCH_ROWS, 0)).stream()
                .filter(summary -> matches(summary, needle))
                .toList();
        int start = Math.min(matches.size(), page * size);
        int end = Math.min(matches.size(), start + size);
        return new EmailApi.Page<>(matches.subList(start, end), page, size, matches.size());
    }

    public EmailApi.EmailDetail detail(UUID id) {
        var email = emails.find(id).orElseThrow(() -> ApiException.notFound("Email not found"));
        EmailApi.EmailSummary summary = summaries(List.of(email)).getFirst();
        return new EmailApi.EmailDetail(
                summary,
                email.trackOpens(),
                email.trackLinks(),
                email.trackingEnabled(),
                email.notifications(),
                email.followUpHours(),
                email.gmailMessageId(),
                email.gmailThreadId(),
                email.cancelledAt(),
                links.findForEmail(id),
                events.findForEmail(id, MAX_EVENTS));
    }

    /** ✓/✓✓ for Gmail rows: the latest tracked email per thread (or per message) of one account. */
    public EmailApi.MarksResponse marks(String account, List<String> threadIds, List<String> messageIds) {
        boolean byThread = threadIds != null && !threadIds.isEmpty();
        List<String> ids = byThread ? threadIds : messageIds;
        if (ids == null || ids.isEmpty() || (byThread && messageIds != null && !messageIds.isEmpty())) {
            throw ApiException.badRequest("Send either threadIds or messageIds");
        }
        if (ids.size() > MAX_GMAIL_IDS || ids.stream().anyMatch(id -> !id.matches(EmailApi.GMAIL_ID))) {
            throw ApiException.badRequest("Up to " + MAX_GMAIL_IDS + " valid Gmail ids are allowed");
        }
        var accountId = addressBook.findAccountId(Addresses.normalize(account));
        if (accountId.isEmpty()) {
            return new EmailApi.MarksResponse(Map.of());
        }
        String column = byThread ? "gmail_thread_id" : "gmail_message_id";
        Function<EmailRepository.EmailRow, String> key =
                byThread ? EmailRepository.EmailRow::gmailThreadId : EmailRepository.EmailRow::gmailMessageId;
        Map<String, EmailApi.Mark> marks = emails.latestByGmailIds(accountId.get(), column, ids).stream()
                .collect(Collectors.toMap(key, EmailQueries::mark));
        return new EmailApi.MarksResponse(marks);
    }

    private List<EmailApi.EmailSummary> summaries(List<EmailRepository.EmailRow> rows) {
        Map<UUID, List<EmailApi.Recipient>> recipients =
                addressBook.recipientsOf(rows.stream().map(EmailRepository.EmailRow::id).toList());
        return rows.stream()
                .map(row -> new EmailApi.EmailSummary(
                        row.id(),
                        addressBook.accountAddress(row.accountEnc()),
                        cipher.decrypt(row.subjectEnc(), EmailService.SUBJECT_COLUMN),
                        row.status(),
                        row.createdAt(),
                        row.sentAt(),
                        recipients.getOrDefault(row.id(), List.of()),
                        row.openCount(),
                        row.clickCount(),
                        row.firstOpenedAt(),
                        row.lastOpenedAt(),
                        row.lastClickedAt(),
                        row.openStatusUnreliable()))
                .toList();
    }

    private static boolean matches(EmailApi.EmailSummary summary, String needle) {
        if (summary.subject() != null && summary.subject().toLowerCase(Locale.ROOT).contains(needle)) {
            return true;
        }
        return summary.recipients().stream().anyMatch(r -> r.email().contains(needle)
                || (r.name() != null && r.name().toLowerCase(Locale.ROOT).contains(needle)));
    }

    private static EmailApi.Mark mark(EmailRepository.EmailRow row) {
        boolean engaged = row.openCount() > 0 || row.clickCount() > 0;
        return new EmailApi.Mark(
                row.id(),
                engaged ? "OPENED" : "SENT",
                row.openCount(),
                row.clickCount(),
                row.lastOpenedAt(),
                row.lastClickedAt(),
                row.openStatusUnreliable());
    }
}
