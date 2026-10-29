package com.mailpulse.common;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.regex.Pattern;

/** Random values used in public URLs, API tokens and the first-run setup code. */
public final class RandomTokens {

    /** Tracking tokens are 18 random bytes (144 bits), base64url without padding: 24 characters. */
    public static final Pattern TRACKING_TOKEN = Pattern.compile("[A-Za-z0-9_-]{24}");

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder BASE64_URL = Base64.getUrlEncoder().withoutPadding();
    private static final char[] SETUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();

    private RandomTokens() {}

    public static String trackingToken() {
        return random(18);
    }

    /** Extension API token: "mp_" followed by 32 random bytes. */
    public static String apiToken() {
        return "mp_" + random(32);
    }

    /** One-time setup code shown in the backend log, formatted XXXXX-XXXXX (50 bits). */
    public static String setupCode() {
        StringBuilder code = new StringBuilder(11);
        for (int i = 0; i < 10; i++) {
            if (i == 5) {
                code.append('-');
            }
            code.append(SETUP_ALPHABET[RANDOM.nextInt(SETUP_ALPHABET.length)]);
        }
        return code.toString();
    }

    public static boolean isTrackingToken(String value) {
        return value != null && TRACKING_TOKEN.matcher(value).matches();
    }

    private static String random(int bytes) {
        byte[] buffer = new byte[bytes];
        RANDOM.nextBytes(buffer);
        return BASE64_URL.encodeToString(buffer);
    }
}
