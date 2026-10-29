package com.mailpulse.common;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.MutableClock;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class RateLimiterTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-29T10:00:00Z"));
    private final RateLimiter limiter = new RateLimiter(5, Duration.ofMinutes(1), clock, 100);

    @Test
    void allowsBurstUpToCapacityThenBlocks() {
        for (int i = 0; i < 5; i++) {
            assertThat(limiter.tryAcquire("a")).isTrue();
        }
        assertThat(limiter.tryAcquire("a")).isFalse();
    }

    @Test
    void refillsEvenlyOverThePeriod() {
        for (int i = 0; i < 5; i++) {
            limiter.tryAcquire("a");
        }
        clock.advance(Duration.ofSeconds(11));
        assertThat(limiter.tryAcquire("a")).isFalse();
        clock.advance(Duration.ofSeconds(1));
        assertThat(limiter.tryAcquire("a")).isTrue();
    }

    @Test
    void keysAreIndependent() {
        for (int i = 0; i < 5; i++) {
            limiter.tryAcquire("a");
        }
        assertThat(limiter.tryAcquire("b")).isTrue();
    }
}
