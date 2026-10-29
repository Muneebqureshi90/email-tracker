package com.mailpulse.reports;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.mailpulse.support.IntegrationTest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

class ContactsAndReportsIT extends IntegrationTest {

    @Test
    void contactsAddUpEmailsOpensAndListTheirEmails() {
        String person = "contact-" + UUID.randomUUID() + "@example.com";
        String account = uniqueAccount();
        TrackedEmail first = sentEmail(account, "Hello one", "c" + System.nanoTime(), person);
        sentEmail(account, "Hello two", "c" + System.nanoTime(), person, "someone.else@example.com");
        countOpen(first);

        JsonNode list = http.get(api("/api/contacts?q=" + person.toUpperCase()), asOwner()).json();
        assertThat(list.get("total").asLong()).isEqualTo(1);
        JsonNode contact = list.get("items").get(0);
        assertThat(contact.get("email").asString()).isEqualTo(person);
        assertThat(contact.get("emails").asInt()).isEqualTo(2);
        assertThat(contact.get("openedEmails").asInt()).isEqualTo(1);
        assertThat(contact.get("opens").asInt()).isEqualTo(1);

        JsonNode detail = http.get(api("/api/contacts/" + person), asOwner()).json();
        assertThat(detail.get("emails")).hasSize(2);
        assertThat(detail.get("summary").get("lastOpenedAt").isNull()).isFalse();
        assertThat(http.get(api("/api/contacts/nobody-" + UUID.randomUUID() + "@example.com"), asOwner()).status()).isEqualTo(404);
        assertThat(http.get(api("/api/contacts"), asExtension()).status()).isEqualTo(403);
        assertThat(http.get(api("/api/accounts"), asOwner()).json().toString()).contains(account);
    }

    @Test
    void reportsCountSendsOpensClicksPerHourAndDay() {
        // A fixed past day keeps other tests' data out of the numbers. Sessions are created first,
        // because tokens issued while the clock is moved would be expired afterwards.
        ownerCookie();
        extensionToken();
        String person = "report-" + UUID.randomUUID() + "@example.com";
        TrackedEmail opened = sendAndOpenAt(Instant.parse("2025-03-12T10:15:00Z"), person);
        sendAndOpenAt(Instant.parse("2025-03-12T22:40:00Z"), person);

        JsonNode day = http.get(api("/api/reports/daily?date=2025-03-12"), asOwner()).json();
        assertThat(day.get("period").asString()).isEqualTo("DAY");
        assertThat(day.get("timeZone").asString()).isEqualTo("UTC");
        assertThat(day.get("sent").asInt()).isEqualTo(2);
        assertThat(day.get("openedEmails").asInt()).isEqualTo(2);
        assertThat(day.get("openRate").asDouble()).isEqualTo(1.0);
        assertThat(day.get("opens").asInt()).isEqualTo(2);
        assertThat(day.get("buckets")).hasSize(24);
        assertThat(day.get("buckets").get(10).get("opens").asInt()).isEqualTo(1);
        assertThat(day.get("buckets").get(22).get("opens").asInt()).isEqualTo(1);
        List<String> top = new ArrayList<>();
        day.get("topEmails").forEach(email -> top.add(email.get("id").asString()));
        assertThat(top).contains(opened.id().toString());
        assertThat(day.get("topContacts").get(0).get("email").asString()).isEqualTo(person);
        assertThat(day.get("topContacts").get(0).get("opens").asInt()).isEqualTo(2);

        JsonNode week = http.get(api("/api/reports/weekly?weekStart=2025-03-10"), asOwner()).json();
        assertThat(week.get("buckets")).hasSize(7);
        assertThat(week.get("buckets").get(2).get("label").asString()).isEqualTo("2025-03-12");
        assertThat(week.get("buckets").get(2).get("opens").asInt()).isEqualTo(2);
        assertThat(week.get("sent").asInt()).isEqualTo(2);

        assertThat(http.get(api("/api/reports/daily?date=2025-03-11"), asOwner()).json().get("sent").asInt()).isZero();
        assertThat(http.get(api("/api/reports/daily"), asOwner()).status()).isEqualTo(200);
        assertThat(http.get(api("/api/reports/daily?date=yesterday"), asOwner()).status()).isEqualTo(400);
    }

    private TrackedEmail sendAndOpenAt(Instant sentAt, String person) {
        Instant original = clock.instant();
        clock.set(sentAt);
        try {
            TrackedEmail email = sentEmail(uniqueAccount(), "Report " + UUID.randomUUID(), "r" + System.nanoTime(), person);
            clock.advance(Duration.ofSeconds(20));
            long before = eventCount(email.id());
            assertThat(fetchPixel(email.token(), GMAIL_PROXY_UA).status()).isEqualTo(200);
            await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == before + 1);
            return email;
        } finally {
            clock.set(original);
            finalizer.runOnce();
        }
    }
}
