package com.mailpulse.documents;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.common.crypto.FieldCipher;
import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestHttp;
import com.mailpulse.support.TestPdfs;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;

/** The documents API: upload rules, encryption at rest, versions, links and who may create them. */
class DocumentsIT extends IntegrationTest {

    @Autowired
    private FieldCipher cipher;

    @Test
    void uploadKeepsAnEncryptedPdfUnderACleanName() {
        byte[] pdf = TestPdfs.pdf(3, "Jane Doe resume");
        JsonNode doc = uploadPdf("C:\\Users\\someone\\My  Resume.PDF", pdf);
        assertThat(doc.get("name").asString()).isEqualTo("My Resume.pdf");
        assertThat(doc.get("sizeBytes").asLong()).isEqualTo(pdf.length);
        assertThat(doc.get("pageCount").asInt()).isEqualTo(3);
        assertThat(doc.get("version").asInt()).isEqualTo(1);
        assertThat(doc.get("views").asLong()).isZero();
        assertThat(doc.get("reads").asLong()).isZero();
        assertThat(doc.get("downloads").asLong()).isZero();
        assertThat(doc.get("lastActivityAt").isNull()).isTrue();

        UUID id = UUID.fromString(doc.get("id").asString());
        byte[] stored = jdbc.sql("SELECT content_enc FROM document_file WHERE document_id = :id").param("id", id)
                .query((rs, row) -> rs.getBytes(1)).single();
        assertThat(new String(stored, StandardCharsets.ISO_8859_1)).doesNotContain("%PDF", "Jane Doe");
        assertThat(cipher.decryptBytes(stored, DocumentService.fileContext(id))).isEqualTo(pdf);
        byte[] name = jdbc.sql("SELECT name_enc FROM document WHERE id = :id").param("id", id).query((rs, row) -> rs.getBytes(1)).single();
        assertThat(new String(name, StandardCharsets.ISO_8859_1)).doesNotContain("Resume");

        // A later upload: two uploads at the same instant have no defined order.
        clock.advance(java.time.Duration.ofMinutes(1));
        TestHttp.Response named = http.multipart("POST", api("/api/documents"), "upload.pdf", "application/octet-stream",
                TestPdfs.pdf(1, "CV"), new String[] {"name", "../CV\u0007  final"}, asOwner());
        assertThat(named.status()).isEqualTo(201);
        assertThat(named.json().get("name").asString()).as("the name field wins, cleaned").isEqualTo("CV final.pdf");

        List<String> ids = ids(http.get(api("/api/documents"), asOwner()).json());
        assertThat(ids).contains(id.toString(), named.json().get("id").asString());
        assertThat(ids.indexOf(named.json().get("id").asString())).as("newest first").isLessThan(ids.indexOf(id.toString()));
    }

    @Test
    void onlyPdfFilesUpToTenMegabytesAreAccepted() {
        assertThat(upload("page.pdf", "<html>not a pdf</html>".getBytes(StandardCharsets.UTF_8)).status()).isEqualTo(400);
        assertThat(upload("empty.pdf", new byte[0]).status()).isEqualTo(400);
        assertThat(upload("late.pdf", " %PDF-1.7".getBytes(StandardCharsets.US_ASCII)).status()).isEqualTo(400);

        byte[] tooLarge = pdfOfSize(DocumentService.MAX_BYTES + 1);
        TestHttp.Response large = upload("large.pdf", tooLarge);
        assertThat(large.status()).isEqualTo(413);
        assertThat(large.json().get("detail").asString()).contains("10 MB");

        TestHttp.Response limit = upload("limit.pdf", pdfOfSize(DocumentService.MAX_BYTES));
        assertThat(limit.status()).as("exactly 10 MB is fine").isEqualTo(201);
        assertThat(limit.json().get("pageCount").isNull()).isTrue();
        assertThat(http.delete(api("/api/documents/" + limit.json().get("id").asString()), asOwner()).status()).isEqualTo(204);

        assertThat(http.sendRaw("POST", api("/api/documents"), "multipart/form-data; boundary=x", "--x--\r\n".getBytes(StandardCharsets.UTF_8),
                asOwner()).status()).as("no file part").isEqualTo(400);
        assertThat(http.post(api("/api/documents"), Map.of("file", "x"), asOwner()).status()).isEqualTo(415);
    }

