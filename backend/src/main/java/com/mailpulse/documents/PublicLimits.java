package com.mailpulse.documents;

import com.mailpulse.common.RateLimiter;
import com.mailpulse.common.net.ClientAddress;
import java.net.InetAddress;
import java.time.Clock;
import java.time.Duration;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * Rate limits of the public document routes: per address for everything under /d/, per link and network (the
 * address truncated to /24 or /48) for the viewer page, its info and beats, a tighter one for the PDF and the
 * download, and one overall cap.
 */
@Component
class PublicLimits {

    private final RateLimiter perClient;
    private final RateLimiter perLink;
    private final RateLimiter files;
    private final RateLimiter overall;

    PublicLimits(Clock clock) {
        this.perClient = new RateLimiter(600, Duration.ofMinutes(1), clock, 10_000);
        this.perLink = new RateLimiter(60, Duration.ofMinutes(1), clock, 10_000);
        this.files = new RateLimiter(10, Duration.ofMinutes(1), clock, 10_000);
        this.overall = new RateLimiter(3_000, Duration.ofMinutes(1), clock, 1);
    }

    /** Viewer files (JavaScript, styles, fonts). */
    boolean asset(Optional<InetAddress> client) {
        return perClient.tryAcquire(address(client)) && overall.tryAcquire("all");
    }

    /** The viewer page, its info and its beats. */
    boolean link(String token, Optional<InetAddress> client) {
        return asset(client) && perLink.tryAcquire(token + "|" + network(client));
    }

    /** The PDF for the viewer and the download: up to 10 MB each. */
    boolean file(String token, Optional<InetAddress> client) {
        return asset(client) && files.tryAcquire(token + "|" + network(client));
    }

    private static String address(Optional<InetAddress> client) {
        return client.map(InetAddress::getHostAddress).orElse("unknown");
    }

    private static String network(Optional<InetAddress> client) {
        return client.map(ClientAddress::truncate).orElse("unknown");
    }
}
