package com.mailpulse.emails;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestHttp;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/** v2 lists: the 25/50/100 page rule, sorting, filter counts, paged events, the hover card, the bell and quick search. */
class ListsAndCardIT extends IntegrationTest {

    @Test
    void everyPagedEndpointAcceptsOnlySizes25To100() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Paging", "pg" + System.nanoTime(), "paging@example.com");
        List<String> paths = List.of(
                "/api/emails",
                "/api/contacts",
                "/api/alerts",
                "/api/emails/" + email.id() + "/events",
                "/api/contacts/paging@example.com/emails");
        for (String path : paths) {
            for (int size : new int[] {25, 50, 100}) {
                assertThat(http.get(api(path + "?size=" + size), asOwner()).status()).as(path + " size " + size).isEqualTo(200);
            }
            for (String bad : new String[] {"size=1", "size=10", "size=101", "size=500", "page=-1"}) {
                assertThat(http.get(api(path + "?" + bad), asOwner()).status()).as(path + " " + bad).isEqualTo(400);
            }
            JsonNode body = http.get(api(path), asOwner()).json();
            assertThat(body.get("size").asInt()).as(path + " default size").isEqualTo(25);
            assertThat(body.get("page").asInt()).isZero();
        }
    }

    @Test
    void emailListSortsAndCountsForTheFilterLabels() {
        String account = uniqueAccount();
        TrackedEmail twice = sentEmail(account, "Opened twice", "so" + System.nanoTime(), "a@example.com");
        clock.advance(Duration.ofMinutes(1));
        TrackedEmail once = sentEmail(account, "Opened once", "so" + System.nanoTime(), "b@example.com");
        clock.advance(Duration.ofMinutes(1));
        TrackedEmail never = sentEmail(account, "Never opened", "so" + System.nanoTime(), "c@example.com");
        countOpen(twice);
        clock.advance(Duration.ofMinutes(5));
        countOpen(twice);
        countOpen(once);

        assertThat(ids("/api/emails?account=" + account)).containsExactly(never.id(), once.id(), twice.id());
        assertThat(ids("/api/emails?account=" + account + "&sort=sent&dir=asc")).containsExactly(twice.id(), once.id(), never.id());
        assertThat(ids("/api/emails?account=" + account + "&sort=opens")).containsExactly(twice.id(), once.id(), never.id());
        assertThat(ids("/api/emails?account=" + account + "&sort=opens&dir=asc")).containsExactly(never.id(), once.id(), twice.id());
        assertThat(ids("/api/emails?account=" + account + "&sort=lastOpened").getFirst()).isEqualTo(once.id());
        assertThat(ids("/api/emails?account=" + account + "&sort=lastOpened").getLast()).isEqualTo(never.id());
        assertThat(ids("/api/emails?account=" + account + "&sort=clicks&q=opened")).hasSize(3);
        assertThat(ids("/api/emails?account=" + account + "&sort=opens&q=opened&dir=asc"))
                .containsExactly(never.id(), once.id(), twice.id());
        assertThat(http.get(api("/api/emails?sort=subject"), asOwner()).status()).isEqualTo(400);
        assertThat(http.get(api("/api/emails?dir=up"), asOwner()).status()).isEqualTo(400);

        JsonNode counts = http.get(api("/api/emails/counts?account=" + account), asOwner()).json();
        assertThat(counts.get("all").asLong()).isEqualTo(3);
        assertThat(counts.get("opened").asLong()).isEqualTo(2);
        assertThat(counts.get("notOpened").asLong()).isEqualTo(1);
        assertThat(counts.get("clicked").asLong()).isZero();
        JsonNode searched = http.get(api("/api/emails/counts?account=" + account + "&q=twice"), asOwner()).json();
        assertThat(searched.get("all").asLong()).isEqualTo(1);
        assertThat(searched.get("opened").asLong()).isEqualTo(1);
        JsonNode unknown = http.get(api("/api/emails/counts?account=" + uniqueAccount()), asOwner()).json();
        assertThat(unknown.get("all").asLong()).isZero();
        assertThat(http.get(api("/api/emails/counts"), asExtension()).status()).isEqualTo(403);
    }

    @Test
    void emailEventsArePagedNewestFirst() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Events", "ev" + System.nanoTime(), "events@example.com");
        countOpen(email);
        clock.advance(Duration.ofMinutes(3));
        countOpen(email);
        fetchPixel(email.token(), GMAIL_PROXY_UA, "X-MailPulse-Self", "test-self-secret");
        org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == 3);

        JsonNode page = http.get(api("/api/emails/" + email.id() + "/events?size=25"), asOwner()).json();
        assertThat(page.get("total").asLong()).isEqualTo(3);
        assertThat(page.get("items")).hasSize(3);
        assertThat(page.get("items").get(0).get("reason").asString()).isEqualTo("SELF");
        assertThat(page.get("items").get(0).get("receivedAt").asString())
                .isGreaterThanOrEqualTo(page.get("items").get(2).get("receivedAt").asString());
        assertThat(http.get(api("/api/emails/" + email.id() + "/events?page=1"), asOwner()).json().get("items")).isEmpty();
        assertThat(http.get(api("/api/emails/" + UUID.randomUUID() + "/events"), asOwner()).status()).isEqualTo(404);
        assertThat(http.get(api("/api/emails/" + email.id() + "/events"), asExtension()).status()).isEqualTo(403);
    }

    @Test
    void contactsSortAndPageTheirEmails() {
        String domain = "@sort-" + UUID.randomUUID().toString().substring(0, 8) + ".example.com";
        String busy = "busy" + domain;
        String keen = "keen" + domain;
        String account = uniqueAccount();
        sentEmail(account, "To busy 1", "cs" + System.nanoTime(), busy);
        clock.advance(Duration.ofMinutes(1));
        sentEmail(account, "To busy 2", "cs" + System.nanoTime(), busy);
        clock.advance(Duration.ofMinutes(1));
        TrackedEmail toKeen = sentEmail(account, "To keen", "cs" + System.nanoTime(), keen);
        countOpen(toKeen);

        assertThat(emails("/api/contacts?q=" + domain + "&sort=emails")).containsExactly(busy, keen);
        assertThat(emails("/api/contacts?q=" + domain + "&sort=emails&dir=asc")).containsExactly(keen, busy);
        assertThat(emails("/api/contacts?q=" + domain + "&sort=openRate")).containsExactly(keen, busy);
        assertThat(emails("/api/contacts?q=" + domain + "&sort=opens")).containsExactly(keen, busy);
        assertThat(emails("/api/contacts?q=" + domain)).containsExactly(keen, busy);
        assertThat(http.get(api("/api/contacts?sort=name"), asOwner()).status()).isEqualTo(400);

        JsonNode page = http.get(api("/api/contacts/" + busy + "/emails?size=25&sort=sent&dir=asc"), asOwner()).json();
        assertThat(page.get("total").asLong()).isEqualTo(2);
        assertThat(page.get("items").get(0).get("subject").asString()).isEqualTo("To busy 1");
        assertThat(http.get(api("/api/contacts/" + keen + "/emails?sort=opens"), asOwner()).json().get("items").get(0)
                .get("openCount").asInt()).isEqualTo(1);
        assertThat(http.get(api("/api/contacts/nobody" + domain + "/emails"), asOwner()).status()).isEqualTo(404);
        assertThat(http.get(api("/api/contacts/" + busy + "/emails?sort=bogus"), asOwner()).status()).isEqualTo(400);
    }

    @Test
    void hoverCardShowsOpensClicksAndAlertsForTheExtension() {
        String thread = "card" + System.nanoTime();
        TrackedEmail email = sentEmail(uniqueAccount(), "Card subject", thread, "card@example.com");
        countOpen(email);
        clock.advance(Duration.ofMinutes(2));
        countOpen(email);
        clock.advance(Duration.ofMinutes(2));
        countOpen(email); // three opens within the spike window raise an OPEN_SPIKE alert

        for (String[] auth : List.of(asExtension(), asOwner())) {
            TestHttp.Response response = http.get(api("/api/emails/" + email.id() + "/card"), auth);
            assertThat(response.status()).isEqualTo(200);
            JsonNode card = response.json();
            assertThat(card.get("emailId").asString()).isEqualTo(email.id().toString());
            assertThat(card.get("subject").asString()).isEqualTo("Card subject");
            assertThat(card.get("recipients").get(0).get("email").asString()).isEqualTo("card@example.com");
            assertThat(card.get("account").asString()).isEqualTo(email.account());
            assertThat(card.get("gmailThreadId").asString()).isEqualTo(thread);
            assertThat(card.get("openCount").asInt()).isEqualTo(3);
            assertThat(card.get("recentOpens")).hasSize(3);
            assertThat(card.get("firstOpenedAt").asString()).isLessThan(card.get("lastOpenedAt").asString());
            assertThat(card.get("clickCount").asInt()).isZero();
            assertThat(card.get("alerts").get(0).get("type").asString()).isEqualTo("OPEN_SPIKE");
            assertThat(card.get("alerts").get(0).get("text").asString()).startsWith("Opened 3 times");
            assertThat(card.get("documents").isArray()).isTrue();
        }
        assertThat(http.get(api("/api/emails/" + UUID.randomUUID() + "/card"), asExtension()).status()).isEqualTo(404);
        assertThat(http.get(api("/api/emails/" + email.id() + "/card")).status()).isEqualTo(401);
    }

    @Test
    void notificationCenterCountsUnreadAndRemembersWhatWasRead() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Bell", "bell" + System.nanoTime(), "bell@example.com");
        countOpen(email);
        clock.advance(Duration.ofMinutes(2));
        countOpen(email);

        JsonNode bell = http.get(api("/api/notifications?limit=2"), asOwner()).json();
        assertThat(bell.get("items")).hasSize(2);
        long newest = bell.get("items").get(0).get("id").asLong();
        assertThat(newest).isGreaterThan(bell.get("items").get(1).get("id").asLong());
        assertThat(bell.get("unread").asLong()).isGreaterThanOrEqualTo(2);

        assertThat(http.post(api("/api/notifications/read"), Map.of("upToId", newest - 1), asOwner()).status()).isEqualTo(204);
        JsonNode partly = http.get(api("/api/notifications"), asOwner()).json();
        assertThat(partly.get("unread").asLong()).isEqualTo(1);
        assertThat(partly.get("lastReadId").asLong()).isEqualTo(newest - 1);

        assertThat(http.post(api("/api/notifications/read"), Map.of("upToId", Long.MAX_VALUE), asOwner()).status()).isEqualTo(204);
        JsonNode read = http.get(api("/api/notifications"), asOwner()).json();
        assertThat(read.get("unread").asLong()).isZero();
        assertThat(read.get("lastReadId").asLong()).as("never past the newest item").isEqualTo(newest);
        http.post(api("/api/notifications/read"), Map.of("upToId", 1), asOwner());
        assertThat(http.get(api("/api/notifications"), asOwner()).json().get("lastReadId").asLong()).as("never backwards")
                .isEqualTo(newest);

        assertThat(http.post(api("/api/notifications/read"), Map.of("upToId", -1), asOwner()).status()).isEqualTo(400);
        assertThat(http.post(api("/api/notifications/read"), Map.of(), asOwner()).status()).isEqualTo(400);
        assertThat(http.get(api("/api/notifications"), asExtension()).status()).isEqualTo(403);
    }

    @Test
    void quickSearchFindsEmailsAndContacts() {
        String word = "kiwi" + UUID.randomUUID().toString().substring(0, 8);
        String person = word + "@example.com";
        sentEmail(uniqueAccount(), "About the " + word + " plan", "qs" + System.nanoTime(), person);

        JsonNode found = http.get(api("/api/search?q=" + word.toUpperCase()), asOwner()).json();
        assertThat(found.get("emails")).hasSize(1);
        assertThat(found.get("contacts").get(0).get("email").asString()).isEqualTo(person);
        assertThat(found.get("documents").isArray()).isTrue();
        assertThat(http.get(api("/api/search?q=example"), asOwner()).json().get("emails").size()).isLessThanOrEqualTo(5);
        assertThat(http.get(api("/api/search?q=k"), asOwner()).status()).isEqualTo(400);
        assertThat(http.get(api("/api/search?q=%20%20k%20"), asOwner()).status()).isEqualTo(400);
        assertThat(http.get(api("/api/search"), asOwner()).status()).isEqualTo(400);
        assertThat(http.get(api("/api/search?q=" + word), asExtension()).status()).isEqualTo(403);
    }

    private List<UUID> ids(String path) {
        List<UUID> ids = new ArrayList<>();
        http.get(api(path), asOwner()).json().get("items").forEach(item -> ids.add(UUID.fromString(item.get("id").asString())));
        return ids;
    }

    private List<String> emails(String path) {
        List<String> emails = new ArrayList<>();
        http.get(api(path), asOwner()).json().get("items").forEach(item -> emails.add(item.get("email").asString()));
        return emails;
    }
}