    @Test
    void atMostOneHundredDocumentsAreStored() {
        long existing = jdbc.sql("SELECT count(*) FROM document").query(Long.class).single();
        List<UUID> filler = new java.util.ArrayList<>();
        for (long i = existing; i < DocumentService.MAX_DOCUMENTS; i++) {
            UUID id = UUID.randomUUID();
            filler.add(id);
            jdbc.sql("INSERT INTO document (id, name_enc, size_bytes, version, created_at, updated_at) VALUES (:id, :name, 10, 1, now(), now())")
                    .param("id", id)
                    .param("name", cipher.encrypt("filler.pdf", DocumentService.NAME_COLUMN))
                    .update();
        }
        try {
            TestHttp.Response refused = upload("one-too-many.pdf", TestPdfs.pdf(1, "x"));
            assertThat(refused.status()).isEqualTo(409);
            assertThat(refused.json().get("detail").asString()).contains("100");
        } finally {
            if (!filler.isEmpty()) {
                jdbc.sql("DELETE FROM document WHERE id IN (:ids)").param("ids", filler).update();
            }
        }
        assertThat(jdbc.sql("SELECT count(*) FROM document").query(Long.class).single()).isEqualTo(existing);
    }

    @Test
    void renameReplaceAndDelete() {
        JsonNode doc = uploadPdf("Old name.pdf", TestPdfs.pdf(1, "first version"));
        String id = doc.get("id").asString();
        TestHttp.Response renamed = http.patch(api("/api/documents/" + id), Map.of("name", "New\tname"), asOwner());
        assertThat(renamed.status()).isEqualTo(200);
        assertThat(renamed.json().get("name").asString()).isEqualTo("New name.pdf");
        assertThat(http.patch(api("/api/documents/" + id), Map.of("name", " "), asOwner()).status()).isEqualTo(400);
        assertThat(http.patch(api("/api/documents/" + UUID.randomUUID()), Map.of("name", "x"), asOwner()).status()).isEqualTo(404);

        String token = linkToken(createLink(id, Map.of("label", "LinkedIn"), asOwner()));
        byte[] second = TestPdfs.pdf(2, "second version");
        clock.advance(Duration.ofMinutes(1));
        TestHttp.Response replaced = http.multipart("PUT", api("/api/documents/" + id + "/file"), "anything.txt", "text/plain", second,
                new String[0], asOwner());
        assertThat(replaced.status()).isEqualTo(200);
        assertThat(replaced.json().get("version").asInt()).isEqualTo(2);
        assertThat(replaced.json().get("pageCount").asInt()).isEqualTo(2);
        assertThat(replaced.json().get("sizeBytes").asLong()).isEqualTo(second.length);
        assertThat(replaced.json().get("name").asString()).as("a new version keeps the name").isEqualTo("New name.pdf");
        assertThat(http.get(pub("/d/" + token + "/pdf"), reader(1)).body()).as("old links serve the latest version").isEqualTo(second);
        assertThat(http.multipart("PUT", api("/api/documents/" + id + "/file"), "x.pdf", "application/pdf",
                "nope".getBytes(StandardCharsets.UTF_8), new String[0], asOwner()).status()).isEqualTo(400);
        assertThat(http.get(api("/api/documents/" + id), asOwner()).json().get("summary").get("version").asInt()).isEqualTo(2);

        assertThat(http.delete(api("/api/documents/" + id), asOwner()).status()).isEqualTo(204);
        assertThat(http.get(api("/api/documents/" + id), asOwner()).status()).isEqualTo(404);
        assertThat(http.delete(api("/api/documents/" + id), asOwner()).status()).isEqualTo(404);
        TestHttp.Response page = http.get(pub("/d/" + token), reader(1));
        assertThat(page.status()).as("a deleted document's link").isEqualTo(404);
        assertThat(page.text()).contains("Link not found");
        assertThat(http.get(pub("/d/" + token + "/info"), reader(1)).status()).isEqualTo(404);
    }

