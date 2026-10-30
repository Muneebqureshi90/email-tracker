package com.mailpulse.documents;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Request and response bodies of the document API (docs/v2-contract.md, Documents). File contents never appear. */
public final class DocumentApi {

    private DocumentApi() {}

    public record DocumentSummary(
            UUID id,
            String name,
            long sizeBytes,
            Integer pageCount,
            int version,
            Instant createdAt,
            Instant updatedAt,
            long views,
            long reads,
            long downloads,
            Instant lastActivityAt) {}

    /**
     * One link of a document. {@code documentId} and {@code documentName} say which document it shares (the email
     * page lists the email's links); {@code recipients} is the email's recipient summary, null for a share link.
     */
    public record DocLinkView(
            UUID id,
            UUID documentId,
            String documentName,
            String url,
            String label,
            UUID emailId,
            String emailSubject,
            String recipients,
            Instant createdAt,
            Instant expiresAt,
            Instant revokedAt,
            boolean allowDownload,
            long views,
            long reads,
            long downloads,
            Instant lastActivityAt) {}

    /**
     * One view, read or download. {@code readSeconds} and {@code pagesViewed} (how many different pages) belong to
     * the view of a DOC_VIEW or DOC_READ and keep growing while that view goes on; null for downloads.
     */
    public record DocEventView(
            long id,
            UUID linkId,
            String type,
            Instant at,
            String verdict,
            String reason,
            String source,
            String userAgent,
            String ipPrefix,
            Integer readSeconds,
            Integer pagesViewed) {}

    public record DocumentDetail(DocumentSummary summary, List<DocLinkView> links, List<DocEventView> events) {}

    /** {@code allowDownload} defaults to true; {@code emailId} is required with the extension token. */
    public record NewLink(@Size(max = 200) String label, UUID emailId, Instant expiresAt, Boolean allowDownload) {}

    public record Rename(@NotBlank @Size(max = 500) String name) {}

    /** What the Gmail hover card shows for each document link of an email. */
    public record CardDocument(String name, long views, long reads, long downloads) {}

    /** GET /d/{token}/info, for the viewer page. */
    public record LinkInfo(String name, Integer pageCount, long sizeBytes, boolean allowDownload) {}

    /** POST /d/{token}/beat from the viewer: pagesViewed lists page numbers; visibleMs above 10000 is capped. */
    public record Beat(UUID viewId, Long visibleMs, Integer page, List<Integer> pagesViewed, Integer pageCount) {}
}
