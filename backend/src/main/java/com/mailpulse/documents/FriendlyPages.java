package com.mailpulse.documents;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * Small static pages for recipients when a document link cannot be shown: never a stack trace, no internals and
 * nothing about the document. The only style is inline and allowed by its hash, so the CSP stays strict.
 */
public final class FriendlyPages {

    private static final String STYLE = ":root{color-scheme:light dark;font-family:system-ui,-apple-system,\"Segoe UI\","
            + "Roboto,sans-serif}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f7f9;"
            + "color:#1f2328}main{box-sizing:border-box;max-width:30rem;margin:16px;padding:24px 28px;border-radius:12px;"
            + "background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.12)}h1{font-size:1.25rem;line-height:1.4;margin:0 0 8px}"
            + "p{margin:0;line-height:1.5;color:#4b5563}a{display:inline-block;margin-top:16px;color:#0b57d0}"
            + "@media (prefers-color-scheme:dark){body{background:#0f1115;color:#e6e8eb}main{background:#1a1d23;"
            + "box-shadow:none;border:1px solid #2c313a}p{color:#aab1bb}a{color:#8ab4f8}}";

    static final String CSP = "default-src 'none'; style-src '" + sha256(STYLE) + "'; frame-ancestors 'none'; "
            + "base-uri 'none'; form-action 'none'";

    private FriendlyPages() {}

    /** Also used by PortRoutingFilter for /d/ paths that do not match any document route. */
    public static ResponseEntity<byte[]> notFound() {
        return page(HttpStatus.NOT_FOUND, "Link not found", "This link is not valid. Ask the sender for a new one.", null);
    }

    static ResponseEntity<byte[]> gone() {
        return page(HttpStatus.GONE, "Link no longer available",
                "This link has expired or was turned off by the sender. Ask them for a new link.", null);
    }

    /** @param token a link token, already checked against the token pattern */
    static ResponseEntity<byte[]> downloadOff(String token) {
        return page(HttpStatus.FORBIDDEN, "Download turned off",
                "The sender turned off downloads for this document. You can still read it online.", "/d/" + token);
    }

    static ResponseEntity<byte[]> unavailable() {
        return page(HttpStatus.SERVICE_UNAVAILABLE, "Document unavailable",
                "This document cannot be shown right now. Please try again later.", null);
    }

    static ResponseEntity<byte[]> tooManyRequests() {
        return page(HttpStatus.TOO_MANY_REQUESTS, "Too many requests", "Please wait a minute, then try again.", null);
    }

    private static ResponseEntity<byte[]> page(HttpStatus status, String title, String message, String readOnlineHref) {
        String link = readOnlineHref == null ? "" : "<a href=\"" + escape(readOnlineHref) + "\">Read it online</a>";
        String html = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
                + "<meta name=\"referrer\" content=\"no-referrer\"><meta name=\"robots\" content=\"noindex, nofollow\">"
                + "<title>" + escape(title) + "</title><style>" + STYLE + "</style></head>"
                + "<body><main><h1>" + escape(title) + "</h1><p>" + escape(message) + "</p>" + link + "</main></body></html>";
        return ResponseEntity.status(status)
                .contentType(new MediaType(MediaType.TEXT_HTML, StandardCharsets.UTF_8))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header("Content-Security-Policy", CSP)
                .header("Referrer-Policy", "no-referrer")
                .header("X-Content-Type-Options", "nosniff")
                .body(html.getBytes(StandardCharsets.UTF_8));
    }

    private static String escape(String text) {
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private static String sha256(String text) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            return "sha256-" + Base64.getEncoder().encodeToString(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
