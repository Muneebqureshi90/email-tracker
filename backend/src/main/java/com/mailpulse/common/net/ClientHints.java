package com.mailpulse.common.net;

/**
 * The phone model from the {@code Sec-CH-UA-Model} client hint (D-135). Chromium browsers on Android send it
 * once a response from the same site asked for it with {@code Accept-CH}; other browsers never do. No
 * {@code Critical-CH}: it makes the browser repeat the request, which would record a click or view twice.
 * The value is untrusted text and never logged.
 */
public final class ClientHints {

    public static final String MODEL_HEADER = "Sec-CH-UA-Model";
    public static final String ACCEPT_CH = "Accept-CH";
    /** The value sent in {@code Accept-CH}. */
    public static final String REQUESTED = "Sec-CH-UA-Model";

    private static final int MAX_LENGTH = 64;

    private ClientHints() {}

    /**
     * The model from the header, or null when there is none or it is not plain printable ASCII of at most 64
     * characters. The header is an RFC 8941 string: one pair of surrounding quotes, with \" and \\ escaped.
     */
    public static String deviceModel(String header) {
        if (header == null || header.isBlank()) {
            return null;
        }
        String value = header.trim();
        if (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
            value = unescape(value.substring(1, value.length() - 1));
            if (value == null) {
                return null;
            }
        }
        value = value.trim();
        if (value.isEmpty() || value.length() > MAX_LENGTH) {
            return null;
        }
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c < 0x20 || c > 0x7E) {
                return null;
            }
        }
        return value;
    }

    /** Undoes \" and \\; null for a backslash before anything else or at the end. */
    private static String unescape(String quoted) {
        StringBuilder out = new StringBuilder(quoted.length());
        for (int i = 0; i < quoted.length(); i++) {
            char c = quoted.charAt(i);
            if (c == '\\') {
                if (i + 1 >= quoted.length()) {
                    return null;
                }
                char next = quoted.charAt(++i);
                if (next != '"' && next != '\\') {
                    return null;
                }
                out.append(next);
            } else {
                out.append(c);
            }
        }
        return out.toString();
    }
}
