package com.mailpulse.emails;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestHttp;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/** Registration while composing, link registration, send updates, lookups, list, detail and marks. */
class EmailFlowIT extends IntegrationTest {

    @Test
    void registrationIsIdempotentPerClientRef() {
        Map<String, Object> body = Map.of("account", uniqueAccount(), "clientRef", UUID.randomUUID().toString());
        TestHttp.Response first = http.post(api("/api/emails"), body, asExtension());
        TestHttp.Response second = http.post(api("/api/emails"), body, asExtension());

        assertThat(first.status()).isEqualTo(201);
        assertThat(second.status()).isEqualTo(200);
        assertThat(second.json().get("id").asString()).isEqualTo(first.json().get("id").asString());
        assertThat(second.json().get("pixelUrl").asString()).isEqualTo(first.json().get("pixelUrl").asString())
                .matches("https://track\\.test/t/[A-Za-z0-9_-]{24}\\.gif");
        assertThat(first.json().get("trackOpens").asBoolean()).isTrue();
        assertThat(first.json().get("trackLinks").asBoolean()).as("link tracking is off by default (D-029)").isFalse();
    }

    @Test
    void invalidRequestsAreProblemsWithFieldErrors() {
        TestHttp.Response response = http.post(api("/api/emails"), Map.of("account", "not-an-email"), asExtension());
        assertThat(response.status()).isEqualTo(400);
        assertThat(response.header("Content-Type").orElseThrow()).startsWith("application/problem+json");
        List<String> fields = new ArrayList<>();
        response.json().get("errors").forEach(error -> fields.add(error.get("field").asString()));
        assertThat(fields).contains("account", "clientRef");

        assertThat(http.patch(api("/api/emails/" + UUID.randomUUID()), Map.of("status", "SENT"), asExtension()).status())
                .isEqualTo(404);
        assertThat(http.post(api("/api/emails"), "{not json", asExtension()).status()).isEqualTo(400);
    }

    @Test
    void linksAreValidatedDeduplicatedAndStable() {
        TrackedEmail email = registerEmail(uniqueAccount());
        List<String> urls = List.of("https://ok.example/a", "javascript:alert(1)", "mailto:x@y.example",
                "https://user:pw@ok.example/", "https://ok.example/a");
        JsonNode first = http.post(api("/api/emails/" + email.id() + "/links"), Map.of("urls", urls), asExtension()).json();
        assertThat(first.get("links")).hasSize(1);
        assertThat(first.get("rejected")).hasSize(3);
        String trackedUrl = first.get("links").get(0).get("trackedUrl").asString();
        assertThat(trackedUrl).matches("https://track\\.test/c/[A-Za-z0-9_-]{24}");

        JsonNode again = http.post(api("/api/emails/" + email.id() + "/links"),
                Map.of("urls", List.of("https://ok.example/a")), asExtension()).json();
        assertThat(again.get("links").get(0).get("trackedUrl").asString()).isEqualTo(trackedUrl);
    }

    @Test
    void sentUpdateIsStoredEncryptedAndReadableByTheOwner() {
        String account = uniqueAccount();
        String subject = "Quarterly plan 🚀 " + UUID.randomUUID();
        TrackedEmail email = sentEmail(account, subject, "thread" + System.nanoTime(), "Jane.Doe@Example.com");

        JsonNode detail = http.get(api("/api/emails/" + email.id()), asOwner()).json();
        assertThat(detail.get("summary").get("subject").asString()).isEqualTo(subject);
        assertThat(detail.get("summary").get("status").asString()).isEqualTo("SENT");
        assertThat(detail.get("summary").get("account").asString()).isEqualTo(account);
        assertThat(detail.get("summary").get("recipients").get(0).get("email").asString()).isEqualTo("jane.doe@example.com");
        assertThat(detail.get("gmailThreadId").asString()).startsWith("thread");

        byte[] storedSubject = jdbc.sql("SELECT subject_enc FROM tracked_email WHERE id = :id").param("id", email.id())
                .query(byte[].class).single();
        assertThat(new String(storedSubject, StandardCharsets.ISO_8859_1)).doesNotContain("Quarterly");
        long plainAddresses = jdbc.sql("SELECT count(*) FROM contact WHERE position(convert_to('example.com', 'UTF8') in address_enc) > 0")
                .query(Long.class).single();
        assertThat(plainAddresses).isZero();
    }

