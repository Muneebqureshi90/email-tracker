package com.mailpulse.documents;

import com.mailpulse.common.RandomTokens;
import com.mailpulse.common.crypto.FieldCipher;
import com.mailpulse.common.web.ApiException;
import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/** Write side of documents: upload, rename, new version, delete, and links (docs/v2-contract.md, Documents). */
@Service
public class DocumentService {

    public static final String NAME_COLUMN = "document.name";
    public static final String LABEL_COLUMN = "document_link.label";
    static final int MAX_BYTES = 10 * 1024 * 1024;
    static final int MAX_DOCUMENTS = 100;
    private static final Set<String> LINK_FIELDS = Set.of("label", "expiresAt", "allowDownload", "revoked");

    /** A new link, or the email's existing working link when the extension asks twice. */
    public record LinkResult(DocumentApi.DocLinkView link, boolean created) {}

    private final DocumentRepository documents;
    private final DocumentQueries queries;
    private final FieldCipher cipher;
    private final Clock clock;

    DocumentService(DocumentRepository documents, DocumentQueries queries, FieldCipher cipher, Clock clock) {
        this.documents = documents;
        this.queries = queries;
        this.cipher = cipher;
        this.clock = clock;
    }

    /** The file's associated data names the document, so a file copied to another row fails to decrypt. */
    static String fileContext(UUID documentId) {
        return "document_file.content/" + documentId;
    }

    @Transactional
    public DocumentApi.DocumentSummary upload(MultipartFile file, String name) {
        byte[] content = readPdf(file);
        documents.lockForInsert();
        if (documents.count() >= MAX_DOCUMENTS) {
            throw ApiException.conflict("At most " + MAX_DOCUMENTS + " documents can be stored. Delete one first.");
        }
        UUID id = UUID.randomUUID();
        String clean = DocumentNames.clean(name == null || name.isBlank() ? file.getOriginalFilename() : name);
        documents.insert(id, cipher.encrypt(clean, NAME_COLUMN), content.length, PdfFiles.pageCount(content), clock.instant());
        documents.saveFile(id, 1, cipher.encryptBytes(content, fileContext(id)));
        return queries.summary(id);
    }

    @Transactional
    public DocumentApi.DocumentSummary rename(UUID id, String name) {
        documents.lockVersion(id).orElseThrow(() -> ApiException.notFound("Document not found"));
        documents.rename(id, cipher.encrypt(DocumentNames.clean(name), NAME_COLUMN), clock.instant());
        return queries.summary(id);
    }

    /** A new version: every existing link serves it from now on. */
    @Transactional
    public DocumentApi.DocumentSummary replace(UUID id, MultipartFile file) {
        byte[] content = readPdf(file);
        int version = documents.lockVersion(id).orElseThrow(() -> ApiException.notFound("Document not found")) + 1;
        documents.newVersion(id, version, content.length, PdfFiles.pageCount(content), clock.instant());
        documents.saveFile(id, version, cipher.encryptBytes(content, fileContext(id)));
        return queries.summary(id);
    }

    /** The document, its file, links, views and their activity items go; its links then answer 404. */
    @Transactional
    public void delete(UUID id) {
        if (!documents.delete(id)) {
            throw ApiException.notFound("Document not found");
        }
    }

    /**
     * A link for an email ("Insert tracked file", one working link per email and document) or a share link with a
     * label. The extension token may only create email links.
     */
    @Transactional
    public LinkResult createLink(UUID documentId, DocumentApi.NewLink body, boolean extension) {
        documents.lockVersion(documentId).orElseThrow(() -> ApiException.notFound("Document not found"));
        if (extension && body.emailId() == null) {
            throw ApiException.forbidden("The extension token can only create a link for an email (emailId)");
        }
        Instant now = clock.instant();
        String label = DocumentNames.label(body.label());
        if (body.expiresAt() != null && !body.expiresAt().isAfter(now)) {
            throw ApiException.badRequest("expiresAt must be in the future");
        }
        if (body.emailId() != null) {
            if (!documents.lockEmail(body.emailId())) {
                throw ApiException.notFound("Email not found");
            }
            Optional<UUID> existing = documents.activeLinkFor(documentId, body.emailId(), now);
            if (existing.isPresent()) {
                return new LinkResult(queries.link(existing.get()), false);
            }
        }
        UUID id = UUID.randomUUID();
        documents.insertLink(id, documentId, RandomTokens.trackingToken(), body.emailId(), cipher.encrypt(label, LABEL_COLUMN),
                body.allowDownload() == null || body.allowDownload(), body.expiresAt(), now);
        return new LinkResult(queries.link(id), true);
    }

