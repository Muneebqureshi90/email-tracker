package com.mailpulse.alerts;

/** PLAN §4.7, plus DOC_VIEWS for document links (docs/v2-contract.md) and NO_REPLY for opened emails without a reply. */
public enum AlertType {
    /** No open within the follow-up time after sending. */
    FOLLOW_UP,
    /** Several opens within a short window: the email is being read now. */
    OPEN_SPIKE,
    /** Opened again after a long silence. */
    REVIVAL,
    /** A document link was viewed several times: the document is being passed around or studied. */
    DOC_VIEWS,
    /** Opened at least three times and still no reply two days after sending: a good time to follow up. */
    NO_REPLY,
    /** Monday summary of the previous week (sent, opened, replied, interviews); no email and no document. */
    WEEKLY
}
