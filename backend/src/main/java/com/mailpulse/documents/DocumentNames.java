package com.mailpulse.documents;

import com.mailpulse.common.web.ApiException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Document names and link labels come from the owner's browser (and the upload's file name), so they are
 * untrusted text: cleaned before they are stored, and encoded safely for Content-Disposition.
 */
final class DocumentNames {

    static final int MAX_NAME = 120;
    static final int MAX_LABEL = 60;
    private static final String EXTENSION = ".pdf";
    private static final String FALLBACK = "Document";
    private static final char[] HEX = "0123456789ABCDEF".toCharArray();

    private DocumentNames() {}

    /** No path, no control or invisible formatting characters, at most 120 characters, ends in ".pdf". */
    static String clean(String raw) {
        String text = raw == null ? "" : raw;
        text = text.substring(Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\')) + 1);
        text = visible(text).replaceAll("[<>:\"|?*]", "_").replaceAll(" {2,}", " ").strip();
        if (text.toLowerCase(Locale.ROOT).endsWith(EXTENSION)) {
            text = text.substring(0, text.length() - EXTENSION.length());
        }
        String base = trimDotsAndSpaces(truncate(trimDotsAndSpaces(text), MAX_NAME - EXTENSION.length()));
        return (base.isEmpty() ? FALLBACK : base) + EXTENSION;
    }

    /** Null for a missing or blank label; otherwise its visible text (400 when longer than 60 characters). */
    static String label(String raw) {
        if (raw == null) {
            return null;
        }
        String text = visible(raw).replaceAll(" {2,}", " ").strip();
        if (text.isEmpty()) {
            return null;
        }
        if (text.codePointCount(0, text.length()) > MAX_LABEL) {
            throw ApiException.badRequest("label must be at most " + MAX_LABEL + " characters");
        }
        return text;
    }

    /** RFC 6266: an ASCII fallback name plus the exact name in RFC 5987 encoding. */
    static String contentDisposition(String type, String name) {
        StringBuilder ascii = new StringBuilder(name.length());
        for (char c : name.toCharArray()) {
            ascii.append(c >= 0x20 && c < 0x7f && c != '"' && c != '\\' && c != '%' ? c : '_');
        }
        return type + "; filename=\"" + ascii + "\"; filename*=UTF-8''" + rfc5987(name);
    }

    /** Whitespace of any kind becomes a space; control, formatting, private-use and unassigned characters go. */
    private static String visible(String text) {
        StringBuilder out = new StringBuilder(text.length());
        text.codePoints().forEach(cp -> {
            int type = Character.getType(cp);
            if (Character.isWhitespace(cp) || Character.isSpaceChar(cp)) {
                out.append(' ');
            } else if (!Character.isISOControl(cp) && type != Character.FORMAT && type != Character.SURROGATE
                    && type != Character.PRIVATE_USE && type != Character.UNASSIGNED && cp != 0xFFFD) {
                out.appendCodePoint(cp);
            }
        });
        return out.toString();
    }

    private static String trimDotsAndSpaces(String text) {
        return text.replaceAll("^[ .]+|[ .]+$", "");
    }

    private static String truncate(String text, int maxCodePoints) {
        if (text.codePointCount(0, text.length()) <= maxCodePoints) {
            return text;
        }
        return text.substring(0, text.offsetByCodePoints(0, maxCodePoints));
    }

    private static String rfc5987(String value) {
        StringBuilder out = new StringBuilder();
        for (byte b : value.getBytes(StandardCharsets.UTF_8)) {
            int c = b & 0xff;
            if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || "!#$&+-.^_`|~".indexOf(c) >= 0) {
                out.append((char) c);
            } else {
                out.append('%').append(HEX[c >> 4]).append(HEX[c & 0xf]);
            }
        }
        return out.toString();
    }
}
