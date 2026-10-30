package com.mailpulse.activity;

import java.time.Instant;
import java.util.UUID;

/**
 * One counted open, click, document view, read or download, or alert, as shown in the feed and in notifications.
 *
 * @param emailId the email, or null for a document share link (a link without an email)
 * @param shouldNotify whether the extension should show a desktop notification for it
 * @param alertType FOLLOW_UP, OPEN_SPIKE, REVIVAL or DOC_VIEWS for alerts, otherwise null
 * @param alertText what the alert says, for example "Opened 3 times within 60 minutes"
 * @param openNumber for OPEN the n-th counted open of the email (1 = first); for DOC_VIEW and DOC_READ the n-th
 *     counted view of the link (a read carries the number of the view that was read); for DOC_DOWNLOAD the n-th
 *     counted download of the link; otherwise null
 * @param account the Gmail account the email was sent from, for "Open in Gmail"
 * @param gmailThreadId the Gmail thread, for "Open in Gmail"
 * @param documentId the document of a DOC_* item or DOC_VIEWS alert
 * @param documentName its (cleaned) name, for example "Resume.pdf"
 * @param linkLabel the link's label, for example "LinkedIn", or null
 * @param readSeconds DOC_VIEW and DOC_READ: visible reading time of the view so far
 * @param pagesViewed DOC_VIEW and DOC_READ: how many different pages the view showed
 * @param pageCount DOC_*: the document's page count as the viewer reported it (or as the upload found it)
 */
public record ActivityItem(
        long id,
        String kind,
        UUID emailId,
        String subject,
        String recipients,
        Instant occurredAt,
        String source,
        String linkUrl,
        boolean shouldNotify,
        String alertType,
        String alertText,
        Integer openNumber,
        String account,
        String gmailThreadId,
        UUID documentId,
        String documentName,
        String linkLabel,
        Integer readSeconds,
        Integer pagesViewed,
        Integer pageCount) {}
