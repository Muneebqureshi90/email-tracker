package com.mailpulse.alerts;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.IntegrationTest;
import java.time.Duration;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

/**
 * Follow-up rules that look at replies: no follow-up for an answered email, and one NO_REPLY suggestion for an email
 * opened several times without a reply. Uses the alerts context because it moves the clock by days.
 */
@TestPropertySource(properties = "test.context=alerts")
class FollowUpRulesIT extends IntegrationTest {

    /** Longer than the largest allowed de-duplication window (600 s), so every open is counted. */
    private static final Duration BEYOND_DEDUPE = Duration.ofMinutes(11);

    @Autowired
    AlertService alerts;

    @Test
    void followUpIsNotRaisedForAnEmailThatGotAReply() {
        TrackedEmail answered = sentEmail(uniqueAccount(), "Answered already", "ra" + System.nanoTime(), "a@example.com");
        TrackedEmail waiting = sentEmail(uniqueAccount(), "Still waiting", "rb" + System.nanoTime(), "b@example.com");
        markReplied(answered.id());

        clock.advance(Duration.ofHours(49));
        alerts.runScheduled();

        assertThat(alertTypes(answered.id())).isEmpty();
        assertThat(alertTypes(waiting.id())).containsExactly("FOLLOW_UP");
    }

    @Test
    void oftenOpenedEmailWithoutAReplyGetsOneSuggestionAfterTwoDays() {
        TrackedEmail hot = sentEmail(uniqueAccount(), "Backend role", "na" + System.nanoTime(), "c@example.com");
        TrackedEmail answered = sentEmail(uniqueAccount(), "Data role", "nb" + System.nanoTime(), "d@example.com");
        TrackedEmail twice = sentEmail(uniqueAccount(), "Frontend role", "nc" + System.nanoTime(), "e@example.com");
        for (int i = 0; i < 3; i++) {
            clock.advance(BEYOND_DEDUPE);
            countOpen(hot);
            countOpen(answered);
        }
        countOpen(twice);
        clock.advance(BEYOND_DEDUPE);
        countOpen(twice);
        markReplied(answered.id());

        alerts.runScheduled();
        assertThat(alertTypes(hot.id())).doesNotContain("NO_REPLY");

        clock.advance(Duration.ofDays(2));
        alerts.runScheduled();
        clock.advance(Duration.ofHours(1));
        alerts.runScheduled();

        assertThat(alertTypes(hot.id())).containsOnlyOnce("NO_REPLY").doesNotContain("FOLLOW_UP");
        assertThat(noReplyText(hot.id())).isEqualTo("Opened 3 times, no reply yet: a good time to follow up");
        assertThat(alertTypes(answered.id())).doesNotContain("NO_REPLY");
        assertThat(alertTypes(twice.id())).doesNotContain("NO_REPLY");
    }

    private void markReplied(UUID emailId) {
        jdbc.sql("UPDATE tracked_email SET replied_at = :at WHERE id = :id")
                .param("at", now().atOffset(ZoneOffset.UTC))
                .param("id", emailId)
                .update();
    }

    private List<String> alertTypes(UUID emailId) {
        return jdbc.sql("SELECT type FROM alert WHERE tracked_email_id = :id ORDER BY created_at").param("id", emailId)
                .query(String.class)
                .list();
    }

    private String noReplyText(UUID emailId) {
        return jdbc.sql("SELECT details ->> 'text' FROM alert WHERE tracked_email_id = :id AND type = 'NO_REPLY'")
                .param("id", emailId)
                .query(String.class)
                .single();
    }
}
