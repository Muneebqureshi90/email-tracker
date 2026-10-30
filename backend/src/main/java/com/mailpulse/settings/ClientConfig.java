package com.mailpulse.settings;

/**
 * What the extension needs: where pixels live, the self-request header, defaults, behaviour switches
 * and notification rules. {@code configVersion} changes whenever any other value changes.
 */
public record ClientConfig(
        String publicBaseUrl,
        String selfHeaderName,
        String selfHeaderValue,
        boolean trackingDefault,
        boolean linkTrackingDefault,
        Settings.SendMode sendMode,
        boolean dnrBlocking,
        boolean trackConfidential,
        int selfViewWindowSeconds,
        int followUpHours,
        String configVersion,
        Settings.NotifyOn notifyOn,
        boolean notifyDocuments,
        boolean quietHoursEnabled,
        String quietHoursStart,
        String quietHoursEnd,
        String timeZone) {}
