package com.mailpulse.emails;

/** DRAFT: registered while composing. SENT/SCHEDULED/CANCELLED come from the extension's send events. */
public enum EmailStatus {
    DRAFT,
    SENT,
    SCHEDULED,
    CANCELLED
}
