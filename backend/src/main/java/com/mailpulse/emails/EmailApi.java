package com.mailpulse.emails;

import com.mailpulse.documents.DocumentApi;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Request and response bodies of the email API. Body text never appears in any of them. */
public final class EmailApi {

    static final String GMAIL_ID = "[A-Za-z0-9:_-]{1,64}";

    private EmailApi() {}

    public enum RecipientKind {
        TO,
        CC,
        BCC
    }

    public record RegisterEmailRequest(
            @NotBlank @Email @Size(max = 254) String account,
            @NotNull UUID clientRef,
            Boolean trackOpens,
            Boolean trackLinks) {}

    public record RegisterEmailResponse(UUID id, String pixelUrl, boolean trackOpens, boolean trackLinks, boolean created) {}

    public record RegisterLinksRequest(@NotNull @Size(min = 1, max = 200) List<@NotBlank @Size(max = 2048) String> urls) {}

    public record TrackedLink(UUID linkId, String originalUrl, String trackedUrl) {}

    public record RegisterLinksResponse(List<TrackedLink> links, List<String> rejected) {}

    public record Recipient(
            @NotBlank @Email @Size(max = 254) String email, @Size(max = 200) String name, @NotNull RecipientKind kind) {}

    public record UpdateEmailRequest(
            @NotNull EmailStatus status,
            @Pattern(regexp = GMAIL_ID) String gmailMessageId,
            @Pattern(regexp = GMAIL_ID) String gmailThreadId,
            Instant sentAt,
            @Size(max = 998) String subject,
            @Size(max = 100) List<@Valid Recipient> recipients,
            @Size(max = 200) List<UUID> usedLinkIds) {}

    /** Any field left null keeps its value. followUpHours 0 removes the per-email override. */
    public record PreferencesRequest(Boolean notifications, Integer followUpHours, Boolean trackingEnabled, Boolean trackLinks) {}

    public record TokenLookup(UUID id, EmailStatus status) {}

    public record EmailSummary(
            UUID id,
            String account,
            String subject,
            EmailStatus status,
            Instant createdAt,
            Instant sentAt,
            List<Recipient> recipients,
            int openCount,
            int clickCount,
            Instant firstOpenedAt,
            Instant lastOpenedAt,
            Instant lastClickedAt,
            boolean openStatusUnreliable,
            boolean openedAgain,
            List<Instant> recentOpens) {}

    /** One counted open, for the timeline of every open. */
    public record OpenView(long eventId, Instant at, String source) {}

    public record LinkView(UUID id, String url, boolean used, int clickCount, Instant firstClickedAt, Instant lastClickedAt) {}

    public record EventView(
            long id,
            String type,
            Instant receivedAt,
            String verdict,
            String reason,
            String source,
            UUID linkId,
            String userAgent,
            String ipPrefix) {}

    /**
     * @param documentLinks the email's document links ("Insert tracked file"), oldest first
     * @param documentEvents the latest 100 views, reads and downloads of those links, newest first
     */
    public record EmailDetail(
            EmailSummary summary,
            boolean trackOpens,
            boolean trackLinks,
            boolean trackingEnabled,
            boolean notifications,
            Integer followUpHours,
            String gmailMessageId,
            String gmailThreadId,
            Instant cancelledAt,
            List<LinkView> links,
            List<EventView> events,
            List<OpenView> opens,
            List<DocumentApi.DocLinkView> documentLinks,
            List<DocumentApi.DocEventView> documentEvents) {}

    /** Totals for the email filter labels. */
    public record EmailCounts(long all, long opened, long notOpened, long clicked) {}

    public record Page<T>(List<T> items, int page, int size, long total) {}

    /** @param documentViews counted views of the email's document links */
    public record Mark(
            UUID emailId,
            String state,
            int openCount,
            int clickCount,
            Instant lastOpenedAt,
            Instant lastClickedAt,
            boolean openStatusUnreliable,
            Instant firstOpenedAt,
            List<Instant> recentOpens,
            boolean openedAgain,
            int documentViews) {}

    public record MarksResponse(Map<String, Mark> marks) {}
}
