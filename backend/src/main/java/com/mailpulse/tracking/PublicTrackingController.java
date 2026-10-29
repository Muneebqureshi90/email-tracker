package com.mailpulse.tracking;

import com.mailpulse.common.MailPulseProperties;
import com.mailpulse.common.RandomTokens;
import com.mailpulse.common.RateLimiter;
import com.mailpulse.common.net.ClientAddress;
import com.mailpulse.emails.LinkRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

/**
 * The only internet-facing routes (public port). The pixel always answers with the same GIF, known
 * token or not, and never waits for the database. The click route redirects only to the URL stored at
 * registration; nothing in the request can change the target.
 */
@RestController
class PublicTrackingController {

    /** Smallest transparent GIF89a: 43 bytes. */
    static final byte[] PIXEL = Base64.getDecoder().decode("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==");
    static final String NO_STORE = "no-store, no-cache, must-revalidate, private, max-age=0";
    static final String SELF_HEADER = "X-MailPulse-Self";

    private final IngestQueue queue;
    private final LinkRepository links;
    private final ClientAddress clients;
    private final Clock clock;
    private final byte[] selfSecret;
    private final RateLimiter perClient;
    private final RateLimiter overall;

    PublicTrackingController(
            IngestQueue queue, LinkRepository links, ClientAddress clients, MailPulseProperties properties, Clock clock) {
        this.queue = queue;
        this.links = links;
        this.clients = clients;
        this.clock = clock;
        String secret = properties.selfHeaderSecret();
        this.selfSecret = secret == null || secret.isBlank() ? null : secret.getBytes(StandardCharsets.UTF_8);
        this.perClient = new RateLimiter(120, Duration.ofMinutes(1), clock, 10_000);
        this.overall = new RateLimiter(1_200, Duration.ofMinutes(1), clock, 1);
    }

    @RequestMapping(path = "/t/{file}", method = {RequestMethod.GET, RequestMethod.HEAD})
    ResponseEntity<byte[]> pixel(@PathVariable String file, HttpServletRequest request) {
        String token = file.endsWith(".gif") ? file.substring(0, file.length() - 4) : "";
        if (RandomTokens.isTrackingToken(token)) {
            Optional<InetAddress> client = clients.resolve(request);
            if (withinLimits(client)) {
                queue.offer(rawEvent(EventType.OPEN, token, request, client));
            }
        }
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_GIF)
                .contentLength(PIXEL.length)
                .header(HttpHeaders.CACHE_CONTROL, NO_STORE)
                .header(HttpHeaders.PRAGMA, "no-cache")
                .header(HttpHeaders.EXPIRES, "0")
                .header("Referrer-Policy", "no-referrer")
                .body(PIXEL);
    }

    @RequestMapping(path = "/c/{token}", method = {RequestMethod.GET, RequestMethod.HEAD})
    ResponseEntity<String> click(@PathVariable String token, HttpServletRequest request) {
        if (!RandomTokens.isTrackingToken(token)) {
            return notFound();
        }
        Optional<InetAddress> client = clients.resolve(request);
        if (!withinLimits(client)) {
            return plain(HttpStatus.TOO_MANY_REQUESTS, "Too many requests");
        }
        Optional<LinkRepository.LinkTarget> target = links.findTarget(token);
        if (target.isEmpty()) {
            return notFound();
        }
        queue.offer(rawEvent(EventType.CLICK, token, request, client));
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, target.get().url())
                .header(HttpHeaders.CACHE_CONTROL, NO_STORE)
                .header("Referrer-Policy", "no-referrer")
                .build();
    }

    private boolean withinLimits(Optional<InetAddress> client) {
        return perClient.tryAcquire(client.map(InetAddress::getHostAddress).orElse("unknown")) && overall.tryAcquire("all");
    }

    private RawEvent rawEvent(EventType type, String token, HttpServletRequest request, Optional<InetAddress> client) {
        return new RawEvent(
                type,
                token,
                clock.instant(),
                request.getMethod(),
                request.getHeader(HttpHeaders.USER_AGENT),
                client.orElse(null),
                isSelf(request.getHeader(SELF_HEADER)));
    }

    private boolean isSelf(String header) {
        return selfSecret != null && header != null
                && MessageDigest.isEqual(selfSecret, header.getBytes(StandardCharsets.UTF_8));
    }

    private static ResponseEntity<String> notFound() {
        return plain(HttpStatus.NOT_FOUND, "Not found");
    }

    private static ResponseEntity<String> plain(HttpStatus status, String body) {
        return ResponseEntity.status(status)
                .contentType(MediaType.TEXT_PLAIN)
                .header(HttpHeaders.CACHE_CONTROL, NO_STORE)
                .body(body);
    }
}
