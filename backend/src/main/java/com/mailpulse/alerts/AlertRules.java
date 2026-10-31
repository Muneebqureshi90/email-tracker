package com.mailpulse.alerts;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

/** When an alert fires (PLAN §4.7). Pure and driven by the instants passed in, so the Clock decides "now". */
final class AlertRules {

    /** A follow-up older than this past its due time is not raised any more (no flood after an outage). */
    static final Duration FOLLOW_UP_LATEST = Duration.ofDays(7);
    /** Counted views of one document link that raise DOC_VIEWS (once per link). */
    static final int DOC_VIEWS = 3;
    /** Counted opens that make an unanswered email worth a follow-up (NO_REPLY, once per email). */
    static final int NO_REPLY_OPENS = 3;
    /** Time after sending before NO_REPLY may fire. */
    static final Duration NO_REPLY_AFTER = Duration.ofDays(2);

    private AlertRules() {}

    /** No open and no click within the follow-up time after sending. */
    static boolean followUpDue(Instant sentAt, int followUpHours, int opens, int clicks, Instant now) {
        if (sentAt == null || opens > 0 || clicks > 0) {
            return false;
        }
        Instant due = sentAt.plus(Duration.ofHours(followUpHours));
        return !now.isBefore(due) && now.isBefore(due.plus(FOLLOW_UP_LATEST));
    }

    /** Opened at least NO_REPLY_OPENS times, no reply, and NO_REPLY_AFTER has passed since sending (at most FOLLOW_UP_LATEST ago). */
    static boolean noReplyDue(Instant sentAt, int opens, Instant repliedAt, Instant now) {
        if (sentAt == null || repliedAt != null || opens < NO_REPLY_OPENS) {
            return false;
        }
        Instant due = sentAt.plus(NO_REPLY_AFTER);
        return !now.isBefore(due) && now.isBefore(due.plus(FOLLOW_UP_LATEST));
    }

    /** At least `threshold` counted opens within the window, and no spike alert for it yet. */
    static boolean openSpike(int opensInWindow, int threshold, boolean alreadyRaisedInWindow) {
        return opensInWindow >= threshold && !alreadyRaisedInWindow;
    }

    /** The link's views reached DOC_VIEWS and it has no DOC_VIEWS alert yet. */
    static boolean documentViews(int countedViews, boolean alreadyRaised) {
        return countedViews >= DOC_VIEWS && !alreadyRaised;
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
