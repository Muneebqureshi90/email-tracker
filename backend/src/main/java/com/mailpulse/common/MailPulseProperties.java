package com.mailpulse.common;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Settings that come from the environment (infra/.env), not from the settings table.
 *
 * @param publicPort port of the public connector (0 picks a free port, used in tests)
 * @param publicBaseUrl base URL that recipients reach, used to build pixel and link URLs
 * @param allowedHostNames Host header names accepted on the private port (DNS-rebinding defence)
 * @param dashboardOrigins browser origins of the dashboard
 * @param extensionOrigins chrome-extension:// origins allowed to call the API
 * @param trustedProxies CIDR ranges whose X-Forwarded-For header is believed
 * @param encryptionKey base64 32-byte master key for field encryption and blind indexes
 * @param jwtSecret base64 secret (at least 32 bytes) for session JWTs
 * @param selfHeaderSecret value of the X-MailPulse-Self header that marks the owner's own requests
 */
@ConfigurationProperties("mailpulse")
public record MailPulseProperties(
        int publicPort,
        String publicBaseUrl,
        List<String> allowedHostNames,
        List<String> dashboardOrigins,
        List<String> extensionOrigins,
        List<String> trustedProxies,
        String encryptionKey,
        String jwtSecret,
        String selfHeaderSecret,
        Duration sessionTtl,
        boolean sessionCookieSecure,
        int ingestQueueCapacity,
        boolean jobsEnabled) {

    public MailPulseProperties {
        if (publicPort < 0 || publicPort > 65535) {
            throw new IllegalArgumentException("mailpulse.public-port must be between 0 and 65535");
        }
        if (publicBaseUrl == null || publicBaseUrl.isBlank()) {
            throw new IllegalArgumentException("mailpulse.public-base-url is required");
        }
        publicBaseUrl = publicBaseUrl.endsWith("/") ? publicBaseUrl.substring(0, publicBaseUrl.length() - 1) : publicBaseUrl;
        allowedHostNames = clean(allowedHostNames);
        dashboardOrigins = clean(dashboardOrigins);
        extensionOrigins = clean(extensionOrigins);
        trustedProxies = clean(trustedProxies);
        sessionTtl = sessionTtl == null ? Duration.ofHours(12) : sessionTtl;
        ingestQueueCapacity = ingestQueueCapacity <= 0 ? 10_000 : ingestQueueCapacity;
    }

    private static List<String> clean(List<String> values) {
        return values == null ? List.of() : values.stream().map(String::trim).filter(v -> !v.isEmpty()).toList();
    }
}
