package com.mailpulse.tracking;

/** Who fetched the pixel or followed the link, as far as the request shows. */
public enum Source {
    GMAIL_PROXY,
    YAHOO_PROXY,
    OUTLOOK_PROXY,
    APPLE_MPP,
    SCANNER,
    DIRECT,
    UNKNOWN;

    public boolean isMailProxy() {
        return this == GMAIL_PROXY || this == YAHOO_PROXY || this == OUTLOOK_PROXY || this == APPLE_MPP;
    }
}
