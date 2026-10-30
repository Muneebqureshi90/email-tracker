package com.mailpulse.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.mailpulse.auth.OwnerService;
import com.mailpulse.auth.SessionService;
import com.mailpulse.common.web.PortRegistry;
import com.mailpulse.tracking.EventFinalizer;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.JsonNode;

/**
 * Base for integration tests: the full application on real ports against PostgreSQL in Docker.
 * All subclasses share one Spring context and one database, so every test creates its own data.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(TestcontainersConfig.class)
public abstract class IntegrationTest {

    protected static final String PASSWORD = "correct horse battery staple";
    protected static final String EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
    protected static final String GMAIL_PROXY_UA =
            "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)";
    protected static final String BROWSER_UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

    private static final Map<Integer, String> OWNER_COOKIES = new ConcurrentHashMap<>();
    private static final Map<Integer, String> EXTENSION_TOKENS = new ConcurrentHashMap<>();

    @Autowired
    protected PortRegistry ports;

    @Autowired
    protected MutableClock clock;

    @Autowired
    protected JdbcClient jdbc;

    @Autowired
    protected OwnerService owner;

    @Autowired
    protected EventFinalizer finalizer;

    protected final TestHttp http = new TestHttp();

    protected URI api(String path) {
        return URI.create("http://127.0.0.1:" + ports.privatePort() + path);
    }

    protected URI pub(String path) {
        return URI.create("http://127.0.0.1:" + ports.publicPort() + path);
    }

    protected String[] asOwner(String... extra) {
        return join(new String[] {"Cookie", SessionService.COOKIE + "=" + ownerCookie()}, extra);
    }

    protected String[] asExtension(String... extra) {
        return join(new String[] {"Authorization", "Bearer " + extensionToken()}, extra);
    }

    protected String ownerCookie() {
        return OWNER_COOKIES.computeIfAbsent(ports.privatePort(), port -> {
            TestHttp.Response response = owner.setupRequired()
                    ? http.post(api("/api/auth/setup"), Map.of("setupCode", owner.pendingSetupCode().orElseThrow(), "password", PASSWORD))
                    : http.post(api("/api/auth/login"), Map.of("password", PASSWORD));
            assertThat(response.status()).as("owner sign-in").isIn(201, 204);
            return response.cookie(SessionService.COOKIE);
        });
    }

    protected String extensionToken() {
        return EXTENSION_TOKENS.computeIfAbsent(ports.privatePort(), port -> {
            TestHttp.Response response = http.post(api("/api/tokens"), Map.of("name", "test extension"), asOwner());
            assertThat(response.status()).isEqualTo(201);
            return response.json().get("token").asString();
        });
    }

    /** Registers a draft through the extension API. */
    protected TrackedEmail registerEmail(String account) {
        TestHttp.Response response = http.post(
                api("/api/emails"),
                Map.of("account", account, "clientRef", UUID.randomUUID().toString(), "trackOpens", true, "trackLinks", true),
                asExtension());
        assertThat(response.status()).isEqualTo(201);
        JsonNode body = response.json();
        String pixelUrl = body.get("pixelUrl").asString();
        String token = pixelUrl.substring(pixelUrl.lastIndexOf('/') + 1, pixelUrl.length() - ".gif".length());
        return new TrackedEmail(UUID.fromString(body.get("id").asString()), token, account);
    }

    /** Registers an email and marks it sent now (by the test clock). */
    protected TrackedEmail sentEmail(String account, String subject, String threadId, String... recipients) {
        TrackedEmail email = registerEmail(account);
        List<Map<String, String>> to = new ArrayList<>();
        for (String recipient : recipients) {
            to.add(Map.of("email", recipient, "kind", "TO"));
        }
        TestHttp.Response response = http.patch(
                api("/api/emails/" + email.id()),
                Map.of(
                        "status", "SENT",
                        "sentAt", clock.instant().toString(),
                        "subject", subject,
                        "gmailThreadId", threadId,
                        "gmailMessageId", "m" + threadId,
                        "recipients", to),
                asExtension());
        assertThat(response.status()).isEqualTo(204);
        return email;
    }

    protected TestHttp.Response fetchPixel(String token, String userAgent, String... extraHeaders) {
        return http.get(pub("/t/" + token + ".gif"), join(new String[] {"User-Agent", userAgent}, extraHeaders));
    }

    /** Moves past the send grace, loads the pixel through Gmail's proxy and lets the finalizer count it. */
    protected void countOpen(TrackedEmail email) {
        clock.advance(Duration.ofSeconds(20));
        long before = eventCount(email.id());
        assertThat(fetchPixel(email.token(), GMAIL_PROXY_UA).status()).isEqualTo(200);
        await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == before + 1);
        clock.advance(Duration.ofSeconds(31));
        finalizer.runOnce();
    }

    /** Uploads a PDF as the owner; returns its DocumentSummary. */
    protected JsonNode uploadPdf(String fileName, byte[] pdf) {
        TestHttp.Response response = http.multipart("POST", api("/api/documents"), fileName, "application/pdf", pdf, new String[0], asOwner());
        assertThat(response.status()).as("upload").isEqualTo(201);
        return response.json();
    }

    /** Creates a document link (share link or email link) with the given credentials; returns the DocLinkView. */
    protected JsonNode createLink(String documentId, Map<String, ?> body, String... auth) {
        TestHttp.Response response = http.post(api("/api/documents/" + documentId + "/links"), body, auth);
        assertThat(response.status()).as("create link").isIn(200, 201);
        return response.json();
    }

    /** The token at the end of a DocLinkView url (publicBaseUrl + /d/{token}). */
    protected static String linkToken(JsonNode link) {
        String url = link.get("url").asString();
        return url.substring(url.lastIndexOf("/d/") + 3);
    }

    /** One viewer heartbeat, as the viewer sends it. */
    protected TestHttp.Response beat(String token, UUID viewId, long visibleMs, List<Integer> pagesViewed, int pageCount,
            String... headers) {
        Map<String, Object> body = Map.of(
                "viewId", viewId.toString(),
                "visibleMs", visibleMs,
                "page", pagesViewed.isEmpty() ? 1 : pagesViewed.getLast(),
                "pagesViewed", pagesViewed,
                "pageCount", pageCount);
        return http.post(pub("/d/" + token + "/beat"), body, headers);
    }

    /** Request headers of a recipient's browser in a network of its own (private range; addresses are truncated to /24). */
    protected static String[] reader(int network) {
        return new String[] {"User-Agent", BROWSER_UA, "X-Forwarded-For", "10." + ((network >> 8) & 0xff) + "." + (network & 0xff) + ".23"};
    }

    protected long eventCount(UUID emailId) {
        return jdbc.sql("SELECT count(*) FROM tracking_event WHERE tracked_email_id = :id").param("id", emailId)
                .query(Long.class).single();
    }

    protected static String uniqueAccount() {
        return "owner-" + UUID.randomUUID() + "@gmail.com";
    }

    protected Instant now() {
        return clock.instant();
    }

    protected static String[] join(String[] first, String... more) {
        String[] all = new String[first.length + more.length];
        System.arraycopy(first, 0, all, 0, first.length);
        System.arraycopy(more, 0, all, first.length, more.length);
        return all;
    }

    public record TrackedEmail(UUID id, String token, String account) {}
}
