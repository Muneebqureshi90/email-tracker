package com.mailpulse.documents;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestPdfs;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/** Time per page (GET /api/documents/{id}/pages): the beats' visible time by page, over counted views only. */
class DocumentInsightsIT extends IntegrationTest {

    @Test
    void timePerPageAddsUpTheBeatsOfCountedViewsByPage() {
        String docId = uploadPdf("Insights.pdf", TestPdfs.pdf(3, "Insights")).get("id").asString();
        String token = linkToken(createLink(docId, Map.of("label", "Insights"), asOwner()));
        assertThat(pages(docId).size()).as("no views yet").isZero();

        String[] reader = reader(301);
        UUID view = UUID.randomUUID();
        assertThat(beat(token, view, 0, List.of(1), 3, reader).status()).isEqualTo(204);
        clock.advance(Duration.ofSeconds(5));
        assertThat(beat(token, view, 5_000, List.of(1), 3, reader).status()).isEqualTo(204);
        clock.advance(Duration.ofSeconds(5));
        assertThat(beat(token, view, 5_000, List.of(1, 2), 3, reader).status()).isEqualTo(204);
        clock.advance(Duration.ofSeconds(5));
        assertThat(beat(token, view, 5_000, List.of(1, 2), 3, reader).status()).isEqualTo(204);

        String[] owner = Stream.concat(Arrays.stream(reader(302)), Stream.of("X-MailPulse-Self", "test-self-secret"))
                .toArray(String[]::new);
        UUID ownView = UUID.randomUUID();
        beat(token, ownView, 0, List.of(3), 3, owner);
        clock.advance(Duration.ofSeconds(5));
        beat(token, ownView, 5_000, List.of(3), 3, owner);

        JsonNode pages = pages(docId);
        assertThat(pages.size()).as("the owner's own view adds no page time").isEqualTo(2);
        assertThat(pages.get(0).get("page").asInt()).isEqualTo(1);
        assertThat(pages.get(0).get("seconds").asLong()).isEqualTo(5);
        assertThat(pages.get(0).get("readers").asLong()).isEqualTo(1);
        assertThat(pages.get(1).get("page").asInt()).isEqualTo(2);
        assertThat(pages.get(1).get("seconds").asLong()).isEqualTo(10);
        assertThat(pages.get(1).get("readers").asLong()).isEqualTo(1);

        assertThat(http.get(api("/api/documents/" + UUID.randomUUID() + "/pages"), asOwner()).status()).isEqualTo(404);
    }

    @Test
    void aLinkWithMaxViewsGoesAwayAfterThatManyCountedViews() {
        String docId = uploadPdf("Limited.pdf", TestPdfs.pdf(1, "Limited")).get("id").asString();
        String links = "/api/documents/" + docId + "/links";
        assertThat(http.post(api(links), Map.of("maxViews", 0), asOwner()).status()).isEqualTo(400);
        assertThat(http.post(api(links), Map.of("maxViews", 1001), asOwner()).status()).isEqualTo(400);
        assertThat(http.post(api(links), Map.of("expiresAt", clock.instant().plus(Duration.ofDays(400)).toString()), asOwner())
                .status()).as("at most one year ahead").isEqualTo(400);
        JsonNode open = createLink(docId, Map.of("label", "Open"), asOwner());
        assertThat(open.path("maxViews").isNull() || open.path("maxViews").isMissingNode()).isTrue();

        JsonNode once = createLink(docId, Map.of("label", "Once", "maxViews", 1), asOwner());
        assertThat(once.get("maxViews").asInt()).isEqualTo(1);
        String token = linkToken(once);

        String[] owner = Stream.concat(Arrays.stream(reader(312)), Stream.of("X-MailPulse-Self", "test-self-secret"))
                .toArray(String[]::new);
        assertThat(beat(token, UUID.randomUUID(), 0, List.of(1), 1, owner).status()).isEqualTo(204);
        assertThat(http.get(pub("/d/" + token), reader(311)).status()).as("the owner's view does not count").isEqualTo(200);

        String[] reader = reader(311);
        UUID view = UUID.randomUUID();
        assertThat(beat(token, view, 0, List.of(1), 1, reader).status()).isEqualTo(204);
        clock.advance(Duration.ofSeconds(5));
        assertThat(beat(token, view, 5_000, List.of(1), 1, reader).status()).as("the counted view goes on").isEqualTo(204);

        assertThat(http.get(pub("/d/" + token), reader(313)).status()).isEqualTo(410);
        assertThat(http.get(pub("/d/" + token + "/info"), reader(313)).status()).isEqualTo(410);
        assertThat(beat(token, UUID.randomUUID(), 0, List.of(1), 1, reader(313)).status()).isEqualTo(410);
    }

    private JsonNode pages(String documentId) {
        return http.get(api("/api/documents/" + documentId + "/pages"), asOwner()).json();
    }
}
