package com.mailpulse.documents;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.mailpulse.common.web.ApiException;
import com.mailpulse.support.TestPdfs;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/** PDF checks, name cleaning and the packaged viewer files. Pure, no Spring context. */
class DocumentFilesTest {

    @Test
    void onlyFilesStartingWithThePdfMagicArePdfs() {
        assertThat(PdfFiles.isPdf(TestPdfs.pdf(1, "Resume"))).isTrue();
        assertThat(PdfFiles.isPdf("%PDF".getBytes(StandardCharsets.US_ASCII))).isFalse();
        assertThat(PdfFiles.isPdf(" %PDF-1.7".getBytes(StandardCharsets.US_ASCII))).isFalse();
        assertThat(PdfFiles.isPdf("<html>%PDF-".getBytes(StandardCharsets.US_ASCII))).isFalse();
        assertThat(PdfFiles.isPdf(new byte[0])).isFalse();
    }

    @Test
    void pageCountComesFromThePageTreeOrIsUnknown() {
        assertThat(PdfFiles.pageCount(TestPdfs.pdf(1, "One"))).isEqualTo(1);
        assertThat(PdfFiles.pageCount(TestPdfs.pdf(3, "Three"))).isEqualTo(3);
        String nested = "%PDF-1.4\n1 0 obj\n<< /Type /Pages /Kids [2 0 R 3 0 R] /Count 7 >>\nendobj\n"
                + "2 0 obj\n<</Count 4/Type/Pages/Parent 1 0 R>>\nendobj\n3 0 obj\n<< /Type /Page >>\nendobj\n";
        assertThat(PdfFiles.pageCount(nested.getBytes(StandardCharsets.ISO_8859_1))).as("the root has the largest count").isEqualTo(7);
        String compressed = "%PDF-1.7\n5 0 obj\n<< /Type /ObjStm /N 3 /Length 9 >>\nstream\nxxxxxxxxx\nendstream\nendobj\n";
        assertThat(PdfFiles.pageCount(compressed.getBytes(StandardCharsets.ISO_8859_1))).isNull();
        assertThat(PdfFiles.pageCount("%PDF-1.4 garbage".getBytes(StandardCharsets.ISO_8859_1))).isNull();
    }

    @Test
    void namesLoseTheirPathControlCharactersAndExtraLength() {
        assertThat(DocumentNames.clean("Resume.pdf")).isEqualTo("Resume.pdf");
        assertThat(DocumentNames.clean("C:\\Users\\someone\\My  CV.PDF")).isEqualTo("My CV.pdf");
        assertThat(DocumentNames.clean("../../etc/passwd")).isEqualTo("passwd.pdf");
        assertThat(DocumentNames.clean("evil\u0000na\u202Eme\r\n.pdf")).isEqualTo("evilname.pdf");
        assertThat(DocumentNames.clean("a<b>c:d\"e|f?g*h.pdf")).isEqualTo("a_b_c_d_e_f_g_h.pdf");
        assertThat(DocumentNames.clean("   ")).isEqualTo("Document.pdf");
        assertThat(DocumentNames.clean(null)).isEqualTo("Document.pdf");
        assertThat(DocumentNames.clean(".pdf")).isEqualTo("Document.pdf");
        assertThat(DocumentNames.clean("...hidden")).isEqualTo("hidden.pdf");
        assertThat(DocumentNames.clean("Lebenslauf Jürgen.pdf")).isEqualTo("Lebenslauf Jürgen.pdf");
        String longName = DocumentNames.clean("x".repeat(300) + ".pdf");
        assertThat(longName).hasSize(DocumentNames.MAX_NAME).endsWith(".pdf");
        assertThat(DocumentNames.clean("😀".repeat(200))).endsWith(".pdf")
                .satisfies(name -> assertThat(name.codePointCount(0, name.length())).isEqualTo(DocumentNames.MAX_NAME));
    }

    @Test
    void labelsAreVisibleTextOfAtMostSixtyCharacters() {
        assertThat(DocumentNames.label(null)).isNull();
        assertThat(DocumentNames.label("   ")).isNull();
        assertThat(DocumentNames.label(" Linked\u0007In \t jobs ")).isEqualTo("LinkedIn jobs");
        assertThat(DocumentNames.label("r".repeat(60))).hasSize(60);
        assertThatThrownBy(() -> DocumentNames.label("r".repeat(61))).isInstanceOf(ApiException.class);
    }

    @Test
    void contentDispositionHasAnAsciiFallbackAndTheExactName() {
        assertThat(DocumentNames.contentDisposition("attachment", "Resume.pdf"))
                .isEqualTo("attachment; filename=\"Resume.pdf\"; filename*=UTF-8''Resume.pdf");
        assertThat(DocumentNames.contentDisposition("inline", "Jürgen \"CV\" 100%.pdf"))
                .isEqualTo("inline; filename=\"J_rgen _CV_ 100_.pdf\"; filename*=UTF-8''J%C3%BCrgen%20%22CV%22%20100%25.pdf");
    }

    @Test
    void viewerFilesHaveFixedTypesAndNeverLeaveTheViewerFolder() {
        ViewerFiles viewer = new ViewerFiles();
        assertThat(viewer.index()).hasValueSatisfying(html ->
                assertThat(new String(html, StandardCharsets.UTF_8)).contains("mailpulse-viewer-test"));
        assertThat(type(viewer, "assets/viewer-test.js")).isEqualTo(MediaType.parseMediaType("text/javascript"));
        assertThat(type(viewer, "assets/pdf.worker.min-test.mjs")).isEqualTo(MediaType.parseMediaType("text/javascript"));
        assertThat(type(viewer, "cmaps/Test-H.bcmap")).isEqualTo(MediaType.APPLICATION_OCTET_STREAM);
        assertThat(viewer.asset("assets/viewer-test.js").orElseThrow().cacheControl()).isEqualTo(ViewerFiles.IMMUTABLE);
        assertThat(viewer.asset("cmaps/Test-H.bcmap").orElseThrow().cacheControl()).isEqualTo(ViewerFiles.SHORT);
        for (String bad : new String[] {"index.html", "../index.html", "assets/../index.html", "./assets/viewer-test.js",
                "assets//viewer-test.js", "assets%2Fviewer-test.js", "assets\\viewer-test.js", ".hidden.js", "assets/missing.js",
                "assets", "", "/assets/viewer-test.js"}) {
            assertThat(viewer.asset(bad)).as(bad).isEmpty();
        }
        assertThat(new ViewerFiles(ViewerFiles.class.getClassLoader(), "static/no-viewer/").index())
                .as("a plain backend build has no viewer").isEqualTo(Optional.empty());
    }

    private static MediaType type(ViewerFiles viewer, String path) {
        return viewer.asset(path).orElseThrow(() -> new AssertionError("missing " + path)).type();
    }
}
