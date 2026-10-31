package com.mailpulse.emails;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.mailpulse.support.IntegrationTest;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

class EmailDeliveredIT extends IntegrationTest {

    @Test
    void ignoredRecipientSideEventMarksDeliveredWithoutCountingAnOpen() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Delivered check", "thread-delivered-" + System.nanoTime(), "hr@example.com");
        assertThat(summary(email).get("deliveredAt").isNull()).isTrue();
        assertThat(listItem(email).get("deliveredAt").isNull()).isTrue();

        clock.advance(Duration.ofSeconds(20));
        http.send("HEAD", pub("/t/" + email.token() + ".gif"), null, "User-Agent", GMAIL_PROXY_UA);
        await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == 1);
        clock.advance(Duration.ofSeconds(31));
        finalizer.runOnce();

        JsonNode summary = summary(email);
        assertThat(summary.get("openCount").asInt()).isZero();
        assertThat(summary.get("deliveredAt").isNull()).isFalse();
        assertThat(listItem(email).get("deliveredAt").asString()).isEqualTo(summary.get("deliveredAt").asString());

        countOpen(email);
        JsonNode opened = summary(email);
        assertThat(opened.get("openCount").asInt()).isEqualTo(1);
        assertThat(opened.get("deliveredAt").asString()).isEqualTo(summary.get("deliveredAt").asString());
    }

    @Test
    void countedOpenMarksDeliveredNoLaterThanTheFirstOpen() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Delivered open", "thread-delivered-" + System.nanoTime(), "hr@example.com");
        countOpen(email);
        JsonNode summary = summary(email);
        assertThat(summary.get("openCount").asInt()).isEqualTo(1);
        Instant delivered = Instant.parse(summary.get("deliveredAt").asString());
        assertThat(delivered).isBeforeOrEqualTo(Instant.parse(summary.get("firstOpenedAt").asString()));
    }

    private JsonNode summary(TrackedEmail email) {
        return http.get(api("/api/emails/" + email.id()), asOwner()).json().get("summary");
    }

    private JsonNode listItem(TrackedEmail email) {
        return http.get(api("/api/emails?account=" + email.account()), asOwner()).json().get("items").get(0);
    }
}
