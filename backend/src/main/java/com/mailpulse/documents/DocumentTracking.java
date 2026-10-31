package com.mailpulse.documents;

import com.mailpulse.activity.ActivityService;
import com.mailpulse.alerts.AlertService;
import com.mailpulse.common.crypto.FieldCipher;
import com.mailpulse.common.net.ClientAddress;
import com.mailpulse.common.web.ApiException;
import com.mailpulse.settings.Settings;
import com.mailpulse.settings.SettingsService;
import com.mailpulse.tracking.EventClassifier;
import com.mailpulse.tracking.EventType;
import com.mailpulse.tracking.FinalizerRules;
import com.mailpulse.tracking.Reason;
import com.mailpulse.tracking.Source;
import com.mailpulse.tracking.TrackingEventRepository;
import java.net.InetAddress;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Counts document views, reads and downloads from the public routes. The first beat of a viewer page counts a
 * view; visible time adds up per view and turns it into a read at {@code docReadSeconds}. The owner's own
 * requests (self header), HEAD requests, scanners, delivery-time checks and bursts never count: the click rules.
 * Events are decided at once (no self-view hold) and published to the feed when the transaction commits.
 */
@Service
public class DocumentTracking {

    /** Visible time one beat can add; the viewer beats every 5 s while the page is visible. */
    static final long MAX_BEAT_MS = 10_000;
    /** A page's counted time never runs ahead of the wall clock since its first beat by more than this. */
    static final long CLOCK_SLACK_MS = 10_000;
    /** Page counts and page numbers a beat may report. */
    static final int MAX_PAGES = 5_000;
    private static final int MAX_USER_AGENT = 512;

    private static final Logger log = LoggerFactory.getLogger(DocumentTracking.class);

    enum Status {
        OK,
        NOT_FOUND,
        GONE,
        DOWNLOAD_OFF
    }

    /** What the public route knows about the request. {@code client} is null when unknown. */
    record Request(Instant at, String method, String userAgent, InetAddress client, boolean self) {}

    record Download(Status status, String name, byte[] content, int sizeBytes) {}

    private record Origin(Source source, String ipPrefix, String sourceKey, String userAgent) {}

    private final DocumentRepository documents;
    private final DocumentEventRepository events;
    private final DocumentQueries queries;
    private final ActivityService activity;
    private final AlertService alerts;
    private final TrackingEventRepository clicks;
    private final SettingsService settings;
    private final FieldCipher cipher;
    private final TransactionTemplate transactions;

    DocumentTracking(
            DocumentRepository documents,
            DocumentEventRepository events,
            DocumentQueries queries,
            ActivityService activity,
            AlertService alerts,
            TrackingEventRepository clicks,
            SettingsService settings,
            FieldCipher cipher,
            TransactionTemplate transactions) {
        this.documents = documents;
        this.events = events;
        this.queries = queries;
        this.activity = activity;
        this.alerts = alerts;
        this.clicks = clicks;
        this.settings = settings;
        this.cipher = cipher;
        this.transactions = transactions;
    }

    Optional<DocumentRepository.PublicLink> find(String token) {
        return documents.findByToken(token);
    }

    /** OK, or GONE when the owner revoked the link or its expiry time has come. */
    static Status status(DocumentRepository.PublicLink link, Instant now) {
        return closed(link, now) || limitReached(link) ? Status.GONE : Status.OK;
    }

    /** Revoked by the owner or past its expiry time. */
    private static boolean closed(DocumentRepository.PublicLink link, Instant now) {
        boolean expired = link.expiresAt() != null && !now.isBefore(link.expiresAt());
        return link.revokedAt() != null || expired;
    }

    /** The link has its maxViews counted views; the owner's own views never count. */
    private static boolean limitReached(DocumentRepository.PublicLink link) {
        return link.maxViews() != null && link.countedViews() >= link.maxViews();
    }

    DocumentApi.LinkInfo info(DocumentRepository.PublicLink link) {
        return new DocumentApi.LinkInfo(queries.name(link.documentNameEnc()), link.pageCount(), link.sizeBytes(), link.allowDownload());
    }

    String name(DocumentRepository.PublicLink link) {
        return queries.name(link.documentNameEnc());
    }

    /** The decrypted file (latest version) for the viewer. */
    byte[] content(DocumentRepository.PublicLink link) {
        byte[] stored = documents.content(link.documentId()).orElseThrow(() -> ApiException.notFound("Link not found"));
        return cipher.decryptBytes(stored, DocumentService.fileContext(link.documentId()));
    }

    /** One heartbeat of the viewer (POST /d/{token}/beat). */
    Status beat(String token, DocumentApi.Beat beat, Request request) {
        DocumentApi.Beat valid = validate(beat);
        Optional<DocumentRepository.PublicLink> found = documents.findByToken(token);
        if (found.isEmpty()) {
            return Status.NOT_FOUND;
        }
        DocumentRepository.PublicLink link = found.get();
        // Views that already started keep beating after the view limit is reached; only new views get GONE.
        if (closed(link, request.at())) {
            return Status.GONE;
        }
        Settings current = settings.current();
        List<Long> created = transactions.execute(tx -> recordBeat(link, valid, request, current));
        if (created == null) {
            return Status.GONE;
        }
        publish(created);
        return Status.OK;
    }

