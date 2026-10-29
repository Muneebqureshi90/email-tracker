package com.mailpulse.emails;

import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Email address helpers: normalisation and the "open status may be unreliable" hint. */
public final class Addresses {

    /** Providers that block remote images by default, so an unopened email may simply be untrackable. */
    private static final Set<String> IMAGE_BLOCKING_DOMAINS = Set.of(
            "outlook.com", "hotmail.com", "hotmail.co.uk", "hotmail.fr", "live.com", "live.co.uk", "msn.com",
            "outlook.fr", "yahoo.com", "yahoo.co.uk", "yahoo.fr", "ymail.com", "aol.com",
            "proton.me", "protonmail.com", "protonmail.ch", "pm.me");

    private Addresses() {}

    public static String normalize(String address) {
        return address.trim().toLowerCase(Locale.ROOT);
    }

    static String domain(String normalizedAddress) {
        int at = normalizedAddress.lastIndexOf('@');
        return at < 0 ? "" : normalizedAddress.substring(at + 1);
    }

    /** True when there is at least one recipient and every one uses an image-blocking provider. */
    static boolean allBlockImages(List<String> normalizedAddresses) {
        return !normalizedAddresses.isEmpty()
                && normalizedAddresses.stream().allMatch(address -> IMAGE_BLOCKING_DOMAINS.contains(domain(address)));
    }
}
