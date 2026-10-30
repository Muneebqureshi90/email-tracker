package com.mailpulse.documents;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestHttp;
import com.mailpulse.support.TestPdfs;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/** The public document routes (viewer page, files, info, PDF, download, beats) and how views, reads and downloads count. */
class DocumentViewsIT extends IntegrationTest {

    private static final String SELF = "X-MailPulse-Self";
    private static final String SELF_SECRET = "test-self-secret";
    private static final String KINDS = "DOC_VIEW,DOC_READ,DOC_DOWNLOAD,ALERT";

    @Test
    void theViewerPageAndItsFilesAreServedWithTheViewerCsp() {
        byte[] pdf = TestPdfs.pdf(2, "Viewer test");
        String docId = uploadPdf("Viewer test.pdf", pdf).get("id").asString();
        String token = shareLink(docId, "Website");
        long cursor = lastActivityId();

        TestHttp.Response page = http.get(pub("/d/" + token), reader(1));
        assertThat(page.status()).isEqualTo(200);
        assertThat(page.header("Content-Type").orElseThrow()).startsWith("text/html");
        assertThat(page.text()).contains("mailpulse-viewer-test");
        assertThat(page.header("Content-Security-Policy")).hasValue(PublicDocumentController.VIEWER_CSP);
        assertThat(page.header("Cache-Control")).hasValue("no-store");
        assertThat(page.header("Referrer-Policy")).hasValue("no-referrer");
        assertThat(page.header("X-Content-Type-Options")).hasValue("nosniff");
        TestHttp.Response head = http.send("HEAD", pub("/d/" + token), null, reader(1));
        assertThat(head.status()).isEqualTo(200);
        assertThat(head.body()).isEmpty();
        assertThat(jdbc.sql("SELECT count(*) FROM document_event e JOIN document_link l ON l.id = e.link_id WHERE l.token = :t")
                .param("t", token).query(Long.class).single()).as("serving the page counts nothing").isZero();
        assertThat(docItems(cursor, docId)).isEmpty();

        JsonNode info = http.get(pub("/d/" + token + "/info"), reader(1)).json();
        assertThat(info.get("name").asString()).isEqualTo("Viewer test.pdf");
        assertThat(info.get("pageCount").asInt()).isEqualTo(2);
        assertThat(info.get("sizeBytes").asLong()).isEqualTo(pdf.length);
        assertThat(info.get("allowDownload").asBoolean()).isTrue();
        assertThat(http.get(pub("/d/" + token + "/info"), reader(1)).header("Cache-Control")).hasValue("no-store");
        TestHttp.Response file = http.get(pub("/d/" + token + "/pdf"), reader(1));
        assertThat(file.status()).isEqualTo(200);
        assertThat(file.header("Content-Type")).hasValue("application/pdf");
        assertThat(file.header("Content-Disposition").orElseThrow()).startsWith("inline; filename=\"Viewer test.pdf\"");
        assertThat(file.header("Cache-Control")).hasValue("no-store");
        assertThat(file.header("X-Content-Type-Options")).hasValue("nosniff");
        assertThat(file.body()).isEqualTo(pdf);

        assertAsset("/d/_/assets/viewer-test.js", "text/javascript", ViewerFiles.IMMUTABLE);
        assertAsset("/d/_/assets/pdf.worker.min-test.mjs", "text/javascript", ViewerFiles.IMMUTABLE);
        assertAsset("/d/_/cmaps/Test-H.bcmap", "application/octet-stream", ViewerFiles.SHORT);
        for (String path : List.of("/d/_/assets/missing.js", "/d/_/index.html", "/d/_/../index.html", "/d/_/assets/../../index.html",
                "/d/_/assets/%2e%2e/viewer-test.js", "/d/_/assets%2Fviewer-test.js", "/d/_/", "/d/_")) {
            TestHttp.Response refused = http.get(pub(path), reader(1));
            // 404 from PortRoutingFilter; Tomcat already answers 400 for an encoded slash. Either way: 4xx, no file.
            assertThat(refused.status()).as(path).isBetween(400, 499);
            assertThat(refused.text()).as(path).doesNotContain("mailpulse");
        }
        assertThat(http.get(api("/d/" + token)).status()).as("private port").isEqualTo(404);
        assertThat(http.get(api("/d/_/assets/viewer-test.js")).status()).as("private port").isEqualTo(404);
        assertThat(http.post(pub("/d/" + token), "{}", reader(1)).status()).isEqualTo(404);
        assertThat(http.get(pub("/d/" + token + "/beat"), reader(1)).status()).isEqualTo(404);
    }

