package com.mailpulse.support;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Small valid PDFs for tests: one line of Helvetica text per page, with a correct cross-reference table. */
public final class TestPdfs {

    private TestPdfs() {}

    public static byte[] pdf(int pages, String title) {
        List<String> objects = new ArrayList<>();
        StringBuilder kids = new StringBuilder();
        for (int i = 0; i < pages; i++) {
            kids.append(3 + 2 * i).append(" 0 R ");
        }
        int font = 3 + 2 * pages;
        objects.add("<< /Type /Catalog /Pages 2 0 R >>");
        objects.add("<< /Type /Pages /Kids [" + kids.toString().trim() + "] /Count " + pages + " >>");
        for (int i = 0; i < pages; i++) {
            String text = "BT /F1 18 Tf 72 720 Td (" + escape(title + " - page " + (i + 1) + " of " + pages) + ") Tj ET";
            objects.add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents " + (4 + 2 * i)
                    + " 0 R /Resources << /Font << /F1 " + font + " 0 R >> >> >>");
            objects.add("<< /Length " + text.length() + " >>\nstream\n" + text + "\nendstream");
        }
        objects.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        write(out, "%PDF-1.4\n");
        List<Integer> offsets = new ArrayList<>();
        for (int i = 0; i < objects.size(); i++) {
            offsets.add(out.size());
            write(out, (i + 1) + " 0 obj\n" + objects.get(i) + "\nendobj\n");
        }
        int xref = out.size();
        StringBuilder table = new StringBuilder("xref\n0 " + (objects.size() + 1) + "\n0000000000 65535 f \n");
        for (int offset : offsets) {
            table.append(String.format("%010d 00000 n \n", offset));
        }
        table.append("trailer\n<< /Size ").append(objects.size() + 1).append(" /Root 1 0 R >>\nstartxref\n").append(xref).append("\n%%EOF\n");
        write(out, table.toString());
        return out.toByteArray();
    }

    private static String escape(String text) {
        return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)");
    }

    private static void write(ByteArrayOutputStream out, String text) {
        out.writeBytes(text.getBytes(StandardCharsets.ISO_8859_1));
    }
}
