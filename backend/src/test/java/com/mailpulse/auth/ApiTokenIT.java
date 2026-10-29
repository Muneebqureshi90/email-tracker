package com.mailpulse.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestHttp;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

class ApiTokenIT extends IntegrationTest {

    @Test
    void createListUseAndRevoke() {
        TestHttp.Response created = http.post(api("/api/tokens"), Map.of("name", "laptop chrome"), asOwner());
        assertThat(created.status()).isEqualTo(201);
        String token = created.json().get("token").asString();
        String id = created.json().get("id").asString();
        assertThat(token).startsWith("mp_");
        assertThat(created.json().get("prefix").asString()).isEqualTo(token.substring(0, 10));

        TestHttp.Response list = http.get(api("/api/tokens"), asOwner());
        JsonNode mine = null;
        for (JsonNode row : list.json()) {
            assertThat(row.has("token")).isFalse();
            if (row.get("id").asString().equals(id)) {
                mine = row;
            }
        }
        assertThat(mine).isNotNull();
        assertThat(mine.get("name").asString()).isEqualTo("laptop chrome");

        assertThat(http.get(api("/api/config"), "Authorization", "Bearer " + token).status()).isEqualTo(200);
        assertThat(http.delete(api("/api/tokens/" + id), asOwner()).status()).isEqualTo(204);
        assertThat(http.get(api("/api/config"), "Authorization", "Bearer " + token).status()).isEqualTo(401);
    }

    @Test
    void revokingAnUnknownTokenIs404() {
        assertThat(http.delete(api("/api/tokens/" + UUID.randomUUID()), asOwner()).status()).isEqualTo(404);
    }

    @Test
    void tokenNameIsValidated() {
        TestHttp.Response response = http.post(api("/api/tokens"), Map.of("name", " "), asOwner());
        assertThat(response.status()).isEqualTo(400);
        assertThat(response.json().get("errors").get(0).get("field").asString()).isEqualTo("name");
    }
}
