package com.mailpulse.alerts;

/** PLAN §4.7, plus DOC_VIEWS for document links (docs/v2-contract.md). */
public enum AlertType {
    /** No open within the follow-up time after sending. */
    FOLLOW_UP,
    /** Several opens within a short window: the email is being read now. */
    OPEN_SPIKE,
    /** Opened again after a long silence. */
    REVIVAL,
    /** A document link was viewed several times: the document is being passed around or studied. */
    DOC_VIEWS
}
