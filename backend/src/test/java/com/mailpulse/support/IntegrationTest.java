package com.mailpulse.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.auth.OwnerService;
import com.mailpulse.auth.SessionService;
import com.mailpulse.common.web.PortRegistry;
import com.mailpulse.tracking.EventFinalizer;
import java.net.URI;
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