    @Test
    void unknownExpiredRevokedAndDownloadOffLinksGetFriendlyPages() {
        TestHttp.Response unknown = http.get(pub("/d/" + com.mailpulse.common.RandomTokens.trackingToken()), reader(2));
        assertThat(unknown.status()).isEqualTo(404);
        assertThat(unknown.header("Content-Type").orElseThrow()).startsWith("text/html");
        assertThat(unknown.text()).contains("Link not found").doesNotContain("Exception", "at com.");
        assertThat(unknown.header("Content-Security-Policy").orElseThrow()).startsWith("default-src 'none'; style-src 'sha256-");
        TestHttp.Response unknownInfo = http.get(pub("/d/" + com.mailpulse.common.RandomTokens.trackingToken() + "/info"), reader(2));
        assertThat(unknownInfo.status()).isEqualTo(404);
        assertThat(unknownInfo.header("Content-Type").orElseThrow()).startsWith("application/problem+json");
        assertThat(http.get(pub("/d/short"), reader(2)).status()).isEqualTo(404);

        String docId = uploadPdf("Friendly.pdf", TestPdfs.pdf(1, "Friendly")).get("id").asString();
        JsonNode revoked = createLink(docId, Map.of("label", "Revoked"), asOwner());
        String token = linkToken(revoked);
        assertThat(http.get(pub("/d/" + token), reader(2)).status()).isEqualTo(200);
        assertThat(http.patch(api("/api/document-links/" + revoked.get("id").asString()), Map.of("revoked", true), asOwner()).status())
                .isEqualTo(200);
        TestHttp.Response gone = http.get(pub("/d/" + token), reader(2));
        assertThat(gone.status()).isEqualTo(410);
        assertThat(gone.text()).contains("Link no longer available");
        assertThat(http.get(pub("/d/" + token + "/info"), reader(2)).status()).isEqualTo(410);
        assertThat(http.get(pub("/d/" + token + "/pdf"), reader(2)).status()).isEqualTo(410);
        assertThat(http.get(pub("/d/" + token + "/file"), reader(2)).status()).isEqualTo(410);
        assertThat(beat(token, UUID.randomUUID(), 0, List.of(1), 1, reader(2)).status()).isEqualTo(410);

        String expiring = linkToken(createLink(docId, Map.of("expiresAt", now().plus(Duration.ofMinutes(2)).toString()), asOwner()));
        assertThat(http.get(pub("/d/" + expiring), reader(2)).status()).isEqualTo(200);
        clock.advance(Duration.ofMinutes(3));
        assertThat(http.get(pub("/d/" + expiring), reader(2)).status()).isEqualTo(410);

        String readOnly = linkToken(createLink(docId, Map.of("allowDownload", false), asOwner()));
        assertThat(http.get(pub("/d/" + readOnly + "/info"), reader(2)).json().get("allowDownload").asBoolean()).isFalse();
        TestHttp.Response off = http.get(pub("/d/" + readOnly + "/file"), reader(2));
        assertThat(off.status()).isEqualTo(403);
        assertThat(off.text()).contains("Download turned off", "href=\"/d/" + readOnly + "\"");
        assertThat(http.get(pub("/d/" + readOnly + "/pdf"), reader(2)).status()).as("reading online still works").isEqualTo(200);
    }

