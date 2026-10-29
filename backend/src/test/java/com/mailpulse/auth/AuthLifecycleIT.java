package com.mailpulse.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestHttp;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

/**
 * Owner account from first run to lockout. Runs in its own Spring context (and its own database)
 * so it starts with no owner, independent of the shared integration-test context.
 */
@TestPropertySource(properties = "test.context=auth-lifecycle")
class AuthLifecycleIT extends IntegrationTest {

    private static final String NEW_PASSWORD = "an even longer passphrase 2026";

    @Test
    void ownerAccountLifecycle() {
        TestHttp.Response status = http.get(api("/api/auth/status"));
        assertThat(status.json().get("setupRequired").asBoolean()).isTrue();
        assertThat(status.json().get("authenticated").asBoolean()).isFalse();

        assertThat(http.post(api("/api/auth/setup"), Map.of("setupCode", "WRONG-CODE1", "password", PASSWORD)).status())
                .isEqualTo(403);
        String code = owner.pendingSetupCode().orElseThrow();
        assertThat(http.post(api("/api/auth/setup"), Map.of("setupCode", code, "password", "short")).status()).isEqualTo(400);

        TestHttp.Response setup = http.post(api("/api/auth/setup"), Map.of("setupCode", code.toLowerCase(), "password", PASSWORD));
        assertThat(setup.status()).isEqualTo(201);
        String firstCookie = setup.cookie(SessionService.COOKIE);
        assertThat(http.post(api("/api/auth/setup"), Map.of("setupCode", code, "password", PASSWORD)).status()).isEqualTo(409);
        assertThat(owner.pendingSetupCode()).isEmpty();

        TestHttp.Response signedIn = http.get(api("/api/auth/status"), cookie(firstCookie));
        assertThat(signedIn.json().get("setupRequired").asBoolean()).isFalse();
        assertThat(signedIn.json().get("authenticated").asBoolean()).isTrue();

        assertThat(http.post(api("/api/auth/login"), Map.of("password", "wrong password!!")).status()).isEqualTo(401);
        TestHttp.Response login = http.post(api("/api/auth/login"), Map.of("password", PASSWORD));
        assertThat(login.status()).isEqualTo(204);
        String loginCookie = login.cookie(SessionService.COOKIE);
        assertThat(http.get(api("/api/settings"), cookie(loginCookie)).status()).isEqualTo(200);

        // A password change ends every older session.
        clock.advance(Duration.ofSeconds(2));
        assertThat(http.put(api("/api/auth/password"), Map.of("currentPassword", "nope nope nope", "newPassword", NEW_PASSWORD),
                cookie(loginCookie)).status()).isEqualTo(403);
        TestHttp.Response changed = http.put(api("/api/auth/password"),
                Map.of("currentPassword", PASSWORD, "newPassword", NEW_PASSWORD), cookie(loginCookie));
        assertThat(changed.status()).isEqualTo(204);
        String newCookie = changed.cookie(SessionService.COOKIE);
        assertThat(http.get(api("/api/settings"), cookie(loginCookie)).status()).isEqualTo(401);
        assertThat(http.get(api("/api/settings"), cookie(newCookie)).status()).isEqualTo(200);

        TestHttp.Response logout = http.post(api("/api/auth/logout"), null, cookie(newCookie));
        assertThat(logout.status()).isEqualTo(204);
        assertThat(logout.setCookie(SessionService.COOKIE)).contains("Max-Age=0");

        // Five attempts per minute, then 429 until the bucket refills.
        clock.advance(Duration.ofMinutes(2));
        for (int i = 0; i < 5; i++) {
            assertThat(http.post(api("/api/auth/login"), Map.of("password", "wrong password!!")).status()).isEqualTo(401);
        }
        assertThat(http.post(api("/api/auth/login"), Map.of("password", NEW_PASSWORD)).status()).isEqualTo(429);

        // Ten failures in total lock the account for 15 minutes, even with the right password.
        clock.advance(Duration.ofMinutes(2));
        for (int i = 0; i < 5; i++) {
            assertThat(http.post(api("/api/auth/login"), Map.of("password", "wrong password!!")).status()).isEqualTo(401);
        }
        clock.advance(Duration.ofMinutes(2));
        assertThat(http.post(api("/api/auth/login"), Map.of("password", NEW_PASSWORD)).status()).isEqualTo(429);
        clock.advance(Duration.ofMinutes(16));
        assertThat(http.post(api("/api/auth/login"), Map.of("password", NEW_PASSWORD)).status()).isEqualTo(204);
    }

    private static String[] cookie(String value) {
        return new String[] {"Cookie", SessionService.COOKIE + "=" + value};
    }
}
