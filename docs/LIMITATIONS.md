# Known limitations

Draft from Step 0. Spike results will confirm or correct each item.

## What can be measured
- An open is only recorded if the recipient's mail app loads images. Gmail and most clients do so by
  default, but readers can turn images off, and some apps and privacy tools block trackers.
- Gmail loads images through Google's proxy. The server sees Google's IP and a fixed user agent, so
  the reader's location and device are unknown for Gmail opens.
- Google's proxy may cache the pixel, so some repeat opens never reach the server. Open counts are a
  lower bound.
- Apple Mail Privacy Protection loads images when mail arrives, even if nobody reads it. MailPulse
  flags these as prefetches and does not count them by default — so real opens in Apple Mail are often
  invisible too.
- A forwarded email carries the pixel, so opens by people it was forwarded to count as opens.
- One email body means one pixel: in a group email we know *that* someone opened, not *who*.
  Per-recipient tracking needs a separate copy per recipient (later phase).
- Open times are the time the image was fetched, which can differ slightly from when the person
  actually read the message.

## The owner's own views
- Views in Chrome with the extension installed are filtered out (PLAN §4.3).
- Opening the sent email on a device without the extension — for example the Gmail phone app — can
  count as an open. The server cannot tell it apart from a recipient.
- Every open is held for ~30 s before it counts, so self-view reports can cancel it. Notifications
  therefore arrive about half a minute to a minute after the real open.

## Availability
- Events are only recorded while the PC, Docker, the backend and the tunnel are running. Opens
  during downtime are lost for good.
- While the backend is down, tracked links do not work: a recipient who clicks one sees an error page
  instead of the destination. That is why link tracking is off by default; turn it on per email only
  when you accept this.
- MailPulse runs only on the owner's PC. Opens that happen while the PC is asleep or off are lost.
- The public address is tied to the PC's name and the tailnet name in Tailscale. Renaming either one
  breaks every pixel and link already sent.
- If the backend is down while composing, emails are sent untracked (by design).

## Gmail integration
- The extension depends on InboxSDK and on Gmail's web UI. A Gmail change can break marks or hooks
  until InboxSDK ships a fix. Sending itself must never break.
- Emails sent from the Gmail phone app or any other client are not tracked.
- Plain-text mode cannot carry an image. The extension cannot detect plain-text mode yet (InboxSDK
  has no API for it and Step 1 has not recorded the DOM), so such an email gets the pixel inserted,
  Gmail drops it, and the email stays "not opened" for good.
- Confidential mode is detected from the English Gmail interface only ("Content expires" notice).
  It matters only when the setting "Track confidential-mode emails" is off (default on).
- Scheduled send: the pixel goes in when the schedule menu opens, because Gmail may not fire the
  normal send event for scheduled emails (Step 1 checks). Such emails show as "scheduled" until the
  first open.
- Replies: Gmail may keep the quoted earlier message out of the editor and add it when sending. Old
  MailPulse pixels inside that hidden quote cannot be removed and can count as opens of the older
  email. Step 1 checks how often this happens.
- "Sent only to yourself" compares exact addresses; Gmail aliases such as you+news@gmail.com count as
  other recipients.
- "Send & archive" in the cancel-and-resend send mode re-sends with a plain send (the archive step is
  lost). The default send mode does not cancel anything.
- The owner's own clicks on tracked links are marked only when Chrome opens the link directly;
  if Gmail first routes the click through google.com, that click can count.
- Link tracking: links written out as a bare address (the text is the URL) are never rewritten,
  and a link added in the last second before Send can stay untracked. Clicks in the first 15 seconds
  after sending, or on three links at once, are treated as security scanners and not counted.
- InboxSDK needs a free App ID from inboxsdk.com, and its telemetry is blocked by extension rules.

## Privacy and deliverability
- Tailscale Funnel relays carry the encrypted traffic (TLS ends on the PC). Tailscale knows the
  connecting IP addresses and the device name, not the requests.
- Recipients who view the message source can see the `*.ts.net` tracking address.
- A new tracking domain and rewritten links can slightly affect spam filtering.
- Tracking pixels may need recipient consent in some jurisdictions (for example under EU/UK
  ePrivacy rules). The owner is responsible for how they use MailPulse.

## Live opens and repeat opens (v2)
- An open is confirmed only after the self-view check (the hold, 30 s by default), so the ✓✓ and the notification
  come after the hold plus the extension's next poll, not at the moment of the open.
- Reading time cannot be measured for emails: Gmail's image proxy loads the pixel once per display, and nothing
  tells how long the email stayed open. MailPulse does not try (only document links measure reading time).
- Why an email can show "Opened 2 times" when the recipient opened it once: through Gmail's image proxy every
  request looks the same (Google's network and user agent). A second load can be the recipient's Gmail showing the
  email again, or the owner viewing the sent copy on a phone or in a browser without the extension. MailPulse cannot
  tell these apart. Use "That was me" on the email page to remove an open or click that was yours (undo is possible).
- Tip: in the Gmail app on your own phone, set "Ask before displaying external images" (Settings, your account,
  Images), so opening your sent mail there no longer loads the pixel.

## Document links (v2)
- Gmail attachments cannot be tracked, so a document is shared as a MailPulse link (`/d/...`). The link only works
  while this PC, Docker and Tailscale Funnel are running; when the PC is off, recipients get an error from Tailscale.
- A view counts when the viewer page sends its first heartbeat, which needs JavaScript. Opening the link in a tool
  that does not run JavaScript, or previewing it in a link scanner, never counts (on purpose).
- Reading time is the time the viewer page was visible (every 5 s while visible). It cannot tell whether someone was
  actually reading, and a tab left open in the foreground keeps counting until it is hidden or closed. One beat adds
  at most 10 s, and a page never adds more time than has passed on the server's clock.
- A reload within the duplicate window (60 s by default) from the same network and browser continues the same view.
  Two different people behind one office network with the same browser look like one reader for that minute.
- The owner's own views never count when the extension adds the self header; a view of your own link from a phone or
  another browser counts like a recipient's.
- Downloads are counted when the file is requested; MailPulse cannot see whether the download finished or the file
  was opened afterwards, or where the file goes once downloaded.
- PDF only, at most 10 MB and 100 documents. The page count shown in the list comes from a light scan of the file and
  can be missing for compressed PDFs; each view reports the page count its viewer saw.
- "Delete all my data" also deletes documents, their links and their events.
