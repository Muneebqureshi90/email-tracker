package com.mailpulse.tracking;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Decisions that can be made from the request alone, at the moment it arrives. Document views and downloads
 * use the same rules as clicks (documents package).
 */
public final class EventClassifier {

    private static final Pattern SCANNER = Pattern.compile(
            "(?i)(bot\\b|bot/|crawler|spider|curl/|wget/|python-requests|python-urllib|go-http-client|java/|okhttp"
                    + "|apache-httpclient|headlesschrome|phantomjs|scanner|proofpoint|mimecast|barracuda|safelinks)");

    /** Apple Mail Privacy Protection fetches with this bare user agent (tentative, DECISIONS D-038). */
    private static final String APPLE_PREFETCH_AGENT = "Mozilla/5.0";

    private EventClassifier() {}

    public static Source source(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) {
            return Source.UNKNOWN;
        }
        if (userAgent.contains("GoogleImageProxy")) {
            return Source.GMAIL_PROXY;
        }
        if (userAgent.contains("YahooMailProxy")) {
            return Source.YAHOO_PROXY;
        }
        if (userAgent.trim().equals(APPLE_PREFETCH_AGENT)) {
            return Source.APPLE_MPP;
        }
        if (SCANNER.matcher(userAgent).find()) {
            return Source.SCANNER;
        }
        return Source.DIRECT;
    }

    static Optional<Reason> immediateReason(RawEvent event, Source source, boolean trackingEnabled, boolean countApplePrefetch) {
        return immediateReason(event.selfMarked(), event.method(), source, trackingEnabled, countApplePrefetch);
    }

    public static Optional<Reason> immediateReason(
            boolean selfMarked, String method, Source source, boolean trackingEnabled, boolean countApplePrefetch) {
        if (selfMarked) {
            return Optional.of(Reason.SELF);
        }
        if (!trackingEnabled) {
            return Optional.of(Reason.TRACKING_OFF);
        }
        if ("HEAD".equals(method)) {
            return Optional.of(Reason.BOT_HEAD);
        }
        if (source == Source.SCANNER) {
            return Optional.of(Reason.BOT_UA);
        }
        if (source == Source.APPLE_MPP && !countApplePrefetch) {
            return Optional.of(Reason.PREFETCH);
        }
        return Optional.empty();
    }

    /** Proxies rotate IPs, so they are one source each; direct clients are keyed by IP prefix and user agent. */
    public static String sourceKey(Source source, String ipPrefix, String userAgent) {
        if (source.isMailProxy()) {
            return source.name();
        }
        return (ipPrefix == null ? "-" : ipPrefix) + "|" + sha256Hex(userAgent == null ? "" : userAgent).substring(0, 16);
    }

    private static String sha256Hex(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