    @Test
    void theFirstBeatCountsAViewAndThirtyVisibleSecondsCountARead() {
        String account = uniqueAccount();
        String thread = "dv" + System.nanoTime();
        TrackedEmail email = sentEmail(account, "Application", thread, "recruiter@example.com");
        String docId = uploadPdf("Resume.pdf", TestPdfs.pdf(3, "Resume")).get("id").asString();
        String token = linkToken(createLink(docId, Map.of("emailId", email.id().toString()), asExtension()));
        clock.advance(Duration.ofMinutes(1));
        long cursor = lastActivityId();
        String[] reader = reader(3);
        UUID view = UUID.randomUUID();

        assertThat(beat(token, view, 0, List.of(1), 3, reader).status()).isEqualTo(204);
        List<JsonNode> items = docItems(cursor, docId);
        assertThat(items).hasSize(1);
        JsonNode viewed = items.getFirst();
        assertThat(viewed.get("kind").asString()).isEqualTo("DOC_VIEW");
        assertThat(viewed.get("emailId").asString()).isEqualTo(email.id().toString());
        assertThat(viewed.get("subject").asString()).isEqualTo("Application");
        assertThat(viewed.get("recipients").asString()).isEqualTo("recruiter@example.com");
        assertThat(viewed.get("account").asString()).isEqualTo(account);
        assertThat(viewed.get("gmailThreadId").asString()).isEqualTo(thread);
        assertThat(viewed.get("documentName").asString()).isEqualTo("Resume.pdf");
        assertThat(viewed.get("linkLabel").isNull()).isTrue();
        assertThat(viewed.get("openNumber").asInt()).as("the first view of the link").isEqualTo(1);
        assertThat(viewed.get("readSeconds").asInt()).isZero();
        assertThat(viewed.get("pagesViewed").asInt()).isEqualTo(1);
        assertThat(viewed.get("pageCount").asInt()).isEqualTo(3);
        assertThat(viewed.get("shouldNotify").asBoolean()).isTrue();
        assertThat(viewed.get("source").asString()).isEqualTo("DIRECT");

        for (int beat = 1; beat <= 5; beat++) {
            clock.advance(Duration.ofSeconds(5));
            assertThat(beat(token, view, 5_000, pagesUpTo(Math.min(beat + 1, 3)), 3, reader).status()).isEqualTo(204);
        }
        assertThat(docItems(cursor, docId)).as("25 s is not a read yet").hasSize(1);
        clock.advance(Duration.ofSeconds(5));
        beat(token, view, 5_000, pagesUpTo(3), 3, reader);
        items = docItems(cursor, docId);
        assertThat(items).extracting(item -> item.get("kind").asString()).containsExactly("DOC_VIEW", "DOC_READ");
        JsonNode read = items.get(1);
        assertThat(read.get("readSeconds").asInt()).isEqualTo(30);
        assertThat(read.get("pagesViewed").asInt()).isEqualTo(3);
        assertThat(read.get("openNumber").asInt()).as("the read of view 1").isEqualTo(1);
        assertThat(read.get("shouldNotify").asBoolean()).isTrue();
        clock.advance(Duration.ofSeconds(5));
        beat(token, view, 5_000, pagesUpTo(3), 3, reader);
        items = docItems(cursor, docId);
        assertThat(items).as("a read counts once").hasSize(2);
        assertThat(items.get(1).get("readSeconds").asInt()).as("reading time keeps growing").isEqualTo(35);

        JsonNode detail = http.get(api("/api/documents/" + docId), asOwner()).json();
        assertThat(detail.get("summary").get("views").asLong()).isEqualTo(1);
        assertThat(detail.get("summary").get("reads").asLong()).isEqualTo(1);
        assertThat(detail.get("summary").get("downloads").asLong()).isZero();
        assertThat(detail.get("summary").get("lastActivityAt").isNull()).isFalse();
        JsonNode events = detail.get("events");
        assertThat(events).hasSize(2);
        assertThat(events.get(0).get("type").asString()).isEqualTo("DOC_READ");
        assertThat(events.get(0).get("verdict").asString()).isEqualTo("COUNTED");
        assertThat(events.get(0).get("readSeconds").asInt()).isEqualTo(35);
        assertThat(events.get(0).get("pagesViewed").asInt()).isEqualTo(3);
        assertThat(events.get(1).get("type").asString()).isEqualTo("DOC_VIEW");
        assertThat(events.get(1).get("ipPrefix").asString()).isEqualTo("10.0.3.0/24");
        assertThat(detail.get("links").get(0).get("recipients").asString()).isEqualTo("recruiter@example.com");
        assertThat(detail.get("links").get(0).get("emailSubject").asString()).isEqualTo("Application");

        JsonNode mark = http.get(api("/api/marks?account=" + account + "&threadIds=" + thread), asExtension()).json().get("marks").get(thread);
        assertThat(mark.get("documentViews").asInt()).isEqualTo(1);
        JsonNode card = http.get(api("/api/emails/" + email.id() + "/card"), asExtension()).json();
        assertThat(card.get("documents")).hasSize(1);
        assertThat(card.get("documents").get(0).get("name").asString()).isEqualTo("Resume.pdf");
        assertThat(card.get("documents").get(0).get("views").asLong()).isEqualTo(1);
        assertThat(card.get("documents").get(0).get("reads").asLong()).isEqualTo(1);
        JsonNode emailDetail = http.get(api("/api/emails/" + email.id()), asOwner()).json();
        assertThat(emailDetail.get("documentLinks").get(0).get("views").asLong()).isEqualTo(1);
        assertThat(emailDetail.get("documentEvents")).hasSize(2);
        assertThat(http.get(api("/api/notifications?limit=5"), asOwner()).json().get("items").get(0).get("kind").asString())
                .isEqualTo("DOC_READ");
    }

