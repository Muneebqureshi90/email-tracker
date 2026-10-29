package com.mailpulse.tracking;

/** PENDING events wait out the self-view hold before they are COUNTED or IGNORED. */
public enum Verdict {
    PENDING,
    COUNTED,
    IGNORED
}
