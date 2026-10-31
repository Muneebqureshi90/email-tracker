package com.mailpulse.common;

import java.time.Clock;
import java.time.Duration;
import java.util.Comparator;
import java.util.Map;
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
        if (buckets.size() >= maxKeys && !buckets.containsKey(key)) {
            evict(now);
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

    /**
     * Makes room for a new key: drops the buckets that have refilled completely (they equal a new one), then, if
     * still full, the least recently used tenth, so the limits of active clients are never reset all at once.
     */
    private synchronized void evict(long now) {
        if (buckets.size() < maxKeys) {
            return;
        }
        buckets.entrySet().removeIf(entry -> now - entry.getValue().updatedAt >= fullRefillMillis);
        int excess = buckets.size() - (maxKeys - Math.max(1, maxKeys / 10));
        if (excess > 0) {
            buckets.entrySet().stream()
                    .sorted(Comparator.comparingLong((Map.Entry<String, Bucket> entry) -> entry.getValue().updatedAt))
                    .limit(excess)
                    .map(Map.Entry::getKey)
                    .toList()
                    .forEach(buckets::remove);
        }
    }

    private static final class Bucket {
        private double tokens;
        private volatile long updatedAt;

        private Bucket(double tokens, long updatedAt) {
            this.tokens = tokens;
            this.updatedAt = updatedAt;
        }
    }
}
