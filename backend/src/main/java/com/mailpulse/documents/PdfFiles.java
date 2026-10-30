package com.mailpulse.documents;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The checks an upload needs. The file is never rendered or run on the server: besides the magic bytes there is
 * only a light text scan for the page count.
 */
final class PdfFiles {

    static final int MAX_PAGES = 100_000;
    private static final byte[] MAGIC = "%PDF-".getBytes(StandardCharsets.US_ASCII);
    private static final Pattern OBJECT = Pattern.compile("(\\d{1,10})\\s+\\d{1,5}\\s+obj\\b");
    private static final Pattern PAGE_TREE = Pattern.compile("/Type\\s*/Pages(?![A-Za-z0-9#_.-])");
    private static final Pattern COUNT = Pattern.compile("/Count\\s+(\\d{1,6})(?![\\d.])(?!\\s+\\d+\\s+R)");
    private static final String END = "endobj";

    private PdfFiles() {}

    /** The contract's rule: the file starts with "%PDF-". */
    static boolean isPdf(byte[] bytes) {
        return bytes.length >= MAGIC.length && Arrays.equals(bytes, 0, MAGIC.length, MAGIC, 0, MAGIC.length);
    }

    /**
     * The largest /Count of a /Type /Pages dictionary (the root of the page tree; for an object defined more than
     * once, the last definition wins), or null when the page tree sits in a compressed object stream. The viewer
     * reports the page count of every view, so null only leaves the document list without a count.
     */
    static Integer pageCount(byte[] bytes) {
        String text = new String(bytes, StandardCharsets.ISO_8859_1);
        Map<String, Integer> counts = new HashMap<>();
        Matcher object = OBJECT.matcher(text);
        int from = 0;
        while (from < text.length() && object.find(from)) {
            int start = object.end();
            int end = text.indexOf(END, start);
            if (end < 0) {
                break;
            }
            int stream = text.indexOf("stream", start);
            String dictionary = text.substring(start, stream >= 0 && stream < end ? stream : end);
            if (PAGE_TREE.matcher(dictionary).find()) {
                Matcher count = COUNT.matcher(dictionary);
                if (count.find()) {
                    counts.put(object.group(1), Integer.parseInt(count.group(1)));
                }
            }
            from = end + END.length();
        }
        int max = counts.values().stream().mapToInt(Integer::intValue).max().orElse(0);
        return max > 0 && max <= MAX_PAGES ? max : null;
    }
}
