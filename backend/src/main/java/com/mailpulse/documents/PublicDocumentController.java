package com.mailpulse.documents;

import com.mailpulse.common.RandomTokens;
import com.mailpulse.common.net.ClientAddress;
import com.mailpulse.common.web.ApiException;
import com.mailpulse.tracking.SelfHeader;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * Document links on the public port (docs/v2-contract.md, Public document routes): the viewer page, its info,
 * the PDF, the download and the viewer's heartbeats. No session, cookie or CSRF token is involved; the token in
 * the path is the only key. Expired, revoked and unknown links get friendly pages, never a stack trace.
 */
@RestController
class PublicDocumentController {

    /** The viewer: its own scripts, styles, fonts and worker only; nothing may frame it. */
    static final String VIEWER_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; "
            + "font-src 'self'; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; "
            + "form-action 'none'";
    private static final String DATA_CSP = "default-src 'none'; frame-ancestors 'none'";
    private static final String NO_STORE = "no-store";
    private static final int MAX_BEAT_BYTES = 64 * 1024;
    private static final MediaType HTML = new MediaType(MediaType.TEXT_HTML, StandardCharsets.UTF_8);
    private static final JsonMapper JSON =
            JsonMapper.builder().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();

    private final DocumentTracking tracking;
    private final ViewerFiles viewer;
    private final PublicLimits limits;
    private final ClientAddress clients;
    private final SelfHeader selfHeader;
    private final Clock clock;

    PublicDocumentController(
            DocumentTracking tracking, ViewerFiles viewer, PublicLimits limits, ClientAddress clients, SelfHeader selfHeader,
            Clock clock) {
        this.tracking = tracking;
        this.viewer = viewer;
        this.limits = limits;
        this.clients = clients;
        this.selfHeader = selfHeader;
        this.clock = clock;
    }

    /** The viewer page. Serving it counts nothing: the viewer's first beat counts the view. */
    @RequestMapping(path = "/d/{token}", method = {RequestMethod.GET, RequestMethod.HEAD})
    ResponseEntity<byte[]> page(@PathVariable String token, HttpServletRequest request) {
        if (!RandomTokens.isTrackingToken(token)) {
            return FriendlyPages.notFound();
        }
        if (!limits.link(token, clients.resolve(request))) {
            return FriendlyPages.tooManyRequests();
        }
        Optional<DocumentRepository.PublicLink> link = tracking.find(token);
        if (link.isEmpty()) {
            return FriendlyPages.notFound();
        }
        if (DocumentTracking.status(link.get(), clock.instant()) != DocumentTracking.Status.OK) {
            return FriendlyPages.gone();
        }
        Optional<byte[]> html = viewer.index();
        if (html.isEmpty()) {
            return FriendlyPages.unavailable();
        }
        return ResponseEntity.ok()
                .contentType(HTML)
                .header("Content-Security-Policy", VIEWER_CSP)
                .header(HttpHeaders.CACHE_CONTROL, NO_STORE)
                .header("Referrer-Policy", "no-referrer")
                .header("X-Content-Type-Options", "nosniff")
                .body(html.get());
    }

