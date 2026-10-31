package com.mailpulse.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestHttp;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/** Every /api error, including unknown routes and unreadable bodies, is a JSON problem response. */
class ApiErrorFormatIT extends IntegrationTest {

    @Test
    void unknownApiRouteIsAJsonProblem() {
        TestHttp.Response response = http.get(api("/api/nope"), asOwner());

        assertThat(response.status()).isEqualTo(404);
        assertThat(response.header("Content-Type").orElse("")).startsWith("application/problem+json");
        JsonNode body = response.json();
        assertThat(body.path("status").asInt()).isEqualTo(404);
        assertThat(body.path("detail").asString()).isEqualTo("Not found");
    }

    @Test
    void unreadableBodyNamesTheField() {
        TestHttp.Response response = http.post(
                api("/api/self-views"), Map.of("tokens", List.of("abc"), "context", "NOT_A_CONTEXT"), asExtension());

        assertThat(response.status()).isEqualTo(400);
        JsonNode errors = response.json().path("errors");
        assertThat(errors.size()).isEqualTo(1);
        assertThat(errors.get(0).path("field").asString()).isEqualTo("context");
        assertThat(errors.get(0).path("message").asString()).isEqualTo("Invalid value");
    }
}
