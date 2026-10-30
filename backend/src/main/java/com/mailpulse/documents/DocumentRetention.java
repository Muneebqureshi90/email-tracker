package com.mailpulse.documents;

import java.time.Instant;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The retention period for document events (maintenance). Links of an email go with the email; share links and
 * the documents themselves stay until the owner deletes them.
 */
@Component
public class DocumentRetention {

    private final DocumentEventRepository events;

    DocumentRetention(DocumentEventRepository events) {
        this.events = events;
    }

    /** Views that ended before the cutoff (with their reads and feed items) and older downloads. */
    @Transactional
    public int deleteOlderThan(Instant cutoff) {
        return events.deleteOlderThan(cutoff);
    }
}
