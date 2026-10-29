package com.mailpulse.alerts;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/** Alert rules with fixed instants, as the injectable Clock would give them. */
class AlertRulesTest {

    private static final Instant SENT = Instant.parse("2026-10-29T10:00:00Z");

    @Test
    void followUpIsDueAfterTheWaitingTimeWithoutOpensOrClicks() {
        assertThat(AlertRules.followUpDue(SENT, 48, 0, 0, SENT.plus(Duration.ofHours(47)))).isFalse();
        assertThat(AlertRules.followUpDue(SENT, 48, 0, 0, SENT.plus(Duration.ofHours(48)))).isTrue();
        assertThat(AlertRules.followUpDue(SENT, 24, 0, 0, SENT.plus(Duration.ofHours(30)))).isTrue();
        assertThat(AlertRules.followUpDue(SENT, 48, 1, 0, SENT.plus(Duration.ofHours(50)))).isFalse();
        assertThat(AlertRules.followUpDue(SENT, 48, 0, 1, SENT.plus(Duration.ofHours(50)))).isFalse();
        assertThat(AlertRules.followUpDue(null, 48, 0, 0, SENT.plus(Duration.ofHours(50)))).isFalse();
    }

    @Test
    void followUpIsNotRaisedLongAfterItWasDue() {
        Instant due = SENT.plus(Duration.ofHours(72));
        assertThat(AlertRules.followUpDue(SENT, 72, 0, 0, due.plus(Duration.ofDays(6)))).isTrue();
        assertThat(AlertRules.followUpDue(SENT, 72, 0, 0, due.plus(AlertRules.FOLLOW_UP_LATEST))).isFalse();
    }

    @Test
    void openSpikeNeedsEnoughOpensAndFiresOncePerWindow() {
        assertThat(AlertRules.openSpike(3, 3, false)).isTrue();
        assertThat(AlertRules.openSpike(2, 3, false)).isFalse();
        assertThat(AlertRules.openSpike(5, 3, true)).isFalse();
    }

    @Test
    void revivalNeedsTheFullSilence() {
        assertThat(AlertRules.revival(null, SENT, 7)).isEmpty();
        assertThat(AlertRules.revival(SENT, SENT.plus(Duration.ofDays(7)).minusSeconds(1), 7)).isEmpty();
        assertThat(AlertRules.revival(SENT, SENT.plus(Duration.ofDays(7)), 7)).contains(Duration.ofDays(7));
        assertThat(AlertRules.revival(SENT, SENT.plus(Duration.ofDays(9)), 7).orElseThrow().toDays()).isEqualTo(9);
        assertThat(AlertRules.revival(SENT, SENT.minusSeconds(5), 7)).isEmpty();
    }
}