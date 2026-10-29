package com.mailpulse.settings;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.Set;

/**
 * Owner-editable rules. {@code selfViewWindowSeconds} is the self-view hold: an open waits this long
 * before it counts, and is dropped if the owner viewed the email within this many seconds of it.
 */
public record Settings(
        boolean trackingDefault,
        boolean linkTrackingDefault,
        @Min(0) @Max(120) int sendGraceSeconds,
        @Min(5) @Max(120) int selfViewWindowSeconds,
        @Min(0) @Max(600) int dedupeWindowSeconds,
        int followUpHours,
        @Min(2) @Max(20) int spikeOpens,
        @Min(5) @Max(1440) int spikeWindowMinutes,
        @Min(1) @Max(90) int revivalDays,
        @Min(30) @Max(3650) int retentionDays,
        @NotNull IpMode ipMode,
        boolean countApplePrefetch,
        boolean notifyOpens,
        boolean notifyClicks,
        boolean notifyAlerts,
        @NotBlank @Size(max = 64) String timeZone) {

    public static final Set<Integer> FOLLOW_UP_OPTIONS = Set.of(24, 48, 72);

    public enum IpMode {
        TRUNCATED,
        OFF
    }
}
