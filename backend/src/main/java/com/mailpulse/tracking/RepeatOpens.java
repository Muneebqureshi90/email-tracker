package com.mailpulse.tracking;

import com.mailpulse.settings.Settings;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

/** Repeat-open rules shared by the email list, Gmail marks and notifications (docs/v2-contract.md). Pure. */
public final class RepeatOpens {

    /** An open this long after the previous counted open is "opened again". */
    public static final Duration REOPEN_GAP = Duration.ofMinutes(60);
    /** How many latest open times summaries and marks carry. */
    public static final int RECENT = 5;

    private RepeatOpens() {}

    /** True when the latest counted open came at least REOPEN_GAP after the one before it. */
    public static boolean openedAgain(List<Instant> newestFirst) {
        return newestFirst.size() >= 2
                && Duration.between(newestFirst.get(1), newestFirst.get(0)).compareTo(REOPEN_GAP) >= 0;
    }

    /**
     * Whether the n-th counted open of an email notifies under the owner's setting.
     *
     * @param openNumber 1 for the first counted open
     * @param previousAt the counted open before this one, or null
     */
    public static boolean notifies(Settings.NotifyOn mode, int openNumber, Instant at, Instant previousAt) {
        return switch (mode) {
            case FIRST -> openNumber == 1;
            case EVERY -> true;
            case EVERY_AFTER_GAP -> openNumber == 1 || previousAt == null
                    || Duration.between(previousAt, at).compareTo(REOPEN_GAP) >= 0;
        };
    }
}
