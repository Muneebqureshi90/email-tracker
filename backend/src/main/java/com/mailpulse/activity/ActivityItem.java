package com.mailpulse.activity;

import java.time.Instant;
import java.util.UUID;

/**
 * One counted open, click or alert, as shown in the feed and in notifications.
 *
 * @param shouldNotify whether the extension should show a desktop notification for it
 * @param alertType FOLLOW_UP, OPEN_SPIKE or REVIVAL for alerts, otherwise null
 * @param alertText what the alert says, for example "Opened 3 times within 60 minutes"
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
        boolean shouldNotify,
        String alertType,
        String alertText) {}
