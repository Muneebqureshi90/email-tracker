package com.mailpulse.documents;

import com.mailpulse.activity.ActivityService;
import com.mailpulse.common.MailPulseProperties;
import com.mailpulse.common.crypto.FieldCipher;
import com.mailpulse.common.web.ApiException;
import com.mailpulse.common.web.Paging;
import com.mailpulse.emails.AddressBook;
import com.mailpulse.emails.EmailApi;
import com.mailpulse.emails.EmailService;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** Read side of documents: lists, details, per-email links and events, the hover card and quick search. */
@Service
public class DocumentQueries {

    /** DocumentDetail and EmailDetail carry at most this many links and events; the full lists are paged. */
    static final int DETAIL_ROWS = 100;

    public record ExportedDocument(DocumentApi.DocumentSummary summary, List<DocumentApi.DocLinkView> links,
            List<DocumentApi.DocEventView> events) {}

    private final DocumentRepository documents;
    private final DocumentEventRepository events;
    private final AddressBook addressBook;
    private final FieldCipher cipher;
    private final MailPulseProperties properties;

    DocumentQueries(
            DocumentRepository documents,
            DocumentEventRepository events,
            AddressBook addressBook,
            FieldCipher cipher,
            MailPulseProperties properties) {
        this.documents = documents;
        this.events = events;
        this.addressBook = addressBook;
        this.cipher = cipher;
        this.properties = properties;
    }

    public List<DocumentApi.DocumentSummary> list() {
        return documents.list().stream().map(this::summary).toList();
    }

    public DocumentApi.DocumentSummary summary(UUID id) {
        return documents.find(id).map(this::summary).orElseThrow(DocumentQueries::documentNotFound);
    }

    public DocumentApi.DocumentDetail detail(UUID id) {
        DocumentApi.DocumentSummary summary = summary(id);
        return new DocumentApi.DocumentDetail(
                summary, links(documents.links(id, DETAIL_ROWS, 0)), eventViews(events.forDocument(id, DETAIL_ROWS, 0)));
    }

    public EmailApi.Page<DocumentApi.DocLinkView> links(UUID id, int page, int size) {
        Paging.check(page, size);
        summary(id);
        return new EmailApi.Page<>(links(documents.links(id, size, (long) page * size)), page, size, documents.countLinks(id));
    }

    public EmailApi.Page<DocumentApi.DocEventView> events(UUID id, int page, int size) {
        Paging.check(page, size);
        summary(id);
        return new EmailApi.Page<>(
                eventViews(events.forDocument(id, size, (long) page * size)), page, size, events.countForDocument(id));
    }

    public DocumentApi.DocLinkView link(UUID linkId) {
        return documents.findLink(linkId).map(row -> links(List.of(row)).getFirst())
                .orElseThrow(() -> ApiException.notFound("Link not found"));
    }

    /** The document links of one email, oldest first (the email page). */
    public List<DocumentApi.DocLinkView> linksForEmail(UUID emailId) {
        return links(documents.linksForEmail(emailId));
    }

    /** The latest document events of one email's links, newest first. */
    public List<DocumentApi.DocEventView> eventsForEmail(UUID emailId, int limit) {
        return eventViews(events.forEmail(emailId, limit));
    }

    /** Per document link of the email: its name and counts (the Gmail hover card). */
    public List<DocumentApi.CardDocument> forCard(UUID emailId) {
        return documents.linksForEmail(emailId).stream()
                .map(row -> new DocumentApi.CardDocument(name(row.documentNameEnc()), row.views(), row.reads(), row.downloads()))
                .toList();
    }

    /** Counted views of the document links of each email (Mark.documentViews). */
    public Map<UUID, Integer> viewsByEmail(Collection<UUID> emailIds) {
        return events.countedViewsByEmail(emailIds);
    }

    /** Quick search: up to {@code limit} most recently updated documents whose name contains the text. */
    public List<DocumentApi.DocumentSummary> search(String text, int limit) {
        String needle = text.trim().toLowerCase(Locale.ROOT);
        List<UUID> ids = documents.names().stream()
                .filter(row -> name(row.nameEnc()).toLowerCase(Locale.ROOT).contains(needle))
                .limit(limit)
                .map(DocumentRepository.DocumentRow::id)
                .toList();
        return documents.findByIds(ids).stream().map(this::summary).toList();
    }

    /** Every document with all its links and events, for the data export (never the file). */
    public List<ExportedDocument> exportAll() {
        return documents.list().stream()
                .map(row -> new ExportedDocument(
                        summary(row),
                        links(documents.links(row.id(), Integer.MAX_VALUE, 0)),
                        eventViews(events.forDocument(row.id(), Integer.MAX_VALUE, 0))))
                .toList();
    }

    String name(byte[] nameEnc) {
        return cipher.decrypt(nameEnc, DocumentService.NAME_COLUMN);
    }

    private DocumentApi.DocumentSummary summary(DocumentRepository.DocumentRow row) {
        return new DocumentApi.DocumentSummary(
                row.id(),
                name(row.nameEnc()),
                row.sizeBytes(),
                row.pageCount(),
                row.version(),
                row.createdAt(),
                row.updatedAt(),
                row.views(),
                row.reads(),
                row.downloads(),
                row.lastActivityAt());
    }

    private List<DocumentApi.DocLinkView> links(List<DocumentRepository.LinkRow> rows) {
        Map<UUID, List<EmailApi.Recipient>> recipients = addressBook.recipientsOf(
                rows.stream().map(DocumentRepository.LinkRow::emailId).filter(Objects::nonNull).distinct().toList());
        return rows.stream()
                .map(row -> new DocumentApi.DocLinkView(
                        row.id(),
                        row.documentId(),
                        name(row.documentNameEnc()),
                        url(row.token()),
                        cipher.decrypt(row.labelEnc(), DocumentService.LABEL_COLUMN),
                        row.emailId(),
                        cipher.decrypt(row.subjectEnc(), EmailService.SUBJECT_COLUMN),
                        row.emailId() == null ? null
                                : ActivityService.recipientSummary(recipients.getOrDefault(row.emailId(), List.of())),
                        row.createdAt(),
                        row.expiresAt(),
                        row.revokedAt(),
                        row.allowDownload(),
                        row.views(),
                        row.reads(),
                        row.downloads(),
                        row.lastActivityAt()))
                .toList();
    }

    private static List<DocumentApi.DocEventView> eventViews(List<DocumentEventRepository.EventRow> rows) {
        return rows.stream()
                .map(row -> new DocumentApi.DocEventView(
                        row.id(),
                        row.linkId(),
                        row.type(),
                        row.at(),
                        row.verdict(),
                        row.reason(),
                        row.source(),
                        row.userAgent(),
                        row.ipPrefix(),
                        row.visibleMs() == null ? null : (int) (row.visibleMs() / 1000),
                        row.pagesViewed()))
                .toList();
    }

    String url(String token) {
        return properties.publicBaseUrl() + "/d/" + token;
    }

    private static ApiException documentNotFound() {
        return ApiException.notFound("Document not found");
    }
}
