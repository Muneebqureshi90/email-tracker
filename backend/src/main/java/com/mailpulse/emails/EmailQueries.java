package com.mailpulse.emails;

import com.mailpulse.common.crypto.FieldCipher;
import com.mailpulse.common.web.ApiException;
import com.mailpulse.common.web.Paging;
import com.mailpulse.documents.DocumentQueries;
import com.mailpulse.tracking.RepeatOpens;
import com.mailpulse.tracking.TrackingEventRepository;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
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

    private static final int MAX_SEARCH_ROWS = 5000;
    /** EmailDetail.events keeps the latest events; the full history is paged (GET /api/emails/{id}/events). */
    static final int MAX_EVENTS = 100;
    private static final int MAX_GMAIL_IDS = 100;

    private final EmailRepository emails;
    private final AddressBook addressBook;
    private final LinkRepository links;
    private final TrackingEventRepository events;
    private final DocumentQueries documents;
    private final FieldCipher cipher;

    EmailQueries(
            EmailRepository emails,
            AddressBook addressBook,
            LinkRepository links,
            TrackingEventRepository events,
            DocumentQueries documents,
            FieldCipher cipher) {
        this.emails = emails;
        this.addressBook = addressBook;
        this.links = links;
        this.events = events;
        this.documents = documents;
        this.cipher = cipher;
    }

    public EmailApi.Page<EmailApi.EmailSummary> list(
            String state, String account, Instant from, Instant to, String text, int page, int size) {
        return list(state, account, from, to, text, page, size, null, null);
    }

    public EmailApi.Page<EmailApi.EmailSummary> list(
            String state, String account, Instant from, Instant to, String text, int page, int size, String sort, String dir) {
        Paging.check(page, size);
        checkState(state);
        Optional<UUID> accountId = accountFilter(account);
        if (accountId == null) {
            return new EmailApi.Page<>(List.of(), page, size, 0);
        }
        return page(new EmailRepository.ListFilter(state, accountId.orElse(null), from, to), text, page, size, sort, dir);
    }

    /** The emails sent to one contact, with the same sort keys as the email list. */
    public EmailApi.Page<EmailApi.EmailSummary> listForContact(UUID contactId, int page, int size, String sort, String dir) {
        Paging.check(page, size);
        return page(new EmailRepository.ListFilter(null, null, null, null, contactId), null, page, size, sort, dir);
    }

    /** Totals for the filter labels ("Opened 12"), for the same account and text as the list. */
    public EmailApi.EmailCounts counts(String account, String text) {
        Optional<UUID> accountId = accountFilter(account);
        if (accountId == null) {
            return new EmailApi.EmailCounts(0, 0, 0, 0);
        }
        var filter = new EmailRepository.ListFilter(null, accountId.orElse(null), null, null);
        if (text == null || text.isBlank()) {
            return new EmailApi.EmailCounts(
                    emails.count(filter),
                    emails.count(filter.withState("opened")),
                    emails.count(filter.withState("not_opened")),
                    emails.count(filter.withState("clicked")));
        }
        List<EmailApi.EmailSummary> matches = search(filter, text, "sent", false);
        return new EmailApi.EmailCounts(
                matches.size(),
                matches.stream().filter(e -> e.openCount() > 0).count(),
                matches.stream().filter(e -> e.openCount() == 0 && e.clickCount() == 0).count(),
                matches.stream().filter(e -> e.clickCount() > 0).count());
    }

    /** Quick search: up to {@code limit} newest emails whose subject or recipients contain the text. */
    public List<EmailApi.EmailSummary> quickSearch(String text, int limit) {
        List<EmailApi.EmailSummary> matches =
                search(new EmailRepository.ListFilter(null, null, null, null), text, "sent", false);
        return List.copyOf(matches.subList(0, Math.min(limit, matches.size())));
    }

    /** Every event of an email, newest first. */
    public EmailApi.Page<EmailApi.EventView> events(UUID id, int page, int size) {
        Paging.check(page, size);
        emails.find(id).orElseThrow(() -> ApiException.notFound("Email not found"));
        return new EmailApi.Page<>(events.findForEmail(id, size, (long) page * size), page, size, events.countForEmail(id));
    }

    private EmailApi.Page<EmailApi.EmailSummary> page(
            EmailRepository.ListFilter filter, String text, int page, int size, String sort, String dir) {
        String key = sort == null || sort.isBlank() ? "sent" : sort;
        if (!EmailRepository.SORTS.containsKey(key)) {
            throw ApiException.badRequest("sort must be sent, opens, clicks or lastOpened");
        }
        boolean ascending = Paging.ascending(dir);
        if (text == null || text.isBlank()) {
            List<EmailRepository.EmailRow> rows = emails.list(filter, key, ascending, size, (long) page * size);
            return new EmailApi.Page<>(summaries(rows), page, size, emails.count(filter));
        }
        List<EmailApi.EmailSummary> matches = search(filter, text, key, ascending);
        return new EmailApi.Page<>(Paging.slice(matches, page, size), page, size, matches.size());
    }

    private List<EmailApi.EmailSummary> search(EmailRepository.ListFilter filter, String text, String sort, boolean ascending) {
        String needle = text.trim().toLowerCase(Locale.ROOT);
        return summaries(emails.list(filter, sort, ascending, MAX_SEARCH_ROWS, 0)).stream()
                .filter(summary -> matches(summary, needle))
                .toList();
    }

    private static void checkState(String state) {
        if (state != null && !List.of("opened", "not_opened", "clicked").contains(state)) {
            throw ApiException.badRequest("state must be opened, not_opened or clicked");
        }
    }

    /** Empty: no account filter; null: an account that has never sent anything (so nothing matches). */
    @SuppressWarnings("OptionalAssignedToNull")
    private Optional<UUID> accountFilter(String account) {
        if (account == null || account.isBlank()) {
            return Optional.empty();
        }
        Optional<UUID> found = addressBook.findAccountId(Addresses.normalize(account));
        return found.isPresent() ? found : null;
    }

    public List<String> accounts() {
        return addressBook.accountAddresses();
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
                events.findForEmail(id, MAX_EVENTS, 0),
                events.countedOpens(id),
                documents.linksForEmail(id),
                documents.eventsForEmail(id, MAX_EVENTS));
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
        List<EmailRepository.EmailRow> rows = emails.latestByGmailIds(accountId.get(), column, ids);
        Map<UUID, List<Instant>> opens = latestOpens(rows);
        Map<UUID, Integer> documentViews = documents.viewsByEmail(rows.stream().map(EmailRepository.EmailRow::id).toList());
        Map<UUID, Instant> delivered = events.firstDelivered(rows.stream().map(EmailRepository.EmailRow::id).toList());
        Map<String, EmailApi.Mark> marks = rows.stream()
                .collect(Collectors.toMap(key, row -> mark(row, opens.getOrDefault(row.id(), List.of()),
                        documentViews.getOrDefault(row.id(), 0), delivered.get(row.id()))));
        return new EmailApi.MarksResponse(marks);
    }

    /** Summaries in the order the repository returns them (newest sent first). */
    public List<EmailApi.EmailSummary> summariesByIds(Collection<UUID> ids) {
        return summaries(emails.findByIds(ids));
    }

    public List<EmailApi.EmailSummary> summarize(List<EmailRepository.EmailRow> rows) {
        return summaries(rows);
    }

    private List<EmailApi.EmailSummary> summaries(List<EmailRepository.EmailRow> rows) {
        Map<UUID, List<EmailApi.Recipient>> recipients =
                addressBook.recipientsOf(rows.stream().map(EmailRepository.EmailRow::id).toList());
        Map<UUID, List<Instant>> opens = latestOpens(rows);
        Map<UUID, Instant> delivered = events.firstDelivered(rows.stream().map(EmailRepository.EmailRow::id).toList());
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
                        row.openStatusUnreliable(),
                        RepeatOpens.openedAgain(opens.getOrDefault(row.id(), List.of())),
                        recent(opens.getOrDefault(row.id(), List.of())),
                        row.repliedAt(),
                        delivered.get(row.id())))
                .toList();
    }

    /** One more than shown, so "opened again" can compare the latest open with the one before. */
    private Map<UUID, List<Instant>> latestOpens(List<EmailRepository.EmailRow> rows) {
        List<UUID> opened = rows.stream().filter(row -> row.openCount() > 0).map(EmailRepository.EmailRow::id).toList();
        return events.latestCountedOpens(opened, RepeatOpens.RECENT + 1);
    }

    private static List<Instant> recent(List<Instant> newestFirst) {
        return List.copyOf(newestFirst.subList(0, Math.min(RepeatOpens.RECENT, newestFirst.size())));
    }

    private static boolean matches(EmailApi.EmailSummary summary, String needle) {
        if (summary.subject() != null && summary.subject().toLowerCase(Locale.ROOT).contains(needle)) {
            return true;
        }
        return summary.recipients().stream().anyMatch(r -> r.email().contains(needle)
                || (r.name() != null && r.name().toLowerCase(Locale.ROOT).contains(needle)));
    }

    private static EmailApi.Mark mark(EmailRepository.EmailRow row, List<Instant> opens, int documentViews, Instant deliveredAt) {
        boolean engaged = row.openCount() > 0 || row.clickCount() > 0;
        return new EmailApi.Mark(
                row.id(),
                engaged ? "OPENED" : "SENT",
                row.openCount(),
                row.clickCount(),
                row.lastOpenedAt(),
                row.lastClickedAt(),
                row.openStatusUnreliable(),
                row.firstOpenedAt(),
                recent(opens),
                RepeatOpens.openedAgain(opens),
                documentViews,
                deliveredAt);
    }
}
