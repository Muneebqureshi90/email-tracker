package com.mailpulse.tracking;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.settings.Settings.NotifyOn;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class RepeatOpensTest {

    private static final Instant T = Instant.parse("2026-10-30T06:43:00Z");

    @Test
    void openedAgainNeedsAnHourBetweenTheLastTwoOpens() {
        assertThat(RepeatOpens.openedAgain(List.of())).isFalse();
        assertThat(RepeatOpens.openedAgain(List.of(T))).isFalse();
        assertThat(RepeatOpens.openedAgain(List.of(T.plusSeconds(59 * 60), T))).isFalse();
        assertThat(RepeatOpens.openedAgain(List.of(T.plusSeconds(60 * 60), T))).isTrue();
        assertThat(RepeatOpens.openedAgain(List.of(T.plusSeconds(61 * 60), T.plusSeconds(60 * 60), T))).isFalse();
    }

    @Test
    void notifyOnFirstEveryAndAfterAGap() {
        assertThat(RepeatOpens.notifies(NotifyOn.FIRST, 1, T, null)).isTrue();
        assertThat(RepeatOpens.notifies(NotifyOn.FIRST, 2, T.plusSeconds(7200), T)).isFalse();
        assertThat(RepeatOpens.notifies(NotifyOn.EVERY, 2, T.plusSeconds(60), T)).isTrue();
        assertThat(RepeatOpens.notifies(NotifyOn.EVERY_AFTER_GAP, 1, T, null)).isTrue();
        assertThat(RepeatOpens.notifies(NotifyOn.EVERY_AFTER_GAP, 2, T.plusSeconds(59 * 60), T)).isFalse();
        assertThat(RepeatOpens.notifies(NotifyOn.EVERY_AFTER_GAP, 2, T.plusSeconds(60 * 60), T)).isTrue();
    }
}