    @Test
    void visibleTimeNeverRunsAheadOfTheWallClock() {
        String docId = uploadPdf("Guard.pdf", TestPdfs.pdf(1, "Guard")).get("id").asString();
        String token = shareLink(docId, "Guard");
        UUID view = UUID.randomUUID();
        for (int i = 0; i < 6; i++) {
            assertThat(beat(token, view, 10_000, List.of(1), 1, reader(4)).status()).isEqualTo(204);
        }
        assertThat(visibleMs(view)).as("no wall-clock time has passed: 10 s of slack only").isEqualTo(10_000);
        clock.advance(Duration.ofSeconds(20));
        beat(token, view, 10_000, List.of(1), 1, reader(4));
        assertThat(visibleMs(view)).isEqualTo(20_000);
        assertThat(summary(docId).get("reads").asLong()).isZero();
        clock.advance(Duration.ofSeconds(10));
        assertThat(beat(token, view, 99_999, List.of(1), 1, reader(4)).status()).as("capped, not refused").isEqualTo(204);
        assertThat(visibleMs(view)).isEqualTo(30_000);
        assertThat(summary(docId).get("reads").asLong()).isEqualTo(1);
    }

    @Test
    void theOwnersOwnViewsHeadRequestsScannersAndDeliveryChecksNeverCount() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Scanned", "sc" + System.nanoTime(), "scanned@example.com");
        String docId = uploadPdf("Scanned.pdf", TestPdfs.pdf(1, "Scanned")).get("id").asString();
        String token = linkToken(createLink(docId, Map.of("emailId", email.id().toString()), asExtension()));
        long cursor = lastActivityId();

        clock.advance(Duration.ofSeconds(12));
        beat(token, UUID.randomUUID(), 0, List.of(1), 1, reader(5));
        clock.advance(Duration.ofMinutes(1));
        UUID mine = UUID.randomUUID();
        String[] self = join(reader(6), SELF, SELF_SECRET);
        for (int i = 0; i < 8; i++) {
            assertThat(beat(token, mine, 5_000, List.of(1), 1, self).status()).isEqualTo(204);
            clock.advance(Duration.ofSeconds(5));
        }
        beat(token, UUID.randomUUID(), 0, List.of(1), 1, "User-Agent",
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0 Safari/537.36",
                "X-Forwarded-For", "10.0.7.1");
        assertThat(http.send("HEAD", pub("/d/" + token + "/file"), null, reader(8)).status()).isEqualTo(200);
        assertThat(http.get(pub("/d/" + token + "/file"), self).status()).isEqualTo(200);
        assertThat(http.get(pub("/d/" + token + "/file"), "User-Agent", "curl/8.9.1", "X-Forwarded-For", "10.0.9.1").status())
                .isEqualTo(200);

        JsonNode events = http.get(api("/api/documents/" + docId + "/events?size=25"), asOwner()).json().get("items");
        List<String> reasons = new ArrayList<>();
        events.forEach(event -> {
            assertThat(event.get("verdict").asString()).isEqualTo("IGNORED");
            reasons.add(event.get("type").asString() + ":" + event.get("reason").asString());
        });
        assertThat(reasons).containsExactly("DOC_DOWNLOAD:BOT_UA", "DOC_DOWNLOAD:SELF", "DOC_DOWNLOAD:BOT_HEAD", "DOC_VIEW:BOT_UA",
                "DOC_VIEW:SELF", "DOC_VIEW:BOT_TIMING");
        JsonNode summary = summary(docId);
        assertThat(summary.get("views").asLong()).isZero();
        assertThat(summary.get("reads").asLong()).as("the owner's 40 s never become a read").isZero();
        assertThat(summary.get("downloads").asLong()).isZero();
        assertThat(docItems(cursor, docId)).isEmpty();
    }

    @Test
    void downloadsCountOncePerReaderWithinTheDuplicateWindow() {
        byte[] pdf = TestPdfs.pdf(1, "Download me");
        String docId = uploadPdf("Download me.pdf", pdf).get("id").asString();
        String token = shareLink(docId, "Downloads");
        long cursor = lastActivityId();

        TestHttp.Response download = http.get(pub("/d/" + token + "/file"), reader(10));
        assertThat(download.status()).isEqualTo(200);
        assertThat(download.header("Content-Type")).hasValue("application/pdf");
        assertThat(download.header("Content-Disposition"))
                .hasValue("attachment; filename=\"Download me.pdf\"; filename*=UTF-8''Download%20me.pdf");
        assertThat(download.header("X-Content-Type-Options")).hasValue("nosniff");
        assertThat(download.header("Cache-Control")).hasValue("no-store");
        assertThat(download.body()).isEqualTo(pdf);
        assertThat(http.get(pub("/d/" + token + "/file"), reader(10)).status()).isEqualTo(200);
        clock.advance(Duration.ofSeconds(61));
        http.get(pub("/d/" + token + "/file"), reader(10));
        http.get(pub("/d/" + token + "/file"), reader(11));

        List<JsonNode> items = docItems(cursor, docId);
        assertThat(items).extracting(item -> item.get("openNumber").asInt()).containsExactly(1, 2, 3);
        assertThat(items).allSatisfy(item -> {
            assertThat(item.get("kind").asString()).isEqualTo("DOC_DOWNLOAD");
            assertThat(item.get("readSeconds").isNull()).isTrue();
            assertThat(item.get("emailId").isNull()).isTrue();
            assertThat(item.get("linkLabel").asString()).isEqualTo("Downloads");
        });
        assertThat(summary(docId).get("downloads").asLong()).isEqualTo(3);
        assertThat(jdbc.sql("SELECT count(*) FROM document_event e JOIN document_link l ON l.id = e.link_id WHERE l.token = :t AND reason = 'DUPLICATE'")
                .param("t", token).query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void aReloadContinuesTheViewWhileLaterVisitsCountAgainAndThreeViewsRaiseAnAlert() {
        String docId = uploadPdf("Portfolio.pdf", TestPdfs.pdf(2, "Portfolio")).get("id").asString();
        String token = shareLink(docId, "LinkedIn");
        long cursor = lastActivityId();
        String[] reader = reader(20);
        UUID first = UUID.randomUUID();
        UUID reload = UUID.randomUUID();

        beat(token, first, 0, List.of(1), 2, reader);
        clock.advance(Duration.ofSeconds(20));
        beat(token, first, 10_000, List.of(1), 2, reader);
        clock.advance(Duration.ofSeconds(5));
        beat(token, reload, 0, List.of(1), 2, reader);
        clock.advance(Duration.ofSeconds(10));
        beat(token, reload, 10_000, List.of(1, 2), 2, reader);
        assertThat(summary(docId).get("views").asLong()).as("a reload is the same view").isEqualTo(1);
        clock.advance(Duration.ofSeconds(10));
        beat(token, reload, 10_000, List.of(2), 2, reader);
        assertThat(summary(docId).get("reads").asLong()).as("the reload's time adds up").isEqualTo(1);

        clock.advance(Duration.ofMinutes(2));
        beat(token, UUID.randomUUID(), 0, List.of(1), 2, reader);
        clock.advance(Duration.ofMinutes(2));
        beat(token, UUID.randomUUID(), 0, List.of(1), 2, reader(21));
        clock.advance(Duration.ofMinutes(2));
        beat(token, UUID.randomUUID(), 0, List.of(1), 2, reader(22));

        List<JsonNode> items = docItems(cursor, docId);
        assertThat(items).extracting(item -> item.get("kind").asString() + item.get("openNumber").asString())
                .containsExactly("DOC_VIEW1", "DOC_READ1", "DOC_VIEW2", "DOC_VIEW3", "ALERT", "DOC_VIEW4");
        JsonNode alert = items.get(4);
        assertThat(alert.get("alertType").asString()).isEqualTo("DOC_VIEWS");
        assertThat(alert.get("alertText").asString()).isEqualTo("Document viewed 3 times");
        assertThat(alert.get("documentName").asString()).isEqualTo("Portfolio.pdf");
        assertThat(alert.get("linkLabel").asString()).isEqualTo("LinkedIn");
        assertThat(alert.get("emailId").isNull()).isTrue();
        assertThat(alert.get("readSeconds").isNull()).isTrue();
        assertThat(items.get(1).get("pagesViewed").asInt()).isEqualTo(2);

        JsonNode alerts = http.get(api("/api/alerts?size=100"), asOwner()).json().get("items");
        JsonNode found = null;
        for (JsonNode item : alerts) {
            if (docId.equals(item.get("documentId").asString())) {
                found = item;
            }
        }
        assertThat(found).isNotNull();
        assertThat(found.get("type").asString()).isEqualTo("DOC_VIEWS");
        assertThat(found.get("documentName").asString()).isEqualTo("Portfolio.pdf");
        assertThat(found.get("linkLabel").asString()).isEqualTo("LinkedIn");
        assertThat(found.get("emailId").isNull()).isTrue();
        assertThat(found.get("recipients").asString()).isEmpty();
    }

    @Test
    void documentNotificationsFollowTheSettingsAndTheEmailsMute() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Muted later", "mu" + System.nanoTime(), "muted@example.com");
        String docId = uploadPdf("Notify.pdf", TestPdfs.pdf(1, "Notify")).get("id").asString();
        String share = shareLink(docId, "Share");
        String forEmail = linkToken(createLink(docId, Map.of("emailId", email.id().toString()), asExtension()));
        clock.advance(Duration.ofMinutes(1));
        long cursor = lastActivityId();
        beat(share, UUID.randomUUID(), 0, List.of(1), 1, reader(30));
        clock.advance(Duration.ofMinutes(2));
        beat(share, UUID.randomUUID(), 0, List.of(1), 1, reader(31));
        beat(forEmail, UUID.randomUUID(), 0, List.of(1), 1, reader(32));

        assertThat(notified(cursor, docId)).containsExactly(true, true, true);
        withSettings(settings -> settings.put("notifyDocuments", false),
                () -> assertThat(notified(cursor, docId)).containsExactly(false, false, false));
        withSettings(settings -> settings.put("notifyOn", "FIRST"),
                () -> assertThat(notified(cursor, docId)).as("only the first view of each link").containsExactly(true, false, true));
        assertThat(http.patch(api("/api/emails/" + email.id() + "/preferences"), Map.of("notifications", false), asExtension()).status())
                .isEqualTo(204);
        assertThat(notified(cursor, docId)).as("muting the email mutes its document link").containsExactly(true, true, false);
    }

    @Test
    void beatsAreJsonOrTextAndAnythingElseIsRefused() {
        String docId = uploadPdf("Beats.pdf", TestPdfs.pdf(2, "Beats")).get("id").asString();
        String token = shareLink(docId, "Beats");
        String path = "/d/" + token + "/beat";
        String json = "{\"viewId\":\"" + UUID.randomUUID() + "\",\"visibleMs\":0,\"page\":1,\"pagesViewed\":[1],\"pageCount\":2,\"extra\":true}";
        assertThat(raw(path, "text/plain;charset=UTF-8", json).status()).as("sendBeacon with a string").isEqualTo(204);
        assertThat(raw(path, "application/json", json).status()).isEqualTo(204);
        assertThat(raw(path, "application/x-www-form-urlencoded", json).status()).isEqualTo(415);
        assertThat(raw(path, null, json).status()).isEqualTo(415);
        assertThat(raw(path, "application/json", "{").status()).isEqualTo(400);
        assertThat(raw(path, "application/json", "").status()).isEqualTo(400);
        assertThat(raw(path, "application/json", "{\"viewId\":\"" + UUID.randomUUID() + "\"}").status()).isEqualTo(400);
        assertThat(raw(path, "application/json", json.replace("\"page\":1", "\"page\":3")).status()).isEqualTo(400);
        assertThat(raw(path, "application/json", json.replaceFirst("\"viewId\":\"[^\"]+\"", "\"viewId\":\"abc\"")).status()).isEqualTo(400);
        assertThat(raw(path, "application/json", "{\"pad\":\"" + "x".repeat(70_000) + "\"}").status()).isEqualTo(413);
        TestHttp.Response unknown = raw("/d/" + com.mailpulse.common.RandomTokens.trackingToken() + "/beat", "application/json", json);
        assertThat(unknown.status()).isEqualTo(404);
        assertThat(unknown.header("Content-Type").orElseThrow()).startsWith("application/problem+json");
        assertThat(raw("/d/short/beat", "application/json", json).status()).isEqualTo(404);
    }

    @Test
    void beatsAreRateLimitedPerLinkAndNetwork() {
        String token = shareLink(uploadPdf("Limits.pdf", TestPdfs.pdf(1, "Limits")).get("id").asString(), "Limits");
        UUID view = UUID.randomUUID();
        int limited = 0;
        for (int i = 0; i < 70; i++) {
            if (beat(token, view, 0, List.of(1), 1, reader(40)).status() == 429) {
                limited++;
            }
        }
        assertThat(limited).isPositive();
        assertThat(beat(token, UUID.randomUUID(), 0, List.of(1), 1, reader(41)).status()).as("another network").isEqualTo(204);
    }

    @Test
    void quickSearchFindsDocumentsByName() {
        String word = "Quince" + UUID.randomUUID().toString().substring(0, 6);
        String docId = uploadPdf(word + " plan.pdf", TestPdfs.pdf(1, "x")).get("id").asString();
        JsonNode found = http.get(api("/api/search?q=" + word.toLowerCase() + "%20plan"), asOwner()).json().get("documents");
        assertThat(found).hasSize(1);
        assertThat(found.get(0).get("id").asString()).isEqualTo(docId);
        assertThat(found.get(0).get("name").asString()).isEqualTo(word + " plan.pdf");
    }

    private void assertAsset(String path, String type, String cache) {
        TestHttp.Response response = http.get(pub(path), reader(1));
        assertThat(response.status()).as(path).isEqualTo(200);
        assertThat(response.header("Content-Type")).as(path).hasValue(type);
        assertThat(response.header("Cache-Control")).as(path).hasValue(cache);
        assertThat(response.header("Content-Security-Policy")).as(path).hasValue(PublicDocumentController.VIEWER_CSP);
        assertThat(response.header("X-Content-Type-Options")).as(path).hasValue("nosniff");
    }

    private String shareLink(String documentId, String label) {
        return linkToken(createLink(documentId, Map.of("label", label), asOwner()));
    }

    private TestHttp.Response raw(String path, String contentType, String body) {
        return http.sendRaw("POST", pub(path), contentType, body.getBytes(StandardCharsets.UTF_8), reader(50));
    }

    private JsonNode summary(String documentId) {
        return http.get(api("/api/documents/" + documentId), asOwner()).json().get("summary");
    }

    private long visibleMs(UUID viewUuid) {
        return jdbc.sql("SELECT visible_ms FROM document_view WHERE view_uuid = :v").param("v", viewUuid).query(Long.class).single();
    }

    private long lastActivityId() {
        return http.get(api("/api/activity?limit=1"), asExtension()).json().get("lastId").asLong();
    }

    /** Document items and alerts of one document after the cursor, oldest first, read with the extension token. */
    private List<JsonNode> docItems(long since, String documentId) {
        List<JsonNode> found = new ArrayList<>();
        JsonNode page = http.get(api("/api/activity?since=" + since + "&limit=100&kinds=" + KINDS), asExtension()).json();
        for (JsonNode item : page.get("items")) {
            if (documentId.equals(item.get("documentId").asString())) {
                found.add(item);
            }
        }
        return found;
    }

    private List<Boolean> notified(long since, String documentId) {
        return docItems(since, documentId).stream().map(item -> item.get("shouldNotify").asBoolean()).toList();
    }

    @SuppressWarnings("unchecked")
    private void withSettings(Consumer<Map<String, Object>> change, Runnable check) {
        JsonNode original = http.get(api("/api/settings"), asOwner()).json();
        Map<String, Object> changed = TestHttp.JSON.convertValue(original, Map.class);
        change.accept(changed);
        assertThat(http.put(api("/api/settings"), changed, asOwner()).status()).isEqualTo(200);
        try {
            check.run();
        } finally {
            assertThat(http.put(api("/api/settings"), original, asOwner()).status()).isEqualTo(200);
        }
    }

    private static List<Integer> pagesUpTo(int last) {
        List<Integer> pages = new ArrayList<>();
        for (int page = 1; page <= last; page++) {
            pages.add(page);
        }
        return pages;
    }
}
