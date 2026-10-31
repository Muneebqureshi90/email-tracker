package com.mailpulse.emails;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.IntegrationTest;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

class EmailReplyIT extends IntegrationTest {

    @Test
    void replyTimeIsStoredOnceAndShownInListAndDetail() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Reply check", "thread-reply-1", "hr@example.com");
        JsonNode before = http.get(api("/api/emails/" + email.id()), asOwner()).json();
        assertThat(before.get("summary").get("repliedAt").isNull()).isTrue();

        Instant first = now().plus(Duration.ofMinutes(5));
        clock.advance(Duration.ofMinutes(10));
        assertThat(http.post(api("/api/emails/" + email.id() + "/reply"), Map.of("repliedAt", first.toString()), asExtension())
                        .status())
                .isEqualTo(204);
        // A later report of the same reply keeps the earliest time.
        assertThat(http.post(api("/api/emails/" + email.id() + "/reply"),
                                Map.of("repliedAt", now().toString()), asOwner())
                        .status())
                .isEqualTo(204);

        JsonNode detail = http.get(api("/api/emails/" + email.id()), asOwner()).json();
        assertThat(Instant.parse(detail.get("summary").get("repliedAt").asString())).isEqualTo(first);
        JsonNode list = http.get(api("/api/emails?account=" + email.account()), asOwner()).json();
        assertThat(Instant.parse(list.get("items").get(0).get("repliedAt").asString())).isEqualTo(first);
    }

    @Test
    void futureTimesAreClampedAndTimesBeforeSendingIgnored() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Reply clamp", "thread-reply-2", "hr@example.com");
        Instant sent = now();
        assertThat(http.post(api("/api/emails/" + email.id() + "/reply"),
                                Map.of("repliedAt", sent.minus(Duration.ofHours(1)).toString()), asExtension())
                        .status())
                .isEqualTo(204);
        assertThat(http.get(api("/api/emails/" + email.id()), asOwner()).json().get("summary").get("repliedAt").isNull())
                .isTrue();

        clock.advance(Duration.ofMinutes(3));
        Instant now = now();
        http.post(api("/api/emails/" + email.id() + "/reply"), Map.of("repliedAt", now.plus(Duration.ofDays(2)).toString()),
                asExtension());
        JsonNode detail = http.get(api("/api/emails/" + email.id()), asOwner()).json();
        assertThat(Instant.parse(detail.get("summary").get("repliedAt").asString())).isEqualTo(now);
    }

    @Test
    void unknownEmailIs404AndBadBodiesAre400() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Reply errors", "thread-reply-3", "hr@example.com");
        assertThat(http.post(api("/api/emails/" + UUID.randomUUID() + "/reply"),
                                Map.of("repliedAt", now().toString()), asExtension())
                        .status())
                .isEqualTo(404);
        assertThat(http.post(api("/api/emails/" + email.id() + "/reply"), Map.of(), asExtension()).status())
                .isEqualTo(400);
        assertThat(http.post(api("/api/emails/" + email.id() + "/reply"), Map.of("repliedAt", "yesterday"), asExtension())
                        .status())
                .isEqualTo(400);
    }
}
