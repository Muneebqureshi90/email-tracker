package com.mailpulse.activity;

import java.time.Instant;
import java.util.UUID;

/**
 * One counted open, click or alert, as shown in the feed and in notifications.
 *
 * @param shouldNotify whether the extension should show a desktop notification for it
 */
public record ActivityItem(
        long id,
        String kind,
        UUID emailId,
        String subject,
        String recipients,
        Instant occurredAt,
        String source,
        String linkUrl,
        boolean shouldNotify) {}
