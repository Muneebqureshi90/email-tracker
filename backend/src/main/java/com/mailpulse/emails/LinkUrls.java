package com.mailpulse.emails;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Optional;

/** Only absolute http(s) links without credentials or control characters may be tracked and redirected to. */
final class LinkUrls {

    static final int MAX_LENGTH = 2048;

    private LinkUrls() {}

    static Optional<String> validate(String candidate) {
        if (candidate == null) {
            return Optional.empty();
        }
        String url = candidate.trim();
        if (url.isEmpty() || url.length() > MAX_LENGTH || url.chars().anyMatch(c -> c <= 0x20 || c == 0x7F)) {
            return Optional.empty();
        }
        try {
            URI uri = new URI(url);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            boolean web = scheme.equals("http") || scheme.equals("https");
            if (!web || uri.getHost() == null || uri.getHost().isBlank() || uri.getRawUserInfo() != null) {
                return Optional.empty();
            }
            return Optional.of(url);
        } catch (URISyntaxException e) {
            return Optional.empty();
        }
    }
}