    @Test
    void lookupByPixelTokenAndPreferences() {
        TrackedEmail email = registerEmail(uniqueAccount());
        JsonNode lookup = http.get(api("/api/emails/by-token/" + email.token()), asExtension()).json();
        assertThat(lookup.get("id").asString()).isEqualTo(email.id().toString());
        assertThat(lookup.get("status").asString()).isEqualTo("DRAFT");
        assertThat(http.get(api("/api/emails/by-token/not-a-token"), asExtension()).status()).isEqualTo(404);

        assertThat(http.patch(api("/api/emails/" + email.id() + "/preferences"),
                Map.of("notifications", false, "followUpHours", 72), asExtension()).status()).isEqualTo(204);
        JsonNode detail = http.get(api("/api/emails/" + email.id()), asOwner()).json();
        assertThat(detail.get("notifications").asBoolean()).isFalse();
        assertThat(detail.get("followUpHours").asInt()).isEqualTo(72);
        assertThat(http.patch(api("/api/emails/" + email.id() + "/preferences"), Map.of("followUpHours", 36), asExtension())
                .status()).isEqualTo(400);
    }

    @Test
    void marksShowTheLatestTrackedEmailPerThread() {
        String account = uniqueAccount();
        String thread = "t" + System.nanoTime();
        sentEmail(account, "first", thread, "a@gmail.com");
        clock.advance(java.time.Duration.ofMinutes(1));
        TrackedEmail latest = sentEmail(account, "follow-up", thread, "a@gmail.com");
        TrackedEmail blocked = sentEmail(account, "to outlook", thread + "x", "b@outlook.com");

        JsonNode marks = http.get(api("/api/marks?account=" + account + "&threadIds=" + thread + "," + thread + "x,unknown"),
                asExtension()).json().get("marks");
        assertThat(marks.get(thread).get("emailId").asString()).isEqualTo(latest.id().toString());
        assertThat(marks.get(thread).get("state").asString()).isEqualTo("SENT");
        assertThat(marks.get(thread + "x").get("emailId").asString()).isEqualTo(blocked.id().toString());
        assertThat(marks.get(thread + "x").get("openStatusUnreliable").asBoolean()).isTrue();
        assertThat(marks.has("unknown")).isFalse();

        JsonNode byMessage = http.get(api("/api/marks?account=" + account + "&messageIds=m" + thread), asExtension()).json();
        assertThat(byMessage.get("marks").get("m" + thread)).isNotNull();
        assertThat(http.get(api("/api/marks?account=someone-else@gmail.com&threadIds=" + thread), asExtension()).json()
                .get("marks").size()).isZero();
        assertThat(http.get(api("/api/marks?account=" + account + "&threadIds=bad%20id"), asExtension()).status()).isEqualTo(400);
    }

    @Test
    void listFiltersByStateAccountAndText() {
        String account = uniqueAccount();
        String word = "zebra" + UUID.randomUUID().toString().substring(0, 8);
        TrackedEmail match = sentEmail(account, "About the " + word + " project", "l" + System.nanoTime(), "x@gmail.com");
        sentEmail(account, "Something else", "l" + System.nanoTime(), "y@gmail.com");
        registerEmail(account); // drafts are not listed

        JsonNode all = http.get(api("/api/emails?account=" + account), asOwner()).json();
        assertThat(all.get("total").asLong()).isEqualTo(2);
        JsonNode search = http.get(api("/api/emails?q=" + word.toUpperCase()), asOwner()).json();
        assertThat(search.get("total").asLong()).isEqualTo(1);
        assertThat(search.get("items").get(0).get("id").asString()).isEqualTo(match.id().toString());
        JsonNode byRecipient = http.get(api("/api/emails?account=" + account + "&q=y@gmail"), asOwner()).json();
        assertThat(byRecipient.get("total").asLong()).isEqualTo(1);
        JsonNode notOpened = http.get(api("/api/emails?account=" + account + "&state=not_opened&size=25"), asOwner()).json();
        assertThat(notOpened.get("total").asLong()).isEqualTo(2);
        assertThat(notOpened.get("items")).hasSize(2);
        assertThat(http.get(api("/api/emails?account=" + account + "&page=1"), asOwner()).json().get("items")).isEmpty();
        assertThat(http.get(api("/api/emails?size=1"), asOwner()).status()).as("sizes are 25, 50 or 100").isEqualTo(400);
        assertThat(http.get(api("/api/emails?state=bogus"), asOwner()).status()).isEqualTo(400);
        assertThat(http.get(api("/api/emails?size=500"), asOwner()).status()).isEqualTo(400);
    }
}