    @RequestMapping(path = "/d/{token}/info", method = {RequestMethod.GET, RequestMethod.HEAD})
    ResponseEntity<?> info(@PathVariable String token, HttpServletRequest request) {
        if (!RandomTokens.isTrackingToken(token)) {
            return problem(HttpStatus.NOT_FOUND, "Link not found");
        }
        if (!limits.link(token, clients.resolve(request))) {
            return problem(HttpStatus.TOO_MANY_REQUESTS, "Too many requests");
        }
        Optional<DocumentRepository.PublicLink> link = tracking.find(token);
        if (link.isEmpty()) {
            return problem(HttpStatus.NOT_FOUND, "Link not found");
        }
        if (DocumentTracking.status(link.get(), clock.instant()) != DocumentTracking.Status.OK) {
            return problem(HttpStatus.GONE, "This link has expired or was turned off");
        }
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).headers(dataHeaders()).body(tracking.info(link.get()));
    }

    /** The PDF for the viewer, shown inline. */
    @RequestMapping(path = "/d/{token}/pdf", method = {RequestMethod.GET, RequestMethod.HEAD})
    ResponseEntity<?> pdf(@PathVariable String token, HttpServletRequest request) {
        if (!RandomTokens.isTrackingToken(token)) {
            return problem(HttpStatus.NOT_FOUND, "Link not found");
        }
        if (!limits.file(token, clients.resolve(request))) {
            return problem(HttpStatus.TOO_MANY_REQUESTS, "Too many requests");
        }
        Optional<DocumentRepository.PublicLink> link = tracking.find(token);
        if (link.isEmpty()) {
            return problem(HttpStatus.NOT_FOUND, "Link not found");
        }
        if (DocumentTracking.status(link.get(), clock.instant()) != DocumentTracking.Status.OK) {
            return problem(HttpStatus.GONE, "This link has expired or was turned off");
        }
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .headers(dataHeaders())
                .header(HttpHeaders.CONTENT_DISPOSITION, DocumentNames.contentDisposition("inline", tracking.name(link.get())))
                .body(tracking.content(link.get()));
    }

    /** The download. Counts DOC_DOWNLOAD (HEAD, scanners, bursts, duplicates and the owner's own never do). */
    @RequestMapping(path = "/d/{token}/file", method = {RequestMethod.GET, RequestMethod.HEAD})
    ResponseEntity<byte[]> file(@PathVariable String token, HttpServletRequest request) {
        if (!RandomTokens.isTrackingToken(token)) {
            return FriendlyPages.notFound();
        }
        Optional<InetAddress> client = clients.resolve(request);
        if (!limits.file(token, client)) {
            return FriendlyPages.tooManyRequests();
        }
        DocumentTracking.Download download = tracking.download(token, request(request, client));
        return switch (download.status()) {
            case NOT_FOUND -> FriendlyPages.notFound();
            case GONE -> FriendlyPages.gone();
            case DOWNLOAD_OFF -> FriendlyPages.downloadOff(token);
            case OK -> {
                ResponseEntity.BodyBuilder ok = ResponseEntity.ok()
                        .contentType(MediaType.APPLICATION_PDF)
                        .headers(dataHeaders())
                        .header(HttpHeaders.CONTENT_DISPOSITION, DocumentNames.contentDisposition("attachment", download.name()));
                yield download.content() == null ? ok.contentLength(download.sizeBytes()).build() : ok.body(download.content());
            }
        };
    }

    /** A viewer heartbeat: JSON (or text/plain holding JSON, as sendBeacon may send it). */
    @PostMapping("/d/{token}/beat")
    ResponseEntity<?> beat(@PathVariable String token, HttpServletRequest request) {
        if (!RandomTokens.isTrackingToken(token)) {
            return problem(HttpStatus.NOT_FOUND, "Link not found");
        }
        Optional<InetAddress> client = clients.resolve(request);
        if (!limits.link(token, client)) {
            return problem(HttpStatus.TOO_MANY_REQUESTS, "Too many requests");
        }
        if (!isJsonOrText(request.getContentType())) {
            return problem(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Send the beat as application/json");
        }
        DocumentApi.Beat beat = parse(readBody(request));
        return switch (tracking.beat(token, beat, request(request, client))) {
            case OK -> ResponseEntity.noContent().header(HttpHeaders.CACHE_CONTROL, NO_STORE).build();
            case GONE -> problem(HttpStatus.GONE, "This link has expired or was turned off");
            default -> problem(HttpStatus.NOT_FOUND, "Link not found");
        };
    }

    private DocumentTracking.Request request(HttpServletRequest request, Optional<InetAddress> client) {
        return new DocumentTracking.Request(
                clock.instant(), request.getMethod(), request.getHeader(HttpHeaders.USER_AGENT), client.orElse(null),
                selfHeader.isSelf(request));
    }

    private static boolean isJsonOrText(String contentType) {
        if (contentType == null) {
            return false;
        }
        try {
            MediaType type = MediaType.parseMediaType(contentType);
            return MediaType.APPLICATION_JSON.equalsTypeAndSubtype(type) || MediaType.TEXT_PLAIN.equalsTypeAndSubtype(type);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private static byte[] readBody(HttpServletRequest request) {
        if (request.getContentLengthLong() > MAX_BEAT_BYTES) {
            throw new ApiException(HttpStatus.CONTENT_TOO_LARGE, "The beat is too large");
        }
        try (InputStream in = request.getInputStream()) {
            byte[] body = in.readNBytes(MAX_BEAT_BYTES + 1);
            if (body.length > MAX_BEAT_BYTES) {
                throw new ApiException(HttpStatus.CONTENT_TOO_LARGE, "The beat is too large");
            }
            return body;
        } catch (IOException e) {
            throw ApiException.badRequest("The beat could not be read");
        }
    }

    private static DocumentApi.Beat parse(byte[] body) {
        try {
            return JSON.readValue(body, DocumentApi.Beat.class);
        } catch (JacksonException e) {
            throw ApiException.badRequest("The beat is not valid JSON");
        }
    }

    private static HttpHeaders dataHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.CACHE_CONTROL, NO_STORE);
        headers.set("Content-Security-Policy", DATA_CSP);
        headers.set("Referrer-Policy", "no-referrer");
        headers.set("X-Content-Type-Options", "nosniff");
        return headers;
    }

    private static ResponseEntity<ProblemDetail> problem(HttpStatus status, String detail) {
        return ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .headers(dataHeaders())
                .body(ProblemDetail.forStatusAndDetail(status, detail));
    }
}
