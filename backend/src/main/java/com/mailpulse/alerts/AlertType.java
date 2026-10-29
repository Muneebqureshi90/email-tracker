package com.mailpulse.alerts;

/** PLAN §4.7. */
public enum AlertType {
    /** No open within the follow-up time after sending. */
    FOLLOW_UP,
    /** Several opens within a short window: the email is being read now. */
    OPEN_SPIKE,
    /** Opened again after a long silence. */
    REVIVAL
}
