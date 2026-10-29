package com.mailpulse.tracking;

import com.mailpulse.emails.EmailStatus;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

/** The final decision for a pending event, once its self-view hold has passed. Pure, so it is easy to test. */
final class FinalizerRules {

    /** Clicks this soon after sending come from scanners that check links on delivery (PLAN §4.4). */
    static final Duration CLICK_TIMING = Duration.ofSeconds(15);
    /** Clicks on this many different links of one email within BURST_WINDOW are a scanner. */
    static final int BURST_LINKS = 3;
    static final Duration BURST_WINDOW = Duration.ofSeconds(2);

    record Facts(
            Instant receivedAt,
            Source source,
            EmailStatus status,
            Instant sentAt,
            boolean selfViewNearby,
            boolean duplicate,
            EventType type,
            boolean linkBurst) {

        /** An open: the click-only rules do not apply. */
        Facts(Instant receivedAt, Source source, EmailStatus status, Instant sentAt, boolean selfViewNearby, boolean duplicate) {
            this(receivedAt, source, status, sentAt, selfViewNearby, duplicate, EventType.OPEN, false);
        }
    }

    private FinalizerRules() {}

    static Optional<Reason> decide(Facts facts, Duration sendGrace) {
        if (facts.selfViewNearby()) {
            return Optional.of(Reason.SELF_VIEW);
        }
        if (facts.sentAt() != null && facts.receivedAt().isBefore(facts.sentAt().plus(sendGrace))) {
            return Optional.of(Reason.SEND_GRACE);
        }
        if (facts.status() == EmailStatus.DRAFT && !facts.source().isMailProxy()) {
            return Optional.of(Reason.BEFORE_SEND);
        }
        if (facts.type() == EventType.CLICK) {
            if (facts.sentAt() != null && facts.receivedAt().isBefore(facts.sentAt().plus(CLICK_TIMING))) {
                return Optional.of(Reason.BOT_TIMING);
            }
            if (facts.linkBurst()) {
                return Optional.of(Reason.BOT_BURST);
            }
        }
        if (facts.duplicate()) {
            return Optional.of(Reason.DUPLICATE);
        }
        return Optional.empty();
    }
}