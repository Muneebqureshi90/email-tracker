package com.mailpulse.applications;

import java.time.Instant;
import java.util.UUID;

/**
 * One job application as GET/POST/PATCH /api/applications return it. {@code appliedOn} is "YYYY-MM-DD" or null;
 * {@code emailSubject}, {@code opens} and {@code clicks} come from the linked tracked email (null/0 without one).
 */
public record ApplicationView(
        UUID id,
        String company,
        String role,
        String status,
        String appliedOn,
        String notes,
        UUID emailId,
        String emailSubject,
        long opens,
        long clicks,
        Instant createdAt,
        Instant updatedAt) {}
