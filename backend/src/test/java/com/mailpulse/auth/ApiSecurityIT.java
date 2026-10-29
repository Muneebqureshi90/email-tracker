package com.mailpulse.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestHttp;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Private API protection: credentials, scopes, Host header, CORS. */
class ApiSecurityIT extends IntegrationTest {

    @Test
    void everyProtectedEndpointRequiresCredentials() {
        List<String[]> calls = List.of(
                new String[] {"GET", "/api/emails"},
                new String[] {"GET", "/api/emails/00000000-0000-0000-0000-000000000000"},
                new String[] {"POST", "/api/emails"},
                new String[] {"PATCH", "/api/emails/00000000-0000-0000-0000-000000000000"},
                new String[] {"GET", "/api/marks?account=a@b.co&threadIds=x"},
                new String[] {"POST", "/api/self-views"},
                new String[] {"GET", "/api/activity"},
                new String[] {"GET", "/api/stream"},
                new String[] {"GET", "/api/settings"},
                new String[] {"PUT", "/api/settings"},
                new String[] {"GET", "/api/config"},
                new String[] {"GET", "/api/tokens"},
                new String[] {"POST", "/api/tokens"},
                new String[] {"POST", "/api/auth/logout"},
                new String[] {"PUT", "/api/auth/password"});
        for (String[] call : calls) {
            TestHttp.Response response = http.send(call[0], api(call[1]), call[0].equals("GET") ? null : "{}");
            assertThat(response.status()).as(call[0] + " " + call[1]).isEqualTo(401);
            assertThat(response.header("Content-Type").orElseThrow()).startsWith("application/problem+json");
        }
    }

    @Test
    void healthAndStatusAreOpenOnThePrivatePort() {
        TestHttp.Response health = http.get(api("/actuator/health"));
        assertThat(health.status()).isEqualTo(200);
        assertThat(health.json().get("status").asString()).isEqualTo("UP");
        assertThat(http.get(api("/api/auth/status")).status()).isEqualTo(200);
    }

    @Test
    void extensionTokenCannotReachOwnerOnlyEndpoints() {
        for (String path : List.of("/api/settings", "/api/tokens", "/api/emails", "/api/stream")) {
            assertThat(http.get(api(path), asExtension()).status()).as(path).isEqualTo(403);
        }
        assertThat(http.get(api("/api/config"), asExtension()).status()).isEqualTo(200);
        assertThat(http.get(api("/api/activity"), asExtension()).status()).isEqualTo(200);
    }

    @Test
    void invalidTokensAreRejected() {
        assertThat(http.get(api("/api/config"), "Authorization", "Bearer mp_not-a-real-token").status()).isEqualTo(401);
        assertThat(http.get(api("/api/config"), "Authorization", "Bearer something-else").status()).isEqualTo(401);
    }

    @Test
    void foreignHostHeaderIsRejected() throws IOException {
        String status = rawStatusLine("GET /api/auth/status HTTP/1.1\r\nHost: attacker.example:" + ports.privatePort()
                + "\r\nConnection: close\r\n\r\n");
        assertThat(status).contains(" 400 ");
    }

    @Test
    void crossOriginRequestsFromUnknownOriginsAreRejected() {
        TestHttp.Response simplePost = http.post(api("/api/auth/login"), Map.of("password", "x"), "Origin", "https://evil.example");
        assertThat(simplePost.status()).isEqualTo(403);

        TestHttp.Response evilPreflight = http.send("OPTIONS", api("/api/emails"), null,
                "Origin", "https://evil.example", "Access-Control-Request-Method", "POST");
        assertThat(evilPreflight.status()).isEqualTo(403);

        TestHttp.Response extensionPreflight = http.send("OPTIONS", api("/api/emails"), null,
                "Origin", EXTENSION_ORIGIN, "Access-Control-Request-Method", "POST",
                "Access-Control-Request-Headers", "authorization,content-type");
        assertThat(extensionPreflight.status()).isEqualTo(200);
        assertThat(extensionPreflight.header("Access-Control-Allow-Origin")).hasValue(EXTENSION_ORIGIN);
    }

    @Test
    void sessionCookieIsHttpOnlyAndSameSiteStrict() {
        ownerCookie();
        TestHttp.Response login = http.post(api("/api/auth/login"), Map.of("password", PASSWORD));
        assertThat(login.status()).isEqualTo(204);
        assertThat(login.setCookie(SessionService.COOKIE)).contains("HttpOnly", "SameSite=Strict", "Path=/");
    }

    private String rawStatusLine(String request) throws IOException {
        try (Socket socket = new Socket("127.0.0.1", ports.privatePort())) {
            OutputStream out = socket.getOutputStream();
            out.write(request.getBytes(StandardCharsets.US_ASCII));
            out.flush();
            InputStream in = socket.getInputStream();
            StringBuilder line = new StringBuilder();
            int c;
            while ((c = in.read()) != -1 && c != '\n') {
                line.append((char) c);
            }
            return line.toString();
        }
    }
}