    /**
     * Changes only the fields present in the body: {@code label} (null or blank clears it), {@code expiresAt}
     * (null clears it), {@code allowDownload}, {@code revoked} (false restores the link).
     */
    @Transactional
    public DocumentApi.DocLinkView updateLink(UUID linkId, ObjectNode body) {
        DocumentRepository.LinkRow link = documents.findLink(linkId).orElseThrow(() -> ApiException.notFound("Link not found"));
        if (!LINK_FIELDS.containsAll(body.propertyNames())) {
            throw ApiException.badRequest("Only label, expiresAt, allowDownload and revoked can be changed");
        }
        Instant now = clock.instant();
        byte[] labelEnc = link.labelEnc();
        if (body.has("label")) {
            JsonNode value = body.get("label");
            if (!value.isNull() && !value.isString()) {
                throw ApiException.badRequest("label must be text");
            }
            labelEnc = cipher.encrypt(value.isNull() ? null : DocumentNames.label(value.asString()), LABEL_COLUMN);
        }
        Instant expiresAt = link.expiresAt();
        if (body.has("expiresAt")) {
            expiresAt = expiry(body.get("expiresAt"), now);
        }
        boolean allowDownload = link.allowDownload();
        if (body.has("allowDownload")) {
            allowDownload = flag(body.get("allowDownload"), "allowDownload");
        }
        Instant revokedAt = link.revokedAt();
        if (body.has("revoked")) {
            boolean revoked = flag(body.get("revoked"), "revoked");
            revokedAt = revoked ? (revokedAt == null ? now : revokedAt) : null;
        }
        documents.updateLink(linkId, labelEnc, expiresAt, allowDownload, revokedAt);
        return queries.link(linkId);
    }

    private static Instant expiry(JsonNode value, Instant now) {
        if (value.isNull()) {
            return null;
        }
        if (!value.isString()) {
            throw ApiException.badRequest("expiresAt must be an ISO-8601 time");
        }
        Instant parsed;
        try {
            parsed = Instant.parse(value.asString());
        } catch (DateTimeParseException e) {
            throw ApiException.badRequest("expiresAt must be an ISO-8601 time");
        }
        if (!parsed.isAfter(now)) {
            throw ApiException.badRequest("expiresAt must be in the future");
        }
        return parsed;
    }

    private static boolean flag(JsonNode value, String field) {
        if (!value.isBoolean()) {
            throw ApiException.badRequest(field + " must be true or false");
        }
        return value.booleanValue();
    }

    /** PDF only (the first bytes are "%PDF-"), at most 10 MB. The part's name and content type are not trusted. */
    private static byte[] readPdf(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("Choose a PDF file to upload");
        }
        if (file.getSize() > MAX_BYTES) {
            throw tooLarge();
        }
        byte[] content;
        try {
            content = file.getBytes();
        } catch (IOException e) {
            throw ApiException.badRequest("The file could not be read");
        }
        if (content.length > MAX_BYTES) {
            throw tooLarge();
        }
        if (!PdfFiles.isPdf(content)) {
            throw ApiException.badRequest("Only PDF files can be uploaded");
        }
        return content;
    }

    private static ApiException tooLarge() {
        return new ApiException(HttpStatus.CONTENT_TOO_LARGE, "The file is larger than 10 MB");
    }
}
