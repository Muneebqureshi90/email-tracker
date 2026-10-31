package com.mailpulse.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/** Recipients who paste a document link badly get the clean link or a friendly page; robots are told to stay out. */
class PortRoutingFixesTest {

    private static final String TOKEN = "AbCdEfGhIjKlMnOpQrStUv_-";
    private static final int PUBLIC_PORT = 8081;
    private static final int PRIVATE_PORT = 8080;

    private final PortRoutingFilter filter = filter();

    private static PortRoutingFilter filter() {
        PortRegistry ports = new PortRegistry() {
            @Override
            public boolean isPublic(int localPort) {
                return localPort == PUBLIC_PORT;
            }
        };
        return new PortRoutingFilter(ports);
    }

    private record Result(MockHttpServletResponse response, boolean passedOn) {}

    private Result send(String method, String path, int port) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.setLocalPort(port);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        filter.doFilter(request, response, chain);
        return new Result(response, chain.getRequest() != null);
    }

    @Test
    void documentLinkWithPastedTrailingCharactersRedirectsToTheCleanLink() throws Exception {
        for (String suffix : new String[] {"/", ".", ")", ",", "%20", ").", "/%20", "%20%20", ".,)/"}) {
            for (String method : new String[] {"GET", "HEAD"}) {
                Result result = send(method, "/d/" + TOKEN + suffix, PUBLIC_PORT);
                assertThat(result.passedOn()).as(method + " " + suffix).isFalse();
                assertThat(result.response().getStatus()).as(method + " " + suffix).isEqualTo(301);
                assertThat(result.response().getHeader("Location")).as(method + " " + suffix).isEqualTo("/d/" + TOKEN);
                assertThat(result.response().getContentAsByteArray()).as(method + " " + suffix).isEmpty();
            }
        }
        assertThat(PortRoutingFilter.cleanDocumentPath("/d/" + TOKEN)).isNull();
        assertThat(PortRoutingFilter.cleanDocumentPath("/d/" + TOKEN + "/info")).isNull();
        assertThat(PortRoutingFilter.cleanDocumentPath("/d/" + TOKEN + "x")).isNull();
        assertThat(PortRoutingFilter.cleanDocumentPath("/d/" + TOKEN + "%2F")).isNull();
        assertThat(PortRoutingFilter.cleanDocumentPath("/d/short.")).isNull();
        assertThat(PortRoutingFilter.cleanDocumentPath("/t/" + TOKEN + ".")).isNull();
    }

    @Test
    void otherUnmatchedDocumentReadsGetTheFriendlyNotFoundPage() throws Exception {
        String[] paths = {"/d/abc", "/d/", "/d/_/index.html", "/d/" + TOKEN + "x", "/d/" + TOKEN + "/other",
            "/d/" + TOKEN + "/info/", "/d/" + TOKEN + "/beat"};
        for (String path : paths) {
            Result get = send("GET", path, PUBLIC_PORT);
            assertThat(get.passedOn()).as(path).isFalse();
            assertThat(get.response().getStatus()).as(path).isEqualTo(404);
            assertThat(get.response().getContentType()).as(path).startsWith("text/html");
            assertThat(get.response().getContentAsString()).as(path).contains("Link not found");
            assertThat(get.response().getHeader("Content-Security-Policy")).as(path).startsWith("default-src 'none'");

            Result head = send("HEAD", path, PUBLIC_PORT);
            assertThat(head.passedOn()).as(path).isFalse();
            assertThat(head.response().getStatus()).as(path).isEqualTo(404);
            assertThat(head.response().getContentType()).as(path).startsWith("text/html");
            assertThat(head.response().getContentAsByteArray()).as(path).isEmpty();
        }
    }

    @Test
    void everythingElseOnThePublicPortStaysAnEmpty404() throws Exception {
        for (String path : new String[] {"/", "/index.html", "/api/auth/status", "/t/" + TOKEN, "/c/" + TOKEN + "/x",
            "/c/" + TOKEN + ".", "/d", "/dx/" + TOKEN}) {
            Result result = send("GET", path, PUBLIC_PORT);
            assertThat(result.passedOn()).as(path).isFalse();
            assertThat(result.response().getStatus()).as(path).isEqualTo(404);
            assertThat(result.response().getContentAsByteArray()).as(path).isEmpty();
            assertThat(result.response().getHeader("Location")).as(path).isNull();
        }
        for (String path : new String[] {"/d/abc", "/d/" + TOKEN + ".", "/d/" + TOKEN}) {
            Result post = send("POST", path, PUBLIC_PORT);
            assertThat(post.passedOn()).as("POST " + path).isFalse();
            assertThat(post.response().getStatus()).as("POST " + path).isEqualTo(404);
            assertThat(post.response().getContentAsByteArray()).as("POST " + path).isEmpty();
        }
    }

    @Test
    void everyPublicResponseCarriesTheRobotsHeader() throws Exception {
        String[][] requests = {
            {"GET", "/t/" + TOKEN + ".gif"}, {"GET", "/c/" + TOKEN}, {"GET", "/d/" + TOKEN}, {"POST", "/d/" + TOKEN + "/beat"},
            {"GET", "/d/" + TOKEN + "."}, {"GET", "/d/abc"}, {"GET", "/"}, {"DELETE", "/t/" + TOKEN + ".gif"}
        };
        for (String[] request : requests) {
            Result result = send(request[0], request[1], PUBLIC_PORT);
            assertThat(result.response().getHeader("X-Robots-Tag")).as(request[0] + " " + request[1])
                    .isEqualTo("noindex, nofollow");
        }
        assertThat(send("GET", "/t/" + TOKEN + ".gif", PUBLIC_PORT).passedOn()).isTrue();
    }

    @Test
    void privatePortIsUnchanged() throws Exception {
        Result api = send("GET", "/api/auth/status", PRIVATE_PORT);
        assertThat(api.passedOn()).isTrue();
        assertThat(api.response().getHeader("X-Robots-Tag")).isNull();

        Result document = send("GET", "/d/abc", PRIVATE_PORT);
        assertThat(document.passedOn()).isFalse();
        assertThat(document.response().getStatus()).isEqualTo(404);
        assertThat(document.response().getContentAsByteArray()).isEmpty();
        assertThat(document.response().getHeader("X-Robots-Tag")).isNull();

        Result trailing = send("GET", "/d/" + TOKEN + ".", PRIVATE_PORT);
        assertThat(trailing.response().getStatus()).isEqualTo(404);
        assertThat(trailing.response().getHeader("Location")).isNull();
    }
}
