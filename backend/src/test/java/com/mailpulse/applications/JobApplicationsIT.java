package com.mailpulse.applications;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestHttp;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

class JobApplicationsIT extends IntegrationTest {

    @Test
    void addChangeListAndDeleteAnApplicationLinkedToAnEmail() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Backend role", "t-" + UUID.randomUUID(), "hr@acme.example");
        countOpen(email);

        TestHttp.Response created = http.post(api("/api/applications"),
                Map.of("company", "  Acme  ", "role", "Engineer", "appliedOn", "2026-10-30", "notes", "Referral",
                        "emailId", email.id().toString()),
                asOwner());
        assertThat(created.status()).isEqualTo(201);
        JsonNode view = created.json();
        String id = view.get("id").asString();
        assertThat(view.get("company").asString()).isEqualTo("Acme");
        assertThat(view.get("status").asString()).isEqualTo("APPLIED");
        assertThat(view.get("appliedOn").asString()).isEqualTo("2026-10-30");
        assertThat(view.get("emailSubject").asString()).isEqualTo("Backend role");
        assertThat(view.get("opens").asLong()).isEqualTo(1);
        assertThat(view.get("clicks").asLong()).isZero();

        byte[] stored = jdbc.sql("SELECT company_enc FROM job_application WHERE id = :id").param("id", UUID.fromString(id))
                .query(byte[].class).single();
        assertThat(new String(stored, java.nio.charset.StandardCharsets.ISO_8859_1)).doesNotContain("Acme");

        clock.advance(Duration.ofMinutes(1));
        TestHttp.Response newer = http.post(api("/api/applications"), Map.of("company", "Globex"), asOwner());
        assertThat(newer.status()).isEqualTo(201);
        assertThat(newer.json().get("emailId").isNull()).isTrue();
        assertThat(newer.json().get("role").isNull()).isTrue();
        assertThat(newer.json().get("opens").asLong()).isZero();

        Map<String, Object> patch = new HashMap<>();
        patch.put("status", "INTERVIEW");
        patch.put("emailId", null);
        TestHttp.Response changed = http.patch(api("/api/applications/" + id), patch, asOwner());
        assertThat(changed.status()).isEqualTo(200);
        assertThat(changed.json().get("status").asString()).isEqualTo("INTERVIEW");
        assertThat(changed.json().get("role").asString()).isEqualTo("Engineer");
        assertThat(changed.json().get("emailId").isNull()).isTrue();
        assertThat(changed.json().get("emailSubject").isNull()).isTrue();

        JsonNode list = http.get(api("/api/applications"), asOwner()).json();
        int newerIndex = indexOf(list, newer.json().get("id").asString());
        int olderIndex = indexOf(list, id);
        assertThat(newerIndex).isNotNegative().isLessThan(olderIndex);

        assertThat(http.delete(api("/api/applications/" + id), asOwner()).status()).isEqualTo(204);
        assertThat(http.delete(api("/api/applications/" + id), asOwner()).status()).isEqualTo(404);
        assertThat(http.patch(api("/api/applications/" + id), Map.of("status", "OFFER"), asOwner()).status()).isEqualTo(404);
        assertThat(http.delete(api("/api/applications/" + newer.json().get("id").asString()), asOwner()).status()).isEqualTo(204);
    }

    @Test
    void badInputIsRefused() {
        assertThat(http.post(api("/api/applications"), Map.of("role", "Engineer"), asOwner()).status()).isEqualTo(400);
        assertThat(http.post(api("/api/applications"), Map.of("company", " "), asOwner()).status()).isEqualTo(400);
        assertThat(http.post(api("/api/applications"), Map.of("company", "x".repeat(201)), asOwner()).status()).isEqualTo(400);
        assertThat(http.post(api("/api/applications"), Map.of("company", "A", "notes", "x".repeat(4001)), asOwner()).status())
                .isEqualTo(400);
        assertThat(http.post(api("/api/applications"), Map.of("company", "A", "status", "HIRED"), asOwner()).status())
                .isEqualTo(400);
        assertThat(http.post(api("/api/applications"), Map.of("company", "A", "appliedOn", "30/10/2026"), asOwner()).status())
                .isEqualTo(400);
        assertThat(http.post(api("/api/applications"), Map.of("company", "A", "salary", "1"), asOwner()).status())
                .isEqualTo(400);
        TestHttp.Response unknownEmail = http.post(api("/api/applications"),
                Map.of("company", "A", "emailId", UUID.randomUUID().toString()), asOwner());
        assertThat(unknownEmail.status()).isEqualTo(404);
        assertThat(unknownEmail.json().get("detail").asString()).isEqualTo("Email not found");
        assertThat(http.get(api("/api/applications")).status()).isEqualTo(401);
    }

    @Test
    void atMostOneThousandApplications() {
        long existing = jdbc.sql("SELECT count(*) FROM job_application").query(Long.class).single();
        UUID marker = UUID.randomUUID();
        jdbc.sql("""
                INSERT INTO job_application (id, company_enc, status, email_id, created_at, updated_at)
                SELECT gen_random_uuid(), '\\x00'::bytea, 'APPLIED', :marker, now(), now() FROM generate_series(1, :n)
                """).param("marker", marker).param("n", (int) (JobApplicationService.MAX_APPLICATIONS - existing)).update();
        try {
            TestHttp.Response refused = http.post(api("/api/applications"), Map.of("company", "A"), asOwner());
            assertThat(refused.status()).isEqualTo(400);
            assertThat(refused.json().get("detail").asString()).contains("1000");
        } finally {
            jdbc.sql("DELETE FROM job_application WHERE email_id = :marker").param("marker", marker).update();
        }
    }

    private static int indexOf(JsonNode list, String id) {
        for (int i = 0; i < list.size(); i++) {
            if (list.get(i).get("id").asString().equals(id)) {
                return i;
            }
        }
        return -1;
    }
}
