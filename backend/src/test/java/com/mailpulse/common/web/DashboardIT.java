package com.mailpulse.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestHttp;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** The dashboard is served on the private port only, with its own routes and a strict CSP. */
class DashboardIT extends IntegrationTest {

    @Test
    void appRoutesServeTheSinglePageAppWithStrictHeaders() {
        for (String path : List.of("/", "/login", "/emails", "/emails/" + UUID.randomUUID(), "/contacts/jane@example.com", "/settings")) {
            TestHttp.Response response = http.get(api(path));
            assertThat(response.status()).as(path).isEqualTo(200);
            assertThat(response.text()).as(path).contains("mailpulse-dashboard-test");
            assertThat(response.header("Content-Security-Policy").orElseThrow())
                    .contains("default-src 'self'", "script-src 'self'", "frame-ancestors 'none'")
                    .doesNotContain("unsafe");
            assertThat(response.header("Referrer-Policy")).contains("no-referrer");
            assertThat(response.header("X-Content-Type-Options")).contains("nosniff");
        }
        assertThat(http.get(api("/assets/app-test.js")).status()).isEqualTo(200);
    }

    @Test
    void everythingElseStaysClosed() {
        assertThat(http.get(api("/not-a-page")).status()).isIn(401, 403);
        assertThat(http.get(api("/api/contacts")).status()).isEqualTo(401);
        assertThat(http.post(api("/emails"), "{}").status()).isIn(401, 403);
        assertThat(http.get(pub("/emails")).status()).isEqualTo(404);
        assertThat(http.get(pub("/assets/app-test.js")).status()).isEqualTo(404);
    }
}
