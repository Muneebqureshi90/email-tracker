package com.mailpulse.tracking;

import java.net.InetAddress;
import java.time.Instant;

/**
 * A pixel fetch or link click as received, before it is matched to an email.
 *
 * @param deviceModel phone model from the {@code Sec-CH-UA-Model} client hint (D-135), already checked; null when not sent
 */
record RawEvent(
        EventType type,
        String token,
        Instant receivedAt,
        String method,
        String userAgent,
        InetAddress clientIp,
        boolean selfMarked,
        String deviceModel) {}
