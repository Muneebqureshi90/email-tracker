package com.mailpulse.common;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.MutableClock;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class RateLimiterEvictionTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-29T10:00:00Z"));

    @Test
    void fullLimiterEvictsOnlyTheLeastRecentlyUsedKeys() {
        RateLimiter limiter = new RateLimiter(2, Duration.ofMinutes(1), clock, 10);
        exhaust(limiter, "old");
        clock.advance(Duration.ofMillis(1));
        exhaust(limiter, "blocked");
        for (int i = 1; i <= 8; i++) {
            clock.advance(Duration.ofMillis(1));
            assertThat(limiter.tryAcquire("k" + i)).isTrue();
        }
        clock.advance(Duration.ofMillis(1));

        assertThat(limiter.tryAcquire("new")).isTrue();

        assertThat(limiter.tryAcquire("blocked")).isFalse();
        assertThat(limiter.tryAcquire("old")).isTrue();
    }

    @Test
    void singleKeyLimiterKeepsCountingItsKey() {
        RateLimiter overall = new RateLimiter(3, Duration.ofMinutes(1), clock, 1);
        for (int i = 0; i < 3; i++) {
            assertThat(overall.tryAcquire("all")).isTrue();
        }
        assertThat(overall.tryAcquire("all")).isFalse();
    }

    private static void exhaust(RateLimiter limiter, String key) {
        assertThat(limiter.tryAcquire(key)).isTrue();
        assertThat(limiter.tryAcquire(key)).isTrue();
        assertThat(limiter.tryAcquire(key)).isFalse();
    }
}
