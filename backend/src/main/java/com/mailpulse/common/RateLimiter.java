package com.mailpulse.common;

import java.time.Clock;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

/** In-memory token bucket per key: {@code capacity} requests, refilled evenly over {@code period}. */
public final class RateLimiter {

    private final double capacity;
    private final double tokensPerMilli;
    private final long fullRefillMillis;
    private final Clock clock;
    private final int maxKeys;
    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    public RateLimiter(int capacity, Duration period, Clock clock, int maxKeys) {
        if (capacity <= 0 || period.isZero() || period.isNegative() || maxKeys <= 0) {
            throw new IllegalArgumentException("Invalid rate limit");
        }
        this.capacity = capacity;
        this.fullRefillMillis = period.toMillis();
        this.tokensPerMilli = capacity / (double) fullRefillMillis;
        this.clock = clock;
        this.maxKeys = maxKeys;
    }

    public boolean tryAcquire(String key) {
        long now = clock.millis();
        if (buckets.size() >= maxKeys) {
            evictIdle(now);
        }
        Bucket bucket = buckets.computeIfAbsent(key, k -> new Bucket(capacity, now));
        synchronized (bucket) {
            bucket.tokens = Math.min(capacity, bucket.tokens + Math.max(0, now - bucket.updatedAt) * tokensPerMilli);
            bucket.updatedAt = now;
            if (bucket.tokens >= 1) {
                bucket.tokens -= 1;
                return true;
            }
            return false;
        }
    }

    private void evictIdle(long now) {
        buckets.entrySet().removeIf(entry -> now - entry.getValue().updatedAt >= fullRefillMillis);
        if (buckets.size() >= maxKeys) {
            buckets.clear();
        }
    }

    private static final class Bucket {
        private double tokens;
        private long updatedAt;

        private Bucket(double tokens, long updatedAt) {
            this.tokens = tokens;
            this.updatedAt = updatedAt;
        }
    }
}
