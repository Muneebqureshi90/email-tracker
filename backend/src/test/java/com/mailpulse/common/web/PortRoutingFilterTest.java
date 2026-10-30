package com.mailpulse.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** The public port is deny by default: only the routes of the contract, with the right methods. */
class PortRoutingFilterTest {

    private static final String TOKEN = "AbCdEfGhIjKlMnOpQrStUv_-";

    @Test
    void publicPortAllowsOnlyTheTrackingAndDocumentRoutes() {
        String[] reads = {
            "/t/" + TOKEN + ".gif", "/c/" + TOKEN, "/d/" + TOKEN, "/d/" + TOKEN + "/info", "/d/" + TOKEN + "/pdf",
            "/d/" + TOKEN + "/file", "/d/_/assets/index-Efr5_Csw.js", "/d/_/assets/pdf.worker.min-CjEcRF4W.mjs",
            "/d/_/standard_fonts/LiberationSans-Bold.ttf", "/d/_/cmaps/78-EUC-H.bcmap", "/d/_/iccs/CGATS001Compat-v2-micro.icc",
            "/d/_/wasm/openjpeg.wasm"
        };
        for (String path : reads) {
            assertThat(PortRoutingFilter.allowedOnPublicPort("GET", path)).as("GET " + path).isTrue();
            assertThat(PortRoutingFilter.allowedOnPublicPort("HEAD", path)).as("HEAD " + path).isTrue();
            assertThat(PortRoutingFilter.allowedOnPublicPort("POST", path)).as("POST " + path).isFalse();
            assertThat(PortRoutingFilter.allowedOnPublicPort("DELETE", path)).as("DELETE " + path).isFalse();
        }
        assertThat(PortRoutingFilter.allowedOnPublicPort("POST", "/d/" + TOKEN + "/beat")).isTrue();
        assertThat(PortRoutingFilter.allowedOnPublicPort("GET", "/d/" + TOKEN + "/beat")).isFalse();
        assertThat(PortRoutingFilter.allowedOnPublicPort("OPTIONS", "/d/" + TOKEN + "/beat")).isFalse();
        assertThat(PortRoutingFilter.allowedOnPublicPort("PUT", "/d/" + TOKEN + "/beat")).isFalse();
    }

    @Test
    void publicPortRefusesEverythingElse() {
        String[] refused = {
            "/", "/index.html", "/api/auth/status", "/actuator/health", "/assets/app.js", "/d", "/d/", "/d/_", "/d/_/",
            "/d/short", "/d/" + TOKEN + "x", "/d/" + TOKEN + "/", "/d/" + TOKEN + "/info/", "/d/" + TOKEN + "/other",
            "/d/" + TOKEN + "/pdf.js", "/d/_/index.html", "/d/_/../index.html", "/d/_/assets/../../index.html",
            "/d/_/./assets/a.js", "/d/_/assets//a.js", "/d/_/assets/%2e%2e/a.js", "/d/_/assets%2Fa.js", "/d/_/assets\\a.js",
            "/d/_/.env", "/d/_/assets/.hidden.js", "/d/_/assets/a.js;jsessionid=1", "/d/_/assets/a", "/d/_/a/b/c/d/e/f/g.js",
            "/d/_/" + "a".repeat(200) + ".js", "/t/" + TOKEN, "/c/" + TOKEN + "/x"
        };
        for (String path : refused) {
            assertThat(PortRoutingFilter.allowedOnPublicPort("GET", path)).as(path).isFalse();
        }
    }

    @Test
    void privatePortNeverServesPublicRoutes() {
        for (String path : new String[] {"/t/" + TOKEN + ".gif", "/c/" + TOKEN, "/d/" + TOKEN, "/d/_/assets/a.js"}) {
            assertThat(PortRoutingFilter.allowedOnPrivatePort(path)).as(path).isFalse();
        }
        for (String path : new String[] {"/", "/api/documents", "/documents", "/assets/app.js", "/dashboard"}) {
            assertThat(PortRoutingFilter.allowedOnPrivatePort(path)).as(path).isTrue();
        }
    }
}
