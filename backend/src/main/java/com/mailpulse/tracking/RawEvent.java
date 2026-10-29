package com.mailpulse.tracking;

import java.net.InetAddress;
import java.time.Instant;

/** A pixel fetch or link click as received, before it is matched to an email. */
record RawEvent(
        EventType type,
        String token,
        Instant receivedAt,
        String method,
        String userAgent,
        InetAddress clientIp,
        boolean selfMarked) {}