    @Test
    void emailLinksAreOnePerEmailAndShareLinksCarryLabels() {
        String id = uploadPdf("Resume.pdf", TestPdfs.pdf(2, "Resume")).get("id").asString();
        TrackedEmail draft = registerEmail(uniqueAccount());

        TestHttp.Response first = http.post(api("/api/documents/" + id + "/links"), Map.of("emailId", draft.id().toString()), asExtension());
        assertThat(first.status()).isEqualTo(201);
        JsonNode link = first.json();
        assertThat(link.get("url").asString()).matches("https://track\\.test/d/[A-Za-z0-9_-]{24}");
        assertThat(link.get("emailId").asString()).isEqualTo(draft.id().toString());
        assertThat(link.get("documentId").asString()).isEqualTo(id);
        assertThat(link.get("documentName").asString()).isEqualTo("Resume.pdf");
        assertThat(link.get("allowDownload").asBoolean()).isTrue();
        assertThat(link.get("label").isNull()).isTrue();
        assertThat(link.get("recipients").asString()).isEmpty();

        TestHttp.Response again = http.post(api("/api/documents/" + id + "/links"), Map.of("emailId", draft.id().toString()), asExtension());
        assertThat(again.status()).as("one working link per email").isEqualTo(200);
        assertThat(again.json().get("id").asString()).isEqualTo(link.get("id").asString());
        assertThat(http.post(api("/api/documents/" + id + "/links"), Map.of("emailId", draft.id().toString(), "label", "x"), asOwner())
                .json().get("id").asString()).isEqualTo(link.get("id").asString());

        assertThat(http.post(api("/api/documents/" + id + "/links"), Map.of("label", "LinkedIn"), asExtension()).status())
                .as("share links are owner only").isEqualTo(403);
        assertThat(http.post(api("/api/documents/" + id + "/links"), Map.of("emailId", UUID.randomUUID().toString()), asExtension())
                .status()).isEqualTo(404);
        assertThat(http.post(api("/api/documents/" + UUID.randomUUID() + "/links"), Map.of("emailId", draft.id().toString()),
                asExtension()).status()).isEqualTo(404);

        JsonNode share = createLink(id, Map.of("label", " LinkedIn "), asOwner());
        assertThat(share.get("label").asString()).isEqualTo("LinkedIn");
        assertThat(share.get("emailId").isNull()).isTrue();
        assertThat(share.get("recipients").isNull()).isTrue();
        String expires = now().plus(Duration.ofDays(7)).toString();
        JsonNode limited = createLink(id, Map.of("label", "Rozee", "allowDownload", false, "expiresAt", expires), asOwner());
        assertThat(limited.get("allowDownload").asBoolean()).isFalse();
        assertThat(limited.get("expiresAt").asString()).isEqualTo(expires);
        assertThat(http.post(api("/api/documents/" + id + "/links"), Map.of("expiresAt", now().minusSeconds(1).toString()), asOwner())
                .status()).isEqualTo(400);
        assertThat(http.post(api("/api/documents/" + id + "/links"), Map.of("label", "x".repeat(61)), asOwner()).status()).isEqualTo(400);
        byte[] label = jdbc.sql("SELECT label_enc FROM document_link WHERE id = :id").param("id", UUID.fromString(share.get("id").asString()))
                .query((rs, row) -> rs.getBytes(1)).single();
        assertThat(new String(label, StandardCharsets.ISO_8859_1)).doesNotContain("LinkedIn");

        assertThat(http.patch(api("/api/document-links/" + link.get("id").asString()), Map.of("revoked", true), asOwner()).status())
                .isEqualTo(200);
        clock.advance(Duration.ofSeconds(1));
        TestHttp.Response replacement = http.post(api("/api/documents/" + id + "/links"), Map.of("emailId", draft.id().toString()),
                asExtension());
        assertThat(replacement.status()).as("a revoked link is not reused").isEqualTo(201);
        assertThat(replacement.json().get("id").asString()).isNotEqualTo(link.get("id").asString());

        JsonNode detail = http.get(api("/api/documents/" + id), asOwner()).json();
        assertThat(detail.get("links")).hasSize(4);
        assertThat(detail.get("events")).isEmpty();
        JsonNode links = http.get(api("/api/documents/" + id + "/links?size=25"), asOwner()).json();
        assertThat(links.get("total").asLong()).isEqualTo(4);
        assertThat(links.get("items").get(0).get("id").asString()).as("newest first").isEqualTo(replacement.json().get("id").asString());
        assertThat(http.get(api("/api/documents/" + id + "/links?size=10"), asOwner()).status()).isEqualTo(400);
        assertThat(http.get(api("/api/documents/" + id + "/events?size=50"), asOwner()).json().get("total").asLong()).isZero();
        assertThat(http.get(api("/api/documents/" + UUID.randomUUID() + "/events"), asOwner()).status()).isEqualTo(404);
        assertThat(http.get(api("/api/emails/" + draft.id()), asOwner()).json().get("documentLinks")).hasSize(2);
    }

