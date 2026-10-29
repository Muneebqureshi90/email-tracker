package com.mailpulse.alerts;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

/** When an alert fires (PLAN §4.7). Pure and driven by the instants passed in, so the Clock decides "now". */
final class AlertRules {

    /** A follow-up older than this past its due time is not raised any more (no flood after an outage). */
    static final Duration FOLLOW_UP_LATEST = Duration.ofDays(7);

    private AlertRules() {}

    /** No open and no click within the follow-up time after sending. */
    static boolean followUpDue(Instant sentAt, int followUpHours, int opens, int clicks, Instant now) {
        if (sentAt == null || opens > 0 || clicks > 0) {
            return false;
        }
        Instant due = sentAt.plus(Duration.ofHours(followUpHours));
        return !now.isBefore(due) && now.isBefore(due.plus(FOLLOW_UP_LATEST));
    }

    /** At least `threshold` counted opens within the window, and no spike alert for it yet. */
    static boolean openSpike(int opensInWindow, int threshold, boolean alreadyRaisedInWindow) {
        return opensInWindow >= threshold && !alreadyRaisedInWindow;
    }

    /** The silence before this open, when it lasted at least `revivalDays`. */
    static Optional<Duration> revival(Instant previousOpen, Instant thisOpen, int revivalDays) {
        if (previousOpen == null || thisOpen.isBefore(previousOpen)) {
            return Optional.empty();
        }
        Duration silence = Duration.between(previousOpen, thisOpen);
        return silence.compareTo(Duration.ofDays(revivalDays)) >= 0 ? Optional.of(silence) : Optional.empty();
    }
}
