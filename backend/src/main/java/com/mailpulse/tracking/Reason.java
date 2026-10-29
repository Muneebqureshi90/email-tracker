package com.mailpulse.tracking;

/** Why an event did not count. Shown in the email timeline. */
public enum Reason {
    /** Request carried the owner's X-MailPulse-Self header. */
    SELF,
    /** The extension reported the owner viewing this email within the self-view window. */
    SELF_VIEW,
    /** Arrived within the send grace period. */
    SEND_GRACE,
    /** The email had not been sent yet and the request did not come from a mail proxy. */
    BEFORE_SEND,
    /** Same source counted for this email within the duplicate window. */
    DUPLICATE,
    /** HEAD request: scanners check links this way. */
    BOT_HEAD,
    /** User agent of a known bot or scanner. */
    BOT_UA,
    /** Apple Mail Privacy Protection loads images on delivery, not when read. */
    PREFETCH,
    /** Tracking was switched off for this email. */
    TRACKING_OFF
}