    @Test
    void theExtensionTokenMayOnlyListDocumentsAndCreateEmailLinks() {
        String id = uploadPdf("Token rules.pdf", TestPdfs.pdf(1, "x")).get("id").asString();
        String linkId = createLink(id, Map.of("label", "x"), asOwner()).get("id").asString();
        assertThat(http.get(api("/api/documents"), asExtension()).status()).isEqualTo(200);
        assertThat(ids(http.get(api("/api/documents"), asExtension()).json())).contains(id);
        assertThat(http.get(api("/api/documents/" + id), asExtension()).status()).isEqualTo(403);
        assertThat(http.get(api("/api/documents/" + id + "/links"), asExtension()).status()).isEqualTo(403);
        assertThat(http.get(api("/api/documents/" + id + "/events"), asExtension()).status()).isEqualTo(403);
        assertThat(http.patch(api("/api/documents/" + id), Map.of("name", "x"), asExtension()).status()).isEqualTo(403);
        assertThat(http.delete(api("/api/documents/" + id), asExtension()).status()).isEqualTo(403);
        assertThat(http.patch(api("/api/document-links/" + linkId), Map.of("revoked", true), asExtension()).status()).isEqualTo(403);
        assertThat(http.multipart("POST", api("/api/documents"), "x.pdf", "application/pdf", TestPdfs.pdf(1, "x"), new String[0],
                asExtension()).status()).isEqualTo(403);
        assertThat(http.get(api("/api/documents")).status()).isEqualTo(401);
        assertThat(http.post(api("/api/documents/" + id + "/links"), Map.of("label", "x")).status()).isEqualTo(401);
    }

    @Test
    void linkSettingsChangeOnlyTheFieldsSent() {
        String id = uploadPdf("Settings.pdf", TestPdfs.pdf(1, "x")).get("id").asString();
        String link = "/api/document-links/" + createLink(id, Map.of("label", "A"), asOwner()).get("id").asString();
        JsonNode changed = patch(link, Map.of("label", "B"));
        assertThat(changed.get("label").asString()).isEqualTo("B");
        assertThat(changed.get("allowDownload").asBoolean()).isTrue();
        changed = patch(link, Map.of("allowDownload", false));
        assertThat(changed.get("allowDownload").asBoolean()).isFalse();
        assertThat(changed.get("label").asString()).isEqualTo("B");
        String expires = now().plus(Duration.ofDays(3)).toString();
        assertThat(patch(link, Map.of("expiresAt", expires)).get("expiresAt").asString()).isEqualTo(expires);
        Map<String, Object> clear = new HashMap<>();
        clear.put("expiresAt", null);
        clear.put("label", null);
        changed = patch(link, clear);
        assertThat(changed.get("expiresAt").isNull()).isTrue();
        assertThat(changed.get("label").isNull()).isTrue();
        assertThat(changed.get("allowDownload").asBoolean()).isFalse();
        assertThat(patch(link, Map.of("revoked", true)).get("revokedAt").isNull()).isFalse();
        assertThat(patch(link, Map.of("revoked", false)).get("revokedAt").isNull()).isTrue();

        for (Map<String, Object> bad : List.<Map<String, Object>>of(Map.of("bogus", 1), Map.of("allowDownload", "yes"),
                Map.of("expiresAt", "tomorrow"), Map.of("expiresAt", now().minusSeconds(60).toString()), Map.of("label", 5),
                Map.of("revoked", "no"))) {
            assertThat(http.patch(api(link), bad, asOwner()).status()).as(bad.toString()).isEqualTo(400);
        }
        assertThat(http.patch(api("/api/document-links/" + UUID.randomUUID()), Map.of("revoked", true), asOwner()).status()).isEqualTo(404);
    }

    private JsonNode patch(String path, Map<String, Object> body) {
        TestHttp.Response response = http.patch(api(path), body, asOwner());
        assertThat(response.status()).as(body.toString()).isEqualTo(200);
        return response.json();
    }

    private TestHttp.Response upload(String fileName, byte[] content) {
        return http.multipart("POST", api("/api/documents"), fileName, "application/pdf", content, new String[0], asOwner());
    }

    private static byte[] pdfOfSize(int size) {
        byte[] content = new byte[size];
        Arrays.fill(content, (byte) ' ');
        byte[] header = "%PDF-1.4\n".getBytes(StandardCharsets.US_ASCII);
        System.arraycopy(header, 0, content, 0, header.length);
        return content;
    }

    private static List<String> ids(JsonNode array) {
        return java.util.stream.StreamSupport.stream(array.spliterator(), false).map(node -> node.get("id").asString()).toList();
    }
}