    /** GET or HEAD /d/{token}/file: counts a download unless a rule says otherwise, then hands out the file. */
    Download download(String token, Request request) {
        Optional<DocumentRepository.PublicLink> found = documents.findByToken(token);
        if (found.isEmpty()) {
            return new Download(Status.NOT_FOUND, null, null, 0);
        }
        DocumentRepository.PublicLink link = found.get();
        if (status(link, request.at()) != Status.OK) {
            return new Download(Status.GONE, null, null, 0);
        }
        if (!link.allowDownload()) {
            return new Download(Status.DOWNLOAD_OFF, null, null, 0);
        }
        Settings current = settings.current();
        try {
            publish(transactions.execute(tx -> recordDownload(link, request, current)));
        } catch (RuntimeException e) {
            // Fail open: the recipient still gets the file when the event cannot be saved.
            log.warn("Could not save a document download ({})", e.getClass().getSimpleName());
        }
        byte[] content = "HEAD".equals(request.method()) ? null : content(link);
        return new Download(Status.OK, name(link), content, link.sizeBytes());
    }

    /**
     * The accepted part of a beat's visible time: at most MAX_BEAT_MS, and never more than the wall-clock time
     * since the page's first beat plus CLOCK_SLACK_MS, minus what this page already added.
     */
    static long acceptedMs(Instant firstBeatAt, long ownMs, long visibleMs, Instant now) {
        long allowance = Math.max(0, Duration.between(firstBeatAt, now).toMillis()) + CLOCK_SLACK_MS - ownMs;
        return Math.max(0, Math.min(Math.min(visibleMs, MAX_BEAT_MS), allowance));
    }

    /** 400 for a malformed beat; otherwise the beat with visibleMs capped and page numbers sorted and unique. */
    static DocumentApi.Beat validate(DocumentApi.Beat beat) {
        if (beat == null || beat.viewId() == null || beat.visibleMs() == null || beat.page() == null
                || beat.pagesViewed() == null || beat.pageCount() == null) {
            throw ApiException.badRequest("A beat needs viewId, visibleMs, page, pagesViewed and pageCount");
        }
        int pageCount = beat.pageCount();
        if (pageCount < 1 || pageCount > MAX_PAGES) {
            throw ApiException.badRequest("pageCount must be between 1 and " + MAX_PAGES);
        }
        if (beat.visibleMs() < 0) {
            throw ApiException.badRequest("visibleMs must not be negative");
        }
        if (beat.page() < 1 || beat.page() > pageCount) {
            throw ApiException.badRequest("page must be between 1 and pageCount");
        }
        if (beat.pagesViewed().size() > MAX_PAGES
                || beat.pagesViewed().stream().anyMatch(page -> page == null || page < 1 || page > pageCount)) {
            throw ApiException.badRequest("pagesViewed must list pages between 1 and pageCount");
        }
        List<Integer> pages = List.copyOf(new TreeSet<>(beat.pagesViewed()));
        return new DocumentApi.Beat(beat.viewId(), Math.min(beat.visibleMs(), MAX_BEAT_MS), beat.page(), pages, pageCount);
    }

    private List<Long> recordBeat(DocumentRepository.PublicLink link, DocumentApi.Beat beat, Request request, Settings current) {
        events.lockLink(link.id());
        List<Long> created = new ArrayList<>();
        Instant now = request.at();
        Origin origin = origin(request, current);
        DocumentEventRepository.ViewRow own = events.findView(link.id(), beat.viewId()).orElse(null);
        long viewId;
        if (own != null) {
            viewId = own.mergedInto() != null ? own.mergedInto() : own.id();
        } else {
            Optional<DocumentEventRepository.ViewRow> recent = request.self() || current.dedupeWindowSeconds() == 0
                    ? Optional.empty()
                    : events.recentView(link.id(), origin.sourceKey(), now.minusSeconds(current.dedupeWindowSeconds()));
            if (recent.isPresent()) {
                // The same reader again within the duplicate window (a reload): the earlier view goes on.
                viewId = recent.get().id();
                own = events.view(events.insertView(link.id(), beat.viewId(), viewId, origin.sourceKey(), recent.get().counted(), now))
                        .orElseThrow();
            } else {
                if (link.maxViews() != null && events.countedViews(link.id()) >= link.maxViews()) {
                    return null; // a new view of a link that has its maxViews counted views: GONE
                }
                Optional<Reason> reason = decide(link, request, origin, false, current);
                viewId = events.insertView(link.id(), beat.viewId(), null, origin.sourceKey(), reason.isEmpty(), now);
                own = events.view(viewId).orElseThrow();
                DocumentEventRepository.Seq seq = reason.isEmpty() ? events.next(link.id(), DocKinds.VIEW) : null;
                long eventId = events.insertEvent(newEvent(link, viewId, DocKinds.VIEW, request, origin, reason, seq));
                if (seq != null) {
                    created.add(activity.recordDocument(DocKinds.VIEW, link.emailId(), eventId, now));
                    alerts.onDocumentViewCounted(link.id(), link.emailId(), seq.number(), now).ifPresent(created::add);
                }
            }
        }
        long accepted = acceptedMs(own.firstBeatAt(), own.ownMs(), beat.visibleMs(), now);
        events.addTime(own.id(), viewId, accepted, pages(beat.pagesViewed()), beat.pageCount(), now);
        DocumentEventRepository.ViewRow view = events.view(viewId).orElseThrow();
        if (view.counted() && accepted > 0) {
            events.addPageTime(viewId, beat.page(), accepted);
        }
        if (view.counted() && view.readAt() == null && view.visibleMs() >= current.docReadSeconds() * 1000L) {
            events.markRead(viewId, now);
            long readId = events.insertEvent(newEvent(link, viewId, DocKinds.READ, request, origin, Optional.empty(), events.viewSeq(viewId)));
            created.add(activity.recordDocument(DocKinds.READ, link.emailId(), readId, now));
        }
        return created;
    }

