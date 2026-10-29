package com.mailpulse.tracking;

import com.mailpulse.emails.EmailStatus;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

/** The final decision for a pending event, once its self-view hold has passed. Pure, so it is easy to test. */
final class FinalizerRules {

    record Facts(Instant receivedAt, Source source, EmailStatus status, Instant sentAt, boolean selfViewNearby, boolean duplicate) {}

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
        if (facts.duplicate()) {
            return Optional.of(Reason.DUPLICATE);
        }
        return Optional.empty();
    }
}
