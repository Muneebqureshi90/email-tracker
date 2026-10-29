package com.mailpulse.support;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

/** A clock that only moves when a test moves it. */
public final class MutableClock extends Clock {

    private volatile Instant now;

    public MutableClock(Instant start) {
        this.now = start.truncatedTo(ChronoUnit.MILLIS);
    }

    @Override
    public Instant instant() {
        return now;
    }

    @Override
    public ZoneId getZone() {
        return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        return this;
    }

    public void set(Instant instant) {
        now = instant;
    }

    public void advance(Duration duration) {
        now = now.plus(duration);
    }
}