    private List<Long> recordDownload(DocumentRepository.PublicLink link, Request request, Settings current) {
        events.lockLink(link.id());
        Origin origin = origin(request, current);
        Instant now = request.at();
        boolean duplicate = current.dedupeWindowSeconds() > 0 && events.countedDuplicate(
                link.id(), DocKinds.DOWNLOAD, origin.sourceKey(), now.minusSeconds(current.dedupeWindowSeconds()), now);
        Optional<Reason> reason = decide(link, request, origin, duplicate, current);
        DocumentEventRepository.Seq seq = reason.isEmpty() ? events.next(link.id(), DocKinds.DOWNLOAD) : null;
        long eventId = events.insertEvent(newEvent(link, null, DocKinds.DOWNLOAD, request, origin, reason, seq));
        return seq == null ? List.of() : List.of(activity.recordDocument(DocKinds.DOWNLOAD, link.emailId(), eventId, now));
    }

    /**
     * The click rules: self header, tracking off, HEAD, scanner user agents and Apple prefetch at once; then the
     * send grace, unsent drafts, delivery-time checks, bursts with the email's tracked links, and duplicates.
     */
    private Optional<Reason> decide(
            DocumentRepository.PublicLink link, Request request, Origin origin, boolean duplicate, Settings current) {
        Optional<Reason> immediate = EventClassifier.immediateReason(
                request.self(), request.method(), origin.source(), link.trackingEnabled(), current.countApplePrefetch());
        if (immediate.isPresent()) {
            return immediate;
        }
        // The document link is one of the links a scanner fetches all at once, so two more make a burst.
        boolean burst = link.emailId() != null && clicks.distinctLinksClicked(link.emailId(),
                request.at().minus(FinalizerRules.BURST_WINDOW), request.at().plus(FinalizerRules.BURST_WINDOW))
                >= FinalizerRules.BURST_LINKS - 1;
        return FinalizerRules.decide(new FinalizerRules.Facts(request.at(), origin.source(), link.emailStatus(), link.sentAt(),
                false, duplicate, EventType.CLICK, burst), Duration.ofSeconds(current.sendGraceSeconds()));
    }

    private static Origin origin(Request request, Settings current) {
        Source source = EventClassifier.source(request.userAgent());
        String ipPrefix = current.ipMode() == Settings.IpMode.TRUNCATED && request.client() != null
                ? ClientAddress.truncate(request.client())
                : null;
        String userAgent = request.userAgent() == null || request.userAgent().length() <= MAX_USER_AGENT
                ? request.userAgent()
                : request.userAgent().substring(0, MAX_USER_AGENT);
        return new Origin(source, ipPrefix, EventClassifier.sourceKey(source, ipPrefix, request.userAgent()), userAgent);
    }

    private static DocumentEventRepository.NewEvent newEvent(DocumentRepository.PublicLink link, Long viewId, String type,
            Request request, Origin origin, Optional<Reason> reason, DocumentEventRepository.Seq seq) {
        return new DocumentEventRepository.NewEvent(link.id(), viewId, type, request.at(), request.method(), origin.userAgent(),
                origin.ipPrefix(), origin.source().name(), origin.sourceKey(), reason.map(Enum::name).orElse(null), seq);
    }

    /** A PostgreSQL int array literal from validated page numbers. */
    private static String pages(List<Integer> pages) {
        return pages.stream().map(String::valueOf).collect(Collectors.joining(",", "{", "}"));
    }

    private void publish(List<Long> created) {
        if (created != null && !created.isEmpty()) {
            activity.publish(created);
        }
    }

    /** Document activity kinds (docs/v2-contract.md). */
    static final class DocKinds {
        static final String VIEW = "DOC_VIEW";
        static final String READ = "DOC_READ";
        static final String DOWNLOAD = "DOC_DOWNLOAD";

        private DocKinds() {}
    }
}
