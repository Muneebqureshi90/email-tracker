# Mailsuite (Mailtrack) help center: tracking behaviour and edge cases

Research note for MailPulse. Sources accessed 2026-10-29. Research only; no implementation.

## About this note

- **Goal.** Learn how Mailsuite's Gmail tracker, Mailtrack, behaves, especially in edge cases, so that MailPulse's design handles the same situations. MailPulse keeps its own name, text and design (DECISIONS D-001); nothing here should be copied into the product.
- **Method.** The help center at https://mailsuite.com/hc/en-us runs on Zendesk Guide. Its public Help Center API (`/api/v2/help_center/en-us/articles.json`, answered by `mailtrack.zendesk.com`) returned all 208 English articles in 32 sections. I downloaded every article body and read in full every article related to the twelve topics below (about 120 articles).
- **Extra sources.** Where the help center is silent (image proxies, Apple Mail Privacy Protection, scanner filtering, how self-opens are prevented), I used Mailsuite's own blog, privacy policy, Privacy and Security Center, the security PDFs it links to, Google Patents and Google's developer documentation. They are cited by short names that are listed under Sources.
- **Labels.** (V) Verified: stated in the cited source as read on 2026-10-29. (I) Inferred: my own conclusion or recommendation, not stated by Mailsuite.
- **Dates.** "upd." is the "Updated" date printed on the help article page. Many articles show 2026-10-08 because of a bulk update, so the Sources table also gives the date of the last change to the article text.
- **Names.** Mailtrack is the tracking product; Mailsuite is the company and the wider suite.
- **Scope.** MailPulse is free, personal and local-only (CLAUDE.md, DECISIONS D-023), so this note leaves out Mailsuite's plans, pricing, quotas, signature, teams and billing, and keeps to tracking behaviour and edge cases.

## 1. Key findings for MailPulse

1. **"Opened" only means "the image was requested".** Mailsuite says so openly and lists many automatic fetchers: the recipient's mail service, CRMs that receive a copy, security scanners, preview panes, apps that preload mail (Superhuman is named) and Apple Mail Privacy Protection. Opens that arrive right after sending are often not real (V: [HC-360005926978, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005926978), [HC-37597504227485, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/37597504227485), [Blog-Reliable]).
2. **Per-recipient tracking needs one message per recipient.** Mailsuite states that one message with one shared pixel cannot show who opened it. It makes a copy per recipient through its Gmail access, keeps one copy in Sent and deletes the rest. It is limited to 50 recipients and does not work for scheduled emails, Google Groups, team addresses or the Gmail phone add-on (V: [HC-360005926458, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005926458), [HC-360005926418, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005926418), [HC-4650746650641, upd. 2026-10-28](https://mailsuite.com/hc/en-us/articles/4650746650641)). This matches LIMITATIONS.md (one pixel per body in v1).
3. **Self-opens are handled in layers, and one layer is patented.** (a) The "Debeaconizer" replaces the copy kept in Sent with a copy whose pixel is removed or inactive; it is covered by US patent 10,749,835 (estimated expiry 2036-12-30). (b) The extension and Mailsuite's own mobile app recognise the sender's views. (c) Emails sent only to yourself are not tracked. Mailsuite admits that opening your sent mail, or a reply, in the official Gmail phone app is still recorded as a recipient open (V: [HC-360005927358, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005927358), [HC-37572074929437, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/37572074929437), [Blog-Reliable], [Patent]). MailPulse must not copy (a) (I).
4. **The pixel comes back inside quoted replies.** When the sender opens a reply that quotes the tracked email, the old pixel can load again and count as another open by the recipient. Mailsuite filters this only where its extension or app runs (V: [HC-37572074929437, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/37572074929437), [Blog-Reliable]).
5. **No IP address, device or location for opens.** Mailsuite removed device details because Gmail's image handling made them wrong. Its blog adds that a Gmail open shows only Google's proxy and that cached images can hide repeat opens (V: [HC-360005928238, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005928238), [Blog-Reliable]).
6. **Blocked images produce a silent "not opened".** Mailsuite estimates 5–10% of recipients cannot be tracked (Outlook blocks images by default; Yahoo, Proton Mail and privacy tools also block). It shows "Open status may be unreliable" and treats a reply without a recorded open as proof that tracking failed (V: [HC-360005941037, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005941037), [HC-360005941217, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360005941217), [Blog-Reliable]).
7. **Bot clicks are normal.** Security scanners (Microsoft Defender Safe Links is named) and preloading apps "click" links right after delivery. Mailsuite filters known scanner patterns but says it cannot catch every new scanner (V: [HC-37597504227485, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/37597504227485), [Blog-Reliable]).
8. **Reminders cover both "not opened" and "no reply".** Both use 24, 48 or 72 hours, can be set per email or by default, and can be snoozed or switched off from the reminder email. There are also "many opens in a short time" and "reopened after a long time" alerts with unpublished thresholds, and a daily report (V: [HC-360005927378, upd. 2026-10-26](https://mailsuite.com/hc/en-us/articles/360005927378), [HC-360005926798, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005926798), [HC-360005926658, upd. 2026-10-22](https://mailsuite.com/hc/en-us/articles/360005926658)).
9. **Email alerts fire on the first open only, with no quiet hours.** Notification settings are fixed per email when it is sent, so switching an alert off does not stop it for emails already sent (V: [HC-360005941077, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005941077), [HC-360005927758, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005927758)).
10. **Forwards cannot be detected.** Opens by people an email was forwarded to are credited to the original recipient; only a burst of opens hints at a forward (V: [HC-360005927698, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360005927698)).
11. **Cases Mailsuite skips or warns about:** plain-text mode (warning before sending), emails to yourself (warning), emails sent before install, emails sent from a device or app without the extension, and Gmail phone app emails unless the add-on is switched on for that message (V: [HC-360005941217, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360005941217), [HC-360005942257, upd. 2026-10-19](https://mailsuite.com/hc/en-us/articles/360005942257)).
12. **Confidential mode is tracked.** Mailsuite only warns that it can interfere with multi-recipient emails, campaigns and document tracking (V: [HC-4651162015505, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/4651162015505)). PLAN.md currently skips tracking in confidential mode, so Spike 1 should re-check this (I).
13. **Mailsuite says it never stores email bodies** (content passes through its service only until delivery), but it does store addresses, subjects, send times, open and click histories, link URLs, and the IP address, browser and OS of whoever clicks a link or downloads a document. No retention period is published (V: [Privacy-Policy] §3.2, [HC-360013806978, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360013806978)).
14. **Mailsuite needs Google's broadest Gmail scope** ("Read, compose, send, and permanently delete all your email", which Google classes as Restricted) and passes a yearly CASA security assessment; the certificate it links to as the latest expired on 2025-02-27 (V: [HC-360005926458, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005926458), [Google-Scopes], [CASA-Cert]).
15. **The help center says nothing about Undo Send, drafts, Gmail clipping, alert latency in seconds, or which email in a thread the check marks describe.** These must come from our own Step 1 spikes (V: absent from all 208 articles).

## 2. Findings by topic

### 2.1 How tracking works: pixel, check marks, delay, notification timing

**What Mailsuite says**

- (V) When an email is sent, Mailtrack adds a tiny image; when the recipient's mail client downloads it, a call to Mailsuite's servers records an open. Articles describe it both as a 1x1 image and as a "0x0 .png" file [HC-360013900257, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360013900257), [HC-360005942237, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360005942237), [HC-360005927698, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360005927698).
- (V) An open requires the recipient to view the email and to allow images [HC-360005942237, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360005942237).
- (V) In the Gmail Sent folder, one check means sent but not opened, two green checks mean opened, and hovering shows when and how many times. Grey checks mean the email was not tracked [HC-360005926758, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360005926758), [HC-360005942257, upd. 2026-10-19](https://mailsuite.com/hc/en-us/articles/360005942257). The mobile app uses the same one-check / two-check convention [HC-360009967337, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360009967337).
- (V) An email is labelled "Active" when it was opened and/or replied to less than an hour after sending [HC-360005941697, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005941697).
- (V) The tooltip can say "Open status may be unreliable" for recipients whose mail service probably blocks tracking, estimated at 5–10% of recipients [HC-360005941037, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005941037).
- (V) No delay figure is published anywhere. Notifications are called "real-time"; if check marks seem late, the advice is to refresh Gmail or restart Chrome [HC-360005940977, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005940977), [HC-360005941437, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005941437).
- (V) Device information was removed from the tooltip because Gmail's image handling made it inaccurate; Mailsuite prefers showing nothing to showing wrong data [HC-360005928238, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005928238).
- (V) The extension also puts a green dot on received emails that contain trackers, with the tooltip "This sender uses email tracking" [HC-360005941337, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005941337).
- (V) Blog: Mailsuite splits reliability into false positives, false negatives, recipient attribution and detection latency, and says it judges signal quality before reporting rather than reporting as fast as possible [Blog-Reliable].

**Implication for MailPulse**

- (I) Keep the three states (not tracked, sent, opened) and add a fourth "uncertain" state for cases where a reply arrives with no counted open, or the recipient's mail service is known to block images. PLAN §4.5 currently has only ✓ and ✓✓.
- (I) Show the whole event history with verdicts (PLAN's raw log already allows this) and word the UI as "pixel loaded", never "read".
- (I) Do not show device or location for proxied opens. Show them only for direct requests and clicks, marked as approximate.
- (I) Mailsuite gives no latency target, so our 35–65 s estimate (PLAN §2, item 3) is our own design choice; measure it in Spike 3 and write it down.
- (I) Use our own labels. "Active", "Hot conversation", "Revival", "Monitor Reply" and "Debeaconizer" are Mailsuite's feature names (D-001).

### 2.2 Emails to multiple recipients

**What Mailsuite says**

- (V) Mailsuite can show who opened an email sent to several people (in To, Cc or Bcc), with limits: it does not work for scheduled emails, emails to more than 50 people (Campaigns are suggested instead), team addresses such as team@domain, Google Groups, or emails sent before the feature was active [HC-360005926418, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005926418), [HC-4650746650641, upd. 2026-10-28](https://mailsuite.com/hc/en-us/articles/4650746650641).
- (V) On phones, the newer article says the Gmail add-on shows only that an email was opened, not by whom, while the Mailtrack mobile app tracks each recipient [HC-4650746650641, upd. 2026-10-28](https://mailsuite.com/hc/en-us/articles/4650746650641), [HC-360009967337, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360009967337). The older group-email article simply says emails sent from the phone are excluded [HC-360005926418, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005926418).
- (V) Mechanism: the Gmail permission is needed to "make identical copies" of an email sent to several recipients, so that each copy is tracked separately, and to delete the extra copies so only one stays in Sent [HC-360005926458, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005926458).
- (V) Blog: an extension that inserts one pixel into one multi-recipient message cannot know which person loaded it. Mailsuite builds a complete MIME message per recipient through the Gmail API and sends it from the user's own mailbox [Blog-Reliable].
- (V) Google Groups: only the group address is visible, so opens on such an email must not be read as opens by individual members [HC-37659074983709, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/37659074983709).
- (V) "Split into individual emails" turns a Bcc list into one tracked email per recipient; every copy appears in Sent, each recipient sees only their own address, and the send can be scheduled [HC-7200418829073, upd. 2026-10-15](https://mailsuite.com/hc/en-us/articles/7200418829073).
- (V) An older article (text last changed 2024-12-10) says a non-campaign multi-recipient email is sent as a single copy and counted once [HC-6902958175901, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/6902958175901). (I) This is probably the behaviour when per-recipient tracking is not active.

**Implication for MailPulse**

- (I) Our v1 (one pixel per message) behaves like Mailsuite without per-recipient tracking. For multi-recipient emails the UI should say "opened by someone on this email" and never guess a person.
- (I) Mailsuite does not explain how a per-recipient copy can show the full To/Cc list yet reach only one person. The Gmail API delivers to every address in the message headers; one known way to separate the delivery address from the visible headers is SMTP submission to Gmail with OAuth, which needs the full `https://mail.google.com/` scope. Check the headers of a Mailtrack group email (Open question 10) before designing Phase 6.
- (I) Per-recipient copies leave several messages in Sent. Mailsuite moves the extra campaign copies to Trash [HC-37659030335261, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/37659030335261); doing that needs a restricted Gmail scope [Google-Scopes]. Count that cost in Phase 6.
- (I) For small groups, a "send one email per person" option is the simplest route to per-recipient data.

### 2.3 Self-opens and false opens

**What Mailsuite says**

- (V) Emails sent to your own address are not tracked, and a warning says so. The reason given is to avoid false positives. To test the product, send to a different address and open it on a different device [HC-360005927358, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005927358), [HC-360005941217, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360005941217).
- (V) Self-open detection only works when the sender reads mail in a desktop browser that has the extension, or in Mailsuite's own mobile app. Opening your own sent email in the Gmail Android app is recorded as an open by the recipient [HC-360005927358, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005927358).
- (V) Opening a reply can be counted as the other person's open, because the quoted original carries the pixel, when you read it on a device, browser or Google account without the extension. The Gmail phone app makes this more likely [HC-37572074929437, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/37572074929437).
- (V) Blog: the patented "Debeaconizer" replaces the copy stored in Sent with an equivalent copy whose pixel is removed, replaced or inactive. A device-recognition layer filters other sender views, and the extension inspects what Gmail is about to display to recognise its own pixel [Blog-Reliable].
- (V) Google Patents lists US 10,749,835 B2, "Method and system for tracking an email message", filed 2016-12-30, granted 2020-08-18, assignee Mail Track Co SL. Claim 1 includes replacing the stored copy of the sent email with a copy that has no tracking mark, a different mark or an inactive mark. Google estimates expiry on 2036-12-30 [Patent].
- (V) Other false-open sources: the recipient's mail service fetching the pixel automatically (opens right after sending, for some recipients only); a CRM that receives a copy; a mail program on the sender's own computer or phone that previews sent mail; and syncs that re-download old messages, producing a burst of opens on old conversations [HC-360005926978, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005926978).
- (V) About 95% of pixel downloads come from the main recipient; the rest come from forwards, mail servers passing the message around, or repeated processing by the recipient's mail service [HC-360005927798, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005927798), [HC-360005940677, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005940677).
- (V) People sharing one Chrome profile see each other's notifications; separate Chrome profiles fix it [HC-360005927478, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005927478).

**Implication for MailPulse**

- (I) PLAN §4.3 (direct block, self-view reports, hold window, send grace, raw log) is close to Mailsuite's extension-side filtering and does not touch the Sent copy. Keep it that way; do not add "rewrite the Sent copy" later without legal advice, because of the patent.
- (I) Keep "recipients are only the owner's own addresses, so no pixel", and include every "Send mail as" alias of the account in that check.
- (I) Add a rule that marks a burst of opens on an old email as "automatic (re-sync)" instead of counting it as fresh interest.
- (I) Phone self-opens remain. A possible owner-side workaround is "Ask before displaying external images" in the Gmail phone app, at the cost of hiding images in all mail; document it as an option, not a default.

### 2.4 Gmail image proxy, Apple Mail Privacy Protection, Outlook, images disabled

**What Mailsuite says**

- (V) Help center: device data was dropped because of "Gmail's image display policy" [HC-360005928238, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005928238).
- (V) Blog: Gmail fetches external images through Google's image proxy, so the tracker sees Google's request, not the reader's IP address or device, and any location derived from it points to Google. A cached image may not cause a new request on later views, so open counts are a history of observed requests, not of every view. Gmail may also hold back images from senders or messages it finds suspicious [Blog-Reliable].
- (V) Apple MPP: the help center mentions it only as a way for recipients to avoid tracking [HC-10495982191261, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/10495982191261). The blog says MPP can download remote content in the background when mail arrives, and that Mailtrack recognises patterns of automated requests and does not treat them as ordinary opens; clicks and replies stay useful [Blog-Reliable]. An older post says MPP preloads emails, which makes pixel data unreliable [Blog-Pixel].
- (V) Outlook blocks automatic picture downloads by default; Yahoo and Proton Mail also do not show images by default; privacy extensions and antivirus tools can block pixels [HC-10495982191261, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/10495982191261), [HC-360005941217, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360005941217).
- (V) When a recipient probably cannot be tracked, the tooltip warns "Open status may be unreliable", and tracked links are suggested as a backup signal [HC-360005941037, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005941037). A reply with no recorded open usually means images are off [HC-360005941097, upd. 2026-09-21](https://mailsuite.com/hc/en-us/articles/360005941097); the blog says such a reply triggers the warning [Blog-Reliable].
- (V) Senders who use Outlook get an add-in (Outlook on the web, Windows and Mac) with open tracking only: no desktop notifications, dashboard, per-recipient, link or PDF tracking [HC-8355245699869, upd. 2026-10-13](https://mailsuite.com/hc/en-us/articles/8355245699869). Mailsuite also says Google ends Gmailify and "Send mail as" for third-party addresses in January 2027 [HC-360005927738, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360005927738).

**Implication for MailPulse**

- (I) PLAN's `source` classes (GMAIL_PROXY, APPLE_MPP and others) and "do not count Apple prefetches by default" follow the same idea. Show the uncounted prefetches in the timeline so the owner can judge them.
- (I) Keep the no-store headers (PLAN §4.2). Mailsuite confirms that mail proxies can still cache, so counts are lower bounds.
- (I) Set the "uncertain" state when a reply arrives with no counted open, or when the recipient's domain is on a "blocks images by default" list. Build that list from Spike 2 results, not from memory.

### 2.5 Link tracking

**What Mailsuite says**

- (V) A link is tracked when the user inserts a tracked link from the compose link menu, switches on "Track this link" in the link editor or on hover, or turns on "Click tracking by default", which also covers URLs pasted as plain text. The URL must start with http:// or https:// [HC-360005941137, upd. 2026-10-15](https://mailsuite.com/hc/en-us/articles/360005941137), [HC-360005927598, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005927598).
- (V) A tracked link goes "briefly through our servers" to record the click and then on to the destination. The HTTP status code is not documented [HC-360005927598, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005927598), [HC-360005928158, upd. 2026-10-26](https://mailsuite.com/hc/en-us/articles/360005928158).
- (V) Heavily personalised URLs (for example with Google Analytics parameters) or unencoded special characters can cause an "Invalid URL" error; users are asked to encode such characters [HC-360005928158, upd. 2026-10-26](https://mailsuite.com/hc/en-us/articles/360005928158).
- (V) The default redirect domain is not named. Ad-blocker advice says to allow mailtrack.io and mailsuite.com [HC-360005928438, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360005928438), [HC-360005942177, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360005942177). A custom link domain can be set up as a subdomain of the user's sending or alias domain with a CNAME record pointing to links.mailtrack.io. It applies to links only; the open pixel and PDFs keep Mailsuite's standard domain [HC-39519128879133, upd. 2026-10-15](https://mailsuite.com/hc/en-us/articles/39519128879133), [HC-37923559830557, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/37923559830557).
- (V) The privacy policy lists websites Mailsuite runs, including gourl.es, shortlink.es, gotourl.es, gotourl.click, jumpto.es, jumptolink.es, lnkrelay.com, lnkroute.com, linktourl.es and linktourl.eu [Privacy-Policy]. lnkroute.com shows a Mailsuite-built page titled "URL shortener for Gmail" [lnkroute]. (I) These are probably Mailsuite's short-link or redirect domains.
- (V) Click notifications come as desktop notifications and email alerts; the email alert is sent once per email, on the first click [HC-360005927658, upd. 2026-10-15](https://mailsuite.com/hc/en-us/articles/360005927658), [HC-360005941137, upd. 2026-10-15](https://mailsuite.com/hc/en-us/articles/360005941137).
- (V) Automatic clicks: mail services, firewalls and antivirus tools scan links; apps and CRMs preload content; a recipient's system can register an open and a click at the same moment, even when it only sends an out-of-office reply [HC-37597504227485, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/37597504227485). Blog: Mailtrack filters traffic that matches known scanner patterns, naming Microsoft Defender for Office 365 Safe Links, but cannot promise to catch new scanners [Blog-Reliable].
- (V) Blog: the reputation of the pixel and redirect domains matters. Mailtrack says its pixel has been served from the same domain since 2013 and that it blocks abusive senders to protect that domain [Blog-Reliable].

**Implication for MailPulse**

- (I) PLAN §4.4 (stored URL only, 302, HEAD, user-agent, timing and burst rules) covers what Mailsuite describes. Also flag clicks that arrive in the same second as the first open from a scanner-like source.
- (I) Test link rewriting with UTM parameters, fragments, international domain names and characters such as ç. Store the original URL exactly and never re-encode it.
- (I) Mailsuite stresses that pixel and link domains need a long, clean reputation. Our `*.ts.net` Funnel address is a shared domain whose reputation we do not control (PLAN risk table), so watch spam placement and image blocking in Spike 2.

### 2.6 Follow-up reminders, other alerts, reports

**What Mailsuite says**

- (V) Follow-up reminders have two triggers: "not opened within" and "no reply received within", each with 24, 48 or 72 hours. They can be on by default in settings, set per email from the compose menu, or switched on after sending with a "Monitor reply" button in the sent pop-up. The reminder email offers snooze (another 24, 48 or 72 hours) and disable, either completely or for one contact [HC-360005927378, upd. 2026-10-26](https://mailsuite.com/hc/en-us/articles/360005927378), [HC-360005926798, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005926798).
- (V) Hot conversation: the email was opened several times in a short period. It can be switched off per email from the alert and may point to a forward. No threshold is published [HC-360005927198, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005927198).
- (V) Revival: the email was opened again after a long time. No threshold is published, and switching it off affects only emails sent afterwards [HC-360005940877, upd. 2026-10-22](https://mailsuite.com/hc/en-us/articles/360005940877).
- (V) Daily Report (about the previous day): average response time; emails sent and received and to or from how many people, with the change since the previous report; open and click rates; the list of opened emails [HC-360005926658, upd. 2026-10-22](https://mailsuite.com/hc/en-us/articles/360005926658).
- (V) Email Productivity Report: emails sent, open and click rates, PDFs viewed, a send-time grid, messages per day, time until first open, own response times and top contacts. A "click" counts emails with at least one clicked link, not individual clicks [HC-6902958175901, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/6902958175901).
- (V) The settings page lists every notification type per channel (Desktop and Email): opened, link clicked, PDF viewed, not opened within, no reply within, many opens, reopened after a long time, daily report, campaign report and productivity report [HC-38166429133597, upd. 2026-10-13](https://mailsuite.com/hc/en-us/articles/38166429133597). The mobile app article also names "Open Spike Alerts" and "Revival Alerts" [HC-37830054516509, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/37830054516509).

**Implication for MailPulse**

- (I) PLAN has FOLLOW_UP (48 h), OPEN_SPIKE (3 opens in 60 minutes) and REVIVAL (7 days) and leaves no-reply alerts for Phase 6. Mailsuite treats "no reply" as a core free reminder, so consider moving reply detection earlier. It needs either the extension watching Gmail threads (works only while Gmail is open) or Gmail API access (restricted scopes).
- (I) Let the owner pick any follow-up interval, offer snooze and "never for this contact", and count from the real send time (scheduled sends).
- (I) Ignore automatic, self and duplicate events in the spike and revival rules, and name the alerts in our own words (PLAN's OPEN_SPIKE is close to the app's "Open Spike Alerts"; keep it internal).

### 2.7 Notifications: channels and delivery

**What Mailsuite says**

- (V) Channels: desktop notifications, email alerts, push notifications on phones (only through the Mailtrack app), and check marks inside the Gmail phone app [HC-360005940977, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005940977), [HC-360005941077, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005941077), [HC-360005940657, upd. 2026-09-30](https://mailsuite.com/hc/en-us/articles/360005940657), [HC-360005926698, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005926698).
- (V) Desktop notifications are on by default and can be set per email in the compose menu. Chrome must allow notifications for mailsuite.com, and Windows Focus Assist, Do Not Disturb or the Windows notification settings can block them. Each notification offers "mute this conversation" and "mute all" [HC-360005940977, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005940977). (I) Allowing the mailsuite.com site suggests web notifications from that site rather than notifications from the extension itself.
- (V) Email alerts are sent only for the first open of each email; there are no cooldowns, limits or quiet hours [HC-360005941077, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005941077).
- (V) Notification settings apply only to emails sent after the change. Older emails keep the settings they were sent with, so alerts can continue after switching them off [HC-360005941077, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005941077), [HC-360005927758, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005927758).
- (V) Alerts come from notification@mailsuite.com and reminders from reminders@mailsuite.com; reports have their own senders. They may land in Gmail's Promotions tab [HC-360005927838, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360005927838), [HC-360005941457, upd. 2026-10-26](https://mailsuite.com/hc/en-us/articles/360005941457).
- (V) One stated reason for the Gmail permission is to "add open notifications to your Gmail inbox"; the check marks in the Gmail phone app are Gmail labels that Mailsuite updates [HC-360005926458, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005926458). (I) Some alerts are probably inserted into the mailbox through the Gmail API rather than delivered by normal email.
- (V) Campaign notifications are off by default and are chosen per campaign [HC-360005941477, upd. 2026-10-15](https://mailsuite.com/hc/en-us/articles/360005941477).

**Implication for MailPulse**

- (I) PLAN's 30-second polling with Chrome notifications works only while Chrome runs on the PC, which is acceptable for one owner. A phone channel would need another public endpoint or a third-party push service, which CLAUDE.md says needs the owner's approval first.
- (I) Decide on purpose whether notification settings are fixed per email at send time (Mailsuite) or read at event time (PLAN's single `settings` row). Event time is simpler and avoids "I switched it off but still get alerts".
- (I) PLAN notifies every counted open, Mailsuite's email alerts only the first. Offer both, plus mute per email.

### 2.8 Replies and forwards

**What Mailsuite says**

- (V) Forwards are not identified, for technical reasons and because it "could be classed as spying". Opens by people the email was forwarded to are credited to the original recipient, and many opens in a short time suggest a forward [HC-360005927698, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360005927698), [HC-360005927198, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005927198). The same applies to tracked PDFs [HC-4419299570065, upd. 2026-10-15](https://mailsuite.com/hc/en-us/articles/4419299570065).
- (V) Quoted pixels: see 2.3. The blog adds that in desktop Gmail with the extension running, Mailtrack recognises its own pixel inside a received reply and stops that request; in other mail apps a small number of self-opens remain [Blog-Reliable].
- (V) Replies feed several features: the "Active" label, no-reply reminders, response-time statistics and the "unreliable" warning [HC-360005941697, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005941697), [HC-360005927378, upd. 2026-10-26](https://mailsuite.com/hc/en-us/articles/360005927378), [HC-360005926658, upd. 2026-10-22](https://mailsuite.com/hc/en-us/articles/360005926658), [Blog-Reliable]. (I) How replies are detected is not documented; reading threads through the Gmail API is the likely method.
- (V) When a campaign keeps only one copy in Sent, replies start a new thread per recipient [HC-360005941477, upd. 2026-10-15](https://mailsuite.com/hc/en-us/articles/360005941477).

**Implication for MailPulse**

- (I) Self-view reports must cover every MailPulse token visible in a thread, including tokens quoted in received replies (PLAN layer L2 already says so).
- (I) PLAN's removal of old pixels from the quoted part at send time goes further than anything Mailsuite documents. Keep it: it stops old pixels being sent to recipients again.
- (I) If reply detection is added, link replies to tracked emails by Gmail thread ID and the In-Reply-To and References headers.
- (I) Show a "possibly forwarded" hint when counted opens pass a threshold or come from different proxy families.

### 2.9 Undo Send, scheduling, confidential and plain-text mode, self-only, drafts, mobile, accounts, Workspace

**What Mailsuite says**

- (V) Undo Send and drafts: no help article mentions them.
- (V) Scheduled send: Gmail's own scheduled send is trackable (2023 article) [HC-360005941657, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005941657). Mailsuite also has its own scheduler with a "Mailsuite scheduled" folder that appears only while something is queued [HC-25563134735773, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/25563134735773). Per-recipient tracking does not work for scheduled emails [HC-360005926418, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005926418), and a cancelled scheduled campaign goes back to Drafts [HC-360005941477, upd. 2026-10-15](https://mailsuite.com/hc/en-us/articles/360005941477).
- (V) Confidential mode: tracking works because the pixel can still be added; it may interfere with multi-recipient emails, campaigns and document tracking [HC-4651162015505, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/4651162015505).
- (V) Plain-text mode cannot be tracked; a pop-up warns before sending. Security extensions such as Kaspersky can make the pop-up appear wrongly [HC-360005927258, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005927258), [HC-360005928198, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360005928198).
- (V) Emails only to yourself are not tracked, with a warning [HC-360005927358, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005927358).
- (V) Gmail phone app: emails sent from it are not tracked unless the add-on is used. The add-on works per message ("Insert from Mailtrack", then "Track email"), tracks opens only, needs the desktop extension, has no push notifications, does not run on tablets and needs Conversation view. The Mailtrack app tracks every email, sends push notifications and tracks each recipient [HC-360005942257, upd. 2026-10-19](https://mailsuite.com/hc/en-us/articles/360005942257), [HC-360005926638, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005926638), [HC-360009967337, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360009967337), [HC-360017593198, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360017593198), [HC-360005941957, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005941957).
- (V) Check marks inside the Gmail phone app need a dashboard setting and Conversation view, and only appear for emails sent from a computer after the setting is on [HC-360005926698, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005926698).
- (V) Multiple accounts: each Gmail account is connected separately; emails sent from that account's "Send mail as" addresses are tracked; delegated accounts cannot be used; Mailtrack can be switched off for one account from its Gmail menu; every computer and browser needs the extension [HC-360005928078, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005928078), [HC-360005941837, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005941837), [HC-4420404730897, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/4420404730897), [HC-360005927398, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005927398), [HC-360005942257, upd. 2026-10-19](https://mailsuite.com/hc/en-us/articles/360005942257).
- (V) Google Workspace: an admin can install the Marketplace app for the organisation (it can take up to 24 hours), but each user still needs the Chrome extension [HC-360005926898, upd. 2026-10-26](https://mailsuite.com/hc/en-us/articles/360005926898). Google's Advanced Protection blocks Mailtrack [HC-360005928178, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005928178); Virtru encryption breaks the tracking code [HC-360005928338, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005928338); other extensions such as Mixmax, Streak, GMass, Boomerang, uBlock Origin, Ghostery and Kaspersky can conflict [HC-360005927858, upd. 2026-10-19](https://mailsuite.com/hc/en-us/articles/360005927858).
- (V) Other limits: Chrome and Chromium-based browsers only, not Safari [HC-360005940617, upd. 2026-10-20](https://mailsuite.com/hc/en-us/articles/360005940617), [HC-360005941777, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005941777); incognito needs "Allow in Incognito" [HC-360005942337, upd. 2026-10-26](https://mailsuite.com/hc/en-us/articles/360005942337); Chrome's "delete site data on close" makes Mailtrack switch itself off [HC-360005942277, upd. 2026-10-26](https://mailsuite.com/hc/en-us/articles/360005942277); emails sent before install cannot be tracked [HC-360005941417, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005941417); Conversation view off and the reading pane on are supported but not recommended [HC-360005928218, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005928218), [HC-360005942157, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005942157).

**Implication for MailPulse**

- (I) PLAN §4.1 already covers Undo Send (CANCELLED plus adoption), scheduled send and drafts (DRAFT rows purged). Mailsuite gives no guidance here, so Spike 1 is our only evidence.
- (I) Re-check PLAN's "skip tracking in confidential mode": Mailsuite tracks these emails. Test what Gmail and non-Gmail recipients actually load.
- (I) Decide what the extension does in a delegated mailbox (Mailsuite refuses it), and give the self-only check the full alias list.
- (I) Expect conflicts with other Gmail extensions; the owner should not run a second tracker at the same time.

### 2.10 Data privacy and security

**What Mailsuite says**

- (V) Sign-in shares the user's name, profile picture and email address. The Gmail permission reads "Read, compose, send, and permanently delete all your email from Gmail". Reasons given: sending (add the pixel, then send on the user's behalf), making per-recipient copies, deleting extra copies, adding notifications to the inbox, and labels for phone check marks. The extension also asks for access to mail.google.com, googleusercontent.com and mailsuite.com [HC-360005926458, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005926458).
- (V) Google classes that permission (`https://mail.google.com/`) as Restricted; `gmail.send` on its own is Sensitive; only the full scope allows permanent deletion [Google-Scopes].
- (V) The Gmail phone add-on is a separate Google app with its own permissions, so Mailsuite can appear twice in the Google account [HC-360005941377, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005941377).
- (V) No person at Mailsuite reads email, and bodies are not stored [HC-360005940597, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005940597), [HC-360013806978, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360013806978). The privacy policy says message content is handled only temporarily, during transmission, until delivery [Privacy-Policy] §3.2.
- (V) Recipient data processed: email address, subject, send time, open confirmation and open history (count, date, time), number, text and URL of links, click history, the IP address, browser and OS of whoever clicked a link or downloaded a document, documents, signatures, unsubscribes and poll answers [Privacy-Policy] §3.2. Mailtrack does not report recipients' IP addresses, devices or locations [Blog-Reliable], and AI integrations never receive the IP address, country or device of whoever opened an email [Privacy-Policy] §7.4.
- (V) Storage and security: an AWS virtual private cloud in Ireland, AES-256 at rest, TLS 1.2 in transit, AWS WAF, secrets in Vault, multi-factor login for staff, and servers rebuilt on every deploy [HC-360013806978, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360013806978), [Whitepaper].
- (V) Retention: no period is published; data is kept for the length of the contract and for legal periods [Privacy-Policy] §2.2–2.3.
- (V) Deletion: "Delete account" removes all data [HC-360005940557, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005940557); removing access in the Google account does not delete the Mailsuite account [HC-10464388871069, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/10464388871069); granting access again does not delete history [HC-39349809760157, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/39349809760157); a recipient's data can be deleted, or the recipient unsubscribed, from the privacy settings or MyCRM [HC-19470111938461, upd. 2026-10-26](https://mailsuite.com/hc/en-us/articles/19470111938461). Deleting one email's data: see Conflicts.
- (V) GDPR: Mailsuite is an EU company. It is the controller for account data and a processor for recipient data; the sender is the controller, needs a legal basis and must answer recipients' requests; the privacy policy serves as the data processing agreement; recipients are told to contact the sender [HC-360005926818, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360005926818), [HC-19342668999581, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/19342668999581), [HC-19342390516509, upd. 2026-10-26](https://mailsuite.com/hc/en-us/articles/19342390516509), [HC-360005941017, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360005941017). The policy notes that purely household activity is outside the GDPR [Privacy-Policy] §3.7.
- (V) Recipient-side controls: Mailsuite adds an unsubscribe link to emails by default, and once a recipient unsubscribes, the sender cannot email them from Gmail at all while Mailtrack is installed, even with tracking off [HC-19469384628253, upd. 2026-10-26](https://mailsuite.com/hc/en-us/articles/19469384628253), [HC-37621684759581, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/37621684759581). Recipients can avoid tracking by turning images off [HC-10495982191261, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/10495982191261).
- (V) Audits: Mailsuite says it passes Google's yearly security assessment [HC-360013806978, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360013806978), [Security-Center]. The certificate it links to as the latest is an App Defense Alliance CASA Tier 2 validation for "MailTrack", issued 2024-02-27 and expiring 2025-02-27 [CASA-Cert]. The whitepaper says the assessment uses CASA, based on OWASP ASVS [Whitepaper]. The Outlook article also claims ISO 27001 certification [HC-8355245699869, upd. 2026-10-13](https://mailsuite.com/hc/en-us/articles/8355245699869).

**Implication for MailPulse**

- (I) MailPulse already avoids email bodies and keeps data on the owner's PC. PLAN D-016 (truncated IP addresses) matches Mailsuite's restraint.
- (I) Add deletion of one email's data and of one contact's data, not only "delete all"; keep `retention_days`.
- (I) The current plan needs no Google OAuth scope at all, which avoids restricted-scope verification and CASA. If Phase 6 adds Gmail API access, note Google's rule that refresh tokens of an External app in "Testing" status expire after 7 days when Gmail scopes are requested [Google-OAuth].
- (I) Not legal advice: emailing business contacts may not count as "purely household" activity. LIMITATIONS.md already flags consent rules.

### 2.11 Turning tracking off

**What Mailsuite says**

- (V) For one email: in the compose menu, untick "Track email opens". No pixel is added, but the email is still "sent through Mailsuite", and tracked links or documents in it are still tracked [HC-360005927898, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005927898), [HC-360005940697, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005940697).
- (V) For all emails: switch off "Track emails by default" in the tracking settings; link tracking has its own default switch [HC-360005940697, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005940697), [HC-38166429133597, upd. 2026-10-13](https://mailsuite.com/hc/en-us/articles/38166429133597).
- (V) For one Gmail account: untick "Mailtrack enabled" in the Gmail menu [HC-360005927398, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005927398).
- (V) There is no list of recipients who are never tracked; users must switch tracking off per email, and Mailsuite treats such a list as a feature request [HC-39475516279581, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/39475516279581).

**Implication for MailPulse**

- (I) Offer per-email, global and per-account switches (PLAN has the first two) and add an "always exclude" list of addresses and domains; Mailsuite lacks it and it is cheap.

### 2.12 Document and PDF tracking; campaigns

**What Mailsuite says**

- (V) Only PDFs. The file is uploaded and inserted into the email as a link (plain link, link with icon, or button), not as an attachment. Options: allow download or not, a "Confidential" watermark, an access expiry date and time (in the account's time zone), make it signable, and page-by-page analytics [HC-4419299570065, upd. 2026-10-15](https://mailsuite.com/hc/en-us/articles/4419299570065), [HC-360012971678, upd. 2026-10-15](https://mailsuite.com/hc/en-us/articles/360012971678), [HC-9840753166493, upd. 2026-10-15](https://mailsuite.com/hc/en-us/articles/9840753166493).
- (V) Analytics: when it was viewed, for how long, how many pages and which ones, the percentage viewed, and whether it was downloaded; desktop and email notifications are available [HC-4419299570065, upd. 2026-10-15](https://mailsuite.com/hc/en-us/articles/4419299570065), [HC-360012971678, upd. 2026-10-15](https://mailsuite.com/hc/en-us/articles/360012971678).
- (V) Views from forwarded emails are credited to the original recipient; links shared outside Gmail show an "anonymous viewer" [HC-4419299570065, upd. 2026-10-15](https://mailsuite.com/hc/en-us/articles/4419299570065), [HC-39322317257117, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/39322317257117).
- (V) "Delivery certificates" are PDFs with the send time, subject, recipients, a message ID and the tracking history of one email [HC-4407885306513, upd. 2026-10-15](https://mailsuite.com/hc/en-us/articles/4407885306513).
- (V) Campaigns send one tracked copy per recipient through the user's Gmail, and each recipient sees only their own address. Gmail's own sending limit applies, failed sends are not retried and show as soft bounces, and an "only one copy in Sent" option moves the other copies to Trash, after which replies start a new thread per recipient [HC-360005941477, upd. 2026-10-15](https://mailsuite.com/hc/en-us/articles/360005941477), [HC-37597265260957, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/37597265260957), [HC-37659030335261, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/37659030335261).

**Implication for MailPulse**

- (I) Out of scope for v1 (PLAN Phase 6). A PDF viewer would need a third public route, which breaks the "only /t and /c" rule; record that decision before starting.
- (I) If per-recipient sending is ever built, stay inside Gmail's daily limits and keep sending through the owner's own Gmail account.

## 3. Conflicts with our assumptions

Between Mailsuite's behaviour and the MailPulse plan:

1. **Confidential mode.** PLAN skips tracking in confidential mode; Mailsuite says tracking works there [HC-4651162015505, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/4651162015505). Test it in Spike 1 before giving up those emails.
2. **No-reply reminders.** PLAN leaves them for Phase 6; Mailsuite treats them as a core free feature [HC-360005927378, upd. 2026-10-26](https://mailsuite.com/hc/en-us/articles/360005927378). They need reply detection, which our plan does not yet have.
3. **Self-opens on the phone.** Mailsuite closes this gap only with its own mobile email app. MailPulse has no equivalent, so phone self-opens remain (as LIMITATIONS.md says).
4. **Notification policy.** Mailsuite emails only the first open and fixes settings per email at send time; PLAN notifies every counted open with the current settings. Both are valid, but the choice should be deliberate.
5. **Device details.** PLAN stores `client`, `device`, `os` and `country`; Mailsuite dropped device details as unreliable and does not report IP, device or location [HC-360005928238, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005928238), [Blog-Reliable]. Show them only for direct requests.
6. **Patent.** Replacing the Sent copy is patented until about 2036 [Patent]. PLAN does not do it; keep it that way.
7. **"Uncertain" state.** Mailsuite warns when an open status may be unreliable; PLAN has no such state.
8. **Thread marks (D-026).** The help center does not say which email in a thread the check marks describe, so D-026 cannot be checked against Mailsuite's documentation.

Inside Mailsuite's own sources:

9. **Deleting one email's data:** "not possible" [HC-360005928378, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360005928378) (text changed 2026-10-14) versus a "Delete email data" option [HC-19470111938461, upd. 2026-10-26](https://mailsuite.com/hc/en-us/articles/19470111938461) (text changed 2026-10-26).
10. **Group tracking from a phone:** "does not work" [HC-360005926418, upd. 2026-10-08](https://mailsuite.com/hc/en-us/articles/360005926418) versus "works in the Mailtrack app" [HC-4650746650641, upd. 2026-10-28](https://mailsuite.com/hc/en-us/articles/4650746650641), [HC-360009967337, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/360009967337).
11. **Multi-recipient emails:** sent as one copy [HC-6902958175901, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/6902958175901) (2024) versus one copy per recipient [HC-360005926458, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005926458) (2026); probably depends on whether per-recipient tracking is active.
12. **Who sends the email:** "Mailtrack doesn't actually send your emails" [HC-5740931959953, upd. 2026-10-14](https://mailsuite.com/hc/en-us/articles/5740931959953) versus "send it on your behalf" [HC-360005926458, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005926458) and "still sent through Mailsuite" [HC-360005927898, upd. 2026-10-21](https://mailsuite.com/hc/en-us/articles/360005927898). The privacy policy says content passes through Mailsuite until delivery. (I) Mailsuite most likely hands the message to Gmail itself, so delivery is still Gmail's.
13. **Security certificate:** the file linked as "the latest security audit certificate" expired on 2025-02-27 [CASA-Cert].

## 4. Open questions to verify hands-on

Spike numbers refer to PLAN §10.

1. With our no-store headers, does every view in Gmail on the web and in the Gmail app reach `/t/`, and with which user agent and delay? (Spike 2)
2. Can the extension see Gmail's proxied pixel URL (our host after `#`) early enough to block it or report a self-view? (Spike 3)
3. Does Gmail on the web load images inside collapsed quoted text of a reply? (Spike 3)
4. Undo Send, scheduled send and "Send & archive": does the pixel survive, and is exactly one email record kept? Mailsuite documents none of this. (Spike 1)
5. Confidential mode: is the pixel delivered and loaded for Gmail and non-Gmail recipients? (Spike 1)
6. Gmail clipping: confirm that a pixel near the top survives a message over about 102 KB. A Mailsuite blog post warns that a pixel at the end is lost when Gmail clips [Blog-Pixel].
7. Apple MPP and Microsoft 365: timing, IP ranges, user agents and HEAD versus GET for prefetches and Safe Links scans. (Spike 2)
8. Which receiving services hide images by default today (Outlook.com, Yahoo, Proton Mail, iCloud)? This feeds the "uncertain" list.
9. An email to the owner plus other people (for example Cc to the owner's alias): track it or not? Mailsuite documents only "to yourself only".
10. In a Mailtrack group email with per-recipient tracking active, does each recipient's copy list everyone in To and Cc, and do the Message-IDs differ? This shows how per-recipient copies are built (for understanding only; we do not copy the method).
11. What do Mailtrack's own pixel and link URLs look like in "Show original" (domain, token length, headers)?
12. How fast do Mailtrack's desktop and email alerts arrive after an open, and are desktop notifications sent for every open or only the first?
13. Hot-conversation and revival thresholds are unpublished; define ours and test them with a fixed Clock.
14. Does Mailtrack's green dot for incoming tracked emails (or a similar tool) flag MailPulse emails for recipients who use it?
15. Mailsuite's blog says a 2026 Gmail change reduced recorded opens for some senders (reported by Substack). Check current Gmail image behaviour before trusting baselines.
16. If Gmail API access is ever added: confirm the OAuth publishing status and the 7-day refresh-token rule in practice.

## 5. Sources (accessed 2026-10-29)

Help center articles. Links use the short form, which redirects to the full article URL. "Updated" is the date printed on the page; "Text changed" is the last edit of the article content (Zendesk `edited_at`).

| Article | Title | Updated | Text changed |
| --- | --- | --- | --- |
| [HC-360005926978](https://mailsuite.com/hc/en-us/articles/360005926978) | Mailtrack open alerts received immediately after sending an email | 2026-10-21 | 2026-10-21 |
| [HC-37597504227485](https://mailsuite.com/hc/en-us/articles/37597504227485) | Why do Mailtrack link clicks sometimes register automatically, right after sending? | 2026-10-08 | 2026-09-29 |
| [HC-360005926458](https://mailsuite.com/hc/en-us/articles/360005926458) | Why is it necessary for Mailsuite (Mailtrack) to access, delete and send my emails? | 2026-10-21 | 2026-10-21 |
| [HC-360005926418](https://mailsuite.com/hc/en-us/articles/360005926418) | Tracking group emails with Mailtrack | 2026-10-08 | 2026-09-29 |
| [HC-4650746650641](https://mailsuite.com/hc/en-us/articles/4650746650641) | Mailtrack isn't showing who's opened mails sent to more than one person | 2026-10-28 | 2026-10-28 |
| [HC-360005927358](https://mailsuite.com/hc/en-us/articles/360005927358) | Self-open notifications: Emails to yourself are NOT tracked | 2026-10-08 | 2026-07-27 |
| [HC-37572074929437](https://mailsuite.com/hc/en-us/articles/37572074929437) | Why does Mailtrack sometimes count my own opening of a reply as the recipient's open? | 2026-10-08 | 2026-09-29 |
| [HC-360005928238](https://mailsuite.com/hc/en-us/articles/360005928238) | Why is device information no longer showing in the tooltip? | 2026-10-08 | 2020-02-18 |
| [HC-360005941037](https://mailsuite.com/hc/en-us/articles/360005941037) | Why is Mailtrack telling me that the recipient's mail service might not allow tracking? | 2026-10-08 | 2026-09-29 |
| [HC-360005941217](https://mailsuite.com/hc/en-us/articles/360005941217) | How accurate and reliable is Mailtrack's email tracking technology? | 2026-10-14 | 2026-10-14 |
| [HC-360005927378](https://mailsuite.com/hc/en-us/articles/360005927378) | Monitor Reply | 2026-10-26 | 2026-10-26 |
| [HC-360005926798](https://mailsuite.com/hc/en-us/articles/360005926798) | Mailtrack Not Opened reminders | 2026-10-21 | 2026-10-21 |
| [HC-360005926658](https://mailsuite.com/hc/en-us/articles/360005926658) | Mailtrack Daily Report | 2026-10-22 | 2026-10-22 |
| [HC-360005941077](https://mailsuite.com/hc/en-us/articles/360005941077) | Mailtrack open notifications via email | 2026-10-21 | 2026-10-21 |
| [HC-360005927758](https://mailsuite.com/hc/en-us/articles/360005927758) | Mailtrack email alerts disabled but still being received | 2026-10-08 | 2026-09-28 |
| [HC-360005927698](https://mailsuite.com/hc/en-us/articles/360005927698) | Can Mailtrack track forwarded emails? | 2026-10-14 | 2026-10-14 |
| [HC-360005942257](https://mailsuite.com/hc/en-us/articles/360005942257) | Emails not tracked by Mailtrack (grey checkmarks) | 2026-10-19 | 2026-09-29 |
| [HC-4651162015505](https://mailsuite.com/hc/en-us/articles/4651162015505) | Does Mailtrack work with confidential mode in Gmail? | 2026-10-08 | 2026-09-29 |
| [HC-360013806978](https://mailsuite.com/hc/en-us/articles/360013806978) | Is my data secure at Mailsuite (Mailtrack)? | 2026-10-21 | 2026-10-21 |
| [HC-360013900257](https://mailsuite.com/hc/en-us/articles/360013900257) | How to track email opens with Mailtrack | 2026-10-21 | 2026-10-21 |
| [HC-360005942237](https://mailsuite.com/hc/en-us/articles/360005942237) | What is the difference between an Open and a Click? | 2026-10-14 | 2026-10-14 |
| [HC-360005926758](https://mailsuite.com/hc/en-us/articles/360005926758) | How to use Mailtrack: Sending your 1st tracked email | 2026-10-14 | 2026-10-14 |
| [HC-360009967337](https://mailsuite.com/hc/en-us/articles/360009967337) | Mailtrack for iPhone and Android | 2026-10-14 | 2026-10-14 |
| [HC-360005941697](https://mailsuite.com/hc/en-us/articles/360005941697) | See multiple email opens: Mailtrack's Active email indicator | 2026-10-08 | 2026-09-29 |
| [HC-360005940977](https://mailsuite.com/hc/en-us/articles/360005940977) | Mailtrack real-time notifications | 2026-10-21 | 2026-10-21 |
| [HC-360005941437](https://mailsuite.com/hc/en-us/articles/360005941437) | Mailtrack's green checkmarks seem to be delayed | 2026-10-08 | 2026-09-28 |
| [HC-360005941337](https://mailsuite.com/hc/en-us/articles/360005941337) | Mailtrack's incoming tracked emails indicator | 2026-10-21 | 2026-10-21 |
| [HC-37659074983709](https://mailsuite.com/hc/en-us/articles/37659074983709) | Why can't Mailtrack track emails sent to a Google Group? | 2026-10-08 | 2026-09-29 |
| [HC-7200418829073](https://mailsuite.com/hc/en-us/articles/7200418829073) | Split into individual emails | 2026-10-15 | 2026-10-15 |
| [HC-6902958175901](https://mailsuite.com/hc/en-us/articles/6902958175901) | Email Productivity Report | 2026-10-14 | 2024-12-10 |
| [HC-37659030335261](https://mailsuite.com/hc/en-us/articles/37659030335261) | Why are my campaign emails moved to Trash after sending? | 2026-10-08 | 2026-07-16 |
| [HC-360005927798](https://mailsuite.com/hc/en-us/articles/360005927798) | Mailtrack is saying that an unopened email has been opened | 2026-10-08 | 2020-02-25 |
| [HC-360005940677](https://mailsuite.com/hc/en-us/articles/360005940677) | Mailtrack shows an email opened an unusual number of times | 2026-10-08 | 2026-09-28 |
| [HC-360005927478](https://mailsuite.com/hc/en-us/articles/360005927478) | Why am I getting Mailtrack notifications from a family member or friend within my account? | 2026-10-08 | 2020-02-18 |
| [HC-10495982191261](https://mailsuite.com/hc/en-us/articles/10495982191261) | How to opt out and avoid being tracked by email tracking services | 2026-10-08 | 2024-10-15 |
| [HC-360005941097](https://mailsuite.com/hc/en-us/articles/360005941097) | My email has been replied to but Mailtrack still says it hasn't been opened | 2026-09-21 | 2020-02-18 |
| [HC-8355245699869](https://mailsuite.com/hc/en-us/articles/8355245699869) | How to Use Mailsuite in Outlook | 2026-10-13 | 2026-09-29 |
| [HC-360005927738](https://mailsuite.com/hc/en-us/articles/360005927738) | Using Mailtrack for email tracking in Outlook and other clients | 2026-10-14 | 2026-10-14 |
| [HC-360005941137](https://mailsuite.com/hc/en-us/articles/360005941137) | Link click tracking with Mailtrack | 2026-10-15 | 2026-10-15 |
| [HC-360005927598](https://mailsuite.com/hc/en-us/articles/360005927598) | Mailtrack link tracking isn't working | 2026-10-21 | 2026-10-21 |
| [HC-360005928158](https://mailsuite.com/hc/en-us/articles/360005928158) | 'Invalid URL' error when clicking on tracked link | 2026-10-26 | 2026-10-26 |
| [HC-360005928438](https://mailsuite.com/hc/en-us/articles/360005928438) | Does Mailtrack work with ad blockers? | 2026-10-14 | 2026-10-14 |
| [HC-360005942177](https://mailsuite.com/hc/en-us/articles/360005942177) | Is Mailtrack compatible with Ghostery? | 2026-10-14 | 2026-10-14 |
| [HC-39519128879133](https://mailsuite.com/hc/en-us/articles/39519128879133) | How to set up a custom domain for Mailtrack link tracking | 2026-10-15 | 2026-10-15 |
| [HC-37923559830557](https://mailsuite.com/hc/en-us/articles/37923559830557) | Does custom domain tracking apply to email opens and PDF tracking? | 2026-10-08 | 2026-09-29 |
| [HC-360005927658](https://mailsuite.com/hc/en-us/articles/360005927658) | Link click email alerts in your inbox | 2026-10-15 | 2026-10-15 |
| [HC-360005927198](https://mailsuite.com/hc/en-us/articles/360005927198) | Mailtrack Hot Conversations alert | 2026-10-21 | 2026-10-21 |
| [HC-360005940877](https://mailsuite.com/hc/en-us/articles/360005940877) | Mailtrack Revival conversation alert | 2026-10-22 | 2026-10-22 |
| [HC-38166429133597](https://mailsuite.com/hc/en-us/articles/38166429133597) | A guide to your Mailsuite settings | 2026-10-13 | 2026-10-13 |
| [HC-37830054516509](https://mailsuite.com/hc/en-us/articles/37830054516509) | How to use the Mailtrack mobile app for iPhone and Android | 2026-10-08 | 2026-09-29 |
| [HC-360005940657](https://mailsuite.com/hc/en-us/articles/360005940657) | Mailtrack real-time notifications on your phone | 2026-09-30 | 2026-09-29 |
| [HC-360005926698](https://mailsuite.com/hc/en-us/articles/360005926698) | How to add Mailtrack's check marks to your phone | 2026-10-21 | 2026-10-21 |
| [HC-360005927838](https://mailsuite.com/hc/en-us/articles/360005927838) | I'm no longer receiving Mailtrack email alerts | 2026-10-14 | 2026-10-14 |
| [HC-360005941457](https://mailsuite.com/hc/en-us/articles/360005941457) | I want to receive Mailtrack email alerts in my Gmail 'Primary' tab | 2026-10-26 | 2026-10-26 |
| [HC-360005941477](https://mailsuite.com/hc/en-us/articles/360005941477) | Mailtrack Campaigns | 2026-10-15 | 2026-10-15 |
| [HC-4419299570065](https://mailsuite.com/hc/en-us/articles/4419299570065) | Document Analytics | 2026-10-15 | 2026-10-15 |
| [HC-360005941657](https://mailsuite.com/hc/en-us/articles/360005941657) | Does Mailtrack work with emails scheduled to be sent later? | 2026-10-08 | 2023-07-05 |
| [HC-25563134735773](https://mailsuite.com/hc/en-us/articles/25563134735773) | Scheduled email tracking with Mailtrack | 2026-10-14 | 2026-10-14 |
| [HC-360005927258](https://mailsuite.com/hc/en-us/articles/360005927258) | Can I track emails in plain text mode with Mailtrack? | 2026-10-08 | 2026-09-29 |
| [HC-360005928198](https://mailsuite.com/hc/en-us/articles/360005928198) | Plain text mode pop-up keeps appearing | 2026-10-14 | 2026-10-14 |
| [HC-360005926638](https://mailsuite.com/hc/en-us/articles/360005926638) | Send tracked emails from your smartphone with Mailtrack | 2026-10-08 | 2026-09-28 |
| [HC-360017593198](https://mailsuite.com/hc/en-us/articles/360017593198) | Mailtrack extension vs Mailtrack add-on: What's the difference? | 2026-10-14 | 2026-10-14 |
| [HC-360005941957](https://mailsuite.com/hc/en-us/articles/360005941957) | The Gmail app 'freezes' when I try to send a tracked email from the Gmail app on my phone | 2026-10-08 | 2020-02-25 |
| [HC-360005928078](https://mailsuite.com/hc/en-us/articles/360005928078) | Can I use a single Mailtrack subscription with multiple email addresses? | 2026-10-21 | 2026-10-21 |
| [HC-360005941837](https://mailsuite.com/hc/en-us/articles/360005941837) | Does Mailtrack work with email aliases? | 2026-10-08 | 2026-09-29 |
| [HC-4420404730897](https://mailsuite.com/hc/en-us/articles/4420404730897) | Can I use Mailtrack with a delegated Gmail account? | 2026-10-08 | 2022-02-09 |
| [HC-360005927398](https://mailsuite.com/hc/en-us/articles/360005927398) | Disabling Mailtrack for a particular email account | 2026-10-08 | 2023-02-13 |
| [HC-360005926898](https://mailsuite.com/hc/en-us/articles/360005926898) | Installing Mailtrack using Google Workspace | 2026-10-26 | 2026-10-26 |
| [HC-360005928178](https://mailsuite.com/hc/en-us/articles/360005928178) | Is Mailtrack compatible with Google's Advanced Protection? | 2026-10-08 | 2020-02-18 |
| [HC-360005928338](https://mailsuite.com/hc/en-us/articles/360005928338) | Is Mailtrack compatible with Virtru? | 2026-10-08 | 2020-02-18 |
| [HC-360005927858](https://mailsuite.com/hc/en-us/articles/360005927858) | Mailtrack incompatibility with other extensions | 2026-10-19 | 2026-10-19 |
| [HC-360005940617](https://mailsuite.com/hc/en-us/articles/360005940617) | How to install Mailtrack | 2026-10-20 | 2026-10-20 |
| [HC-360005941777](https://mailsuite.com/hc/en-us/articles/360005941777) | Is Mailtrack compatible with Safari? | 2026-10-08 | 2020-02-18 |
| [HC-360005942337](https://mailsuite.com/hc/en-us/articles/360005942337) | Using Mailtrack in incognito mode | 2026-10-26 | 2026-10-26 |
| [HC-360005942277](https://mailsuite.com/hc/en-us/articles/360005942277) | Mailtrack disables itself | 2026-10-26 | 2026-10-26 |
| [HC-360005941417](https://mailsuite.com/hc/en-us/articles/360005941417) | Can I track emails sent before I installed Mailtrack? | 2026-10-08 | 2026-09-29 |
| [HC-360005928218](https://mailsuite.com/hc/en-us/articles/360005928218) | Will Mailtrack work if Conversation View is disabled in my Gmail settings? | 2026-10-08 | 2026-09-29 |
| [HC-360005942157](https://mailsuite.com/hc/en-us/articles/360005942157) | Will Mailtrack work if I use a preview pane in Gmail? | 2026-10-08 | 2026-09-29 |
| [HC-360005941377](https://mailsuite.com/hc/en-us/articles/360005941377) | Mailtrack listed twice as a third-party app with account access | 2026-10-08 | 2020-02-18 |
| [HC-360005940597](https://mailsuite.com/hc/en-us/articles/360005940597) | Does anyone at Mailsuite (Mailtrack) access the content of my emails? | 2026-10-08 | 2026-09-28 |
| [HC-360005940557](https://mailsuite.com/hc/en-us/articles/360005940557) | Delete my account and all personal data from Mailtrack | 2026-10-21 | 2026-10-21 |
| [HC-10464388871069](https://mailsuite.com/hc/en-us/articles/10464388871069) | How to remove or block Mailsuite (Mailtrack) access to your Gmail account | 2026-10-08 | 2026-09-29 |
| [HC-39349809760157](https://mailsuite.com/hc/en-us/articles/39349809760157) | Will re-authorising Gmail permissions delete my Mailtrack tracking data? | 2026-10-08 | 2026-09-28 |
| [HC-19470111938461](https://mailsuite.com/hc/en-us/articles/19470111938461) | How to Manage Data Deletion Requests from Recipients with Mailsuite | 2026-10-26 | 2026-10-26 |
| [HC-360005926818](https://mailsuite.com/hc/en-us/articles/360005926818) | Is Mailsuite GDPR compliant? | 2026-10-14 | 2026-10-14 |
| [HC-19342668999581](https://mailsuite.com/hc/en-us/articles/19342668999581) | The user of Mailsuite as a data controller under GDPR | 2026-10-08 | 2025-07-14 |
| [HC-19342390516509](https://mailsuite.com/hc/en-us/articles/19342390516509) | How to exercise your data protection rights as recipient? Opt-out, data deletion, etc. | 2026-10-26 | 2026-10-26 |
| [HC-360005941017](https://mailsuite.com/hc/en-us/articles/360005941017) | Need a data privacy agreement (DPA)? | 2026-10-14 | 2026-10-14 |
| [HC-19469384628253](https://mailsuite.com/hc/en-us/articles/19469384628253) | How to Add Unsubscribe Links & Manage Consent Withdrawal with Mailsuite | 2026-10-26 | 2026-10-26 |
| [HC-37621684759581](https://mailsuite.com/hc/en-us/articles/37621684759581) | What happens when you email a recipient who has unsubscribed | 2026-10-08 | 2026-10-05 |
| [HC-360005927898](https://mailsuite.com/hc/en-us/articles/360005927898) | How do I disable Mailtrack open tracking for a particular email? | 2026-10-21 | 2026-10-21 |
| [HC-360005940697](https://mailsuite.com/hc/en-us/articles/360005940697) | Disable Mailtrack email tracking by default | 2026-10-21 | 2026-10-21 |
| [HC-39475516279581](https://mailsuite.com/hc/en-us/articles/39475516279581) | Can I exclude a specific email address from being tracked by Mailtrack? | 2026-10-08 | 2026-09-29 |
| [HC-360012971678](https://mailsuite.com/hc/en-us/articles/360012971678) | How to track when someone opens an email attachment | 2026-10-15 | 2026-10-15 |
| [HC-9840753166493](https://mailsuite.com/hc/en-us/articles/9840753166493) | PDF secure sharing | 2026-10-15 | 2026-10-15 |
| [HC-39322317257117](https://mailsuite.com/hc/en-us/articles/39322317257117) | Why does a shared PDF link show an anonymous viewer instead of the recipient's name? | 2026-10-08 | 2026-09-22 |
| [HC-4407885306513](https://mailsuite.com/hc/en-us/articles/4407885306513) | Mailtrack Delivery Certificates | 2026-10-15 | 2026-10-15 |
| [HC-37597265260957](https://mailsuite.com/hc/en-us/articles/37597265260957) | What happens to a campaign if Gmail's sending limit is reached mid-send? | 2026-10-08 | 2026-07-14 |
| [HC-360005928378](https://mailsuite.com/hc/en-us/articles/360005928378) | Can I delete tracking data for certain emails from the activity dashboard? | 2026-10-14 | 2026-10-14 |
| [HC-5740931959953](https://mailsuite.com/hc/en-us/articles/5740931959953) | Are my emails going to spam because of Mailtrack? | 2026-10-14 | 2026-10-14 |

Other sources:

- Help Center API used to read full article text: https://mailsuite.com/api/v2/help_center/en-us/articles.json (answered by mailtrack.zendesk.com).
- **Blog-Reliable**: Mailsuite blog, "Why Mailtrack Is the Most Reliable Email Tracker for Gmail (and Why No Tracker Is 100% Accurate)", published 2026-08-01, modified 2026-08-04. https://mailsuite.com/blog/why-mailtrack-is-the-most-reliable-email-tracker/
- **Blog-Pixel**: Mailsuite blog, "Email Tracking Pixel Explained", published 2024-03-05, modified 2025-02-04. https://mailsuite.com/blog/google-email-tracking-gmail/
- **Privacy-Policy**: Mailsuite privacy policy, "Last modified: October 2026". https://mailsuite.com/en/privacy
- **Security-Center**: Mailsuite Privacy and Security Center (no date shown). https://mailsuite.com/en/privacy-and-security-center
- **CASA-Cert**: App Defense Alliance CASA statement of validation for MailTrack, issued 2024-02-27, expiring 2025-02-27. https://s3.eu-west-1.amazonaws.com/io.mailtrack.assets/downloads/docs/security_audit_certificate.pdf
- **Whitepaper**: Mailtrack Security Whitepaper, "Last update: 11 may 2023". https://s3.eu-west-1.amazonaws.com/io.mailtrack.assets/downloads/docs/security-whitepaper.pdf
- **Patent**: Google Patents, US10749835B2. https://patents.google.com/patent/US10749835B2/en
- **Google-Scopes**: Google, "Choose Gmail API scopes". https://developers.google.com/workspace/gmail/api/auth/scopes
- **Google-OAuth**: Google, "Using OAuth 2.0 to Access Google APIs" (refresh token expiration). https://developers.google.com/identity/protocols/oauth2
- **lnkroute**: landing page of lnkroute.com, a domain listed in the Mailsuite privacy policy. https://lnkroute.com/en/
- Not found: no Mailsuite source mentions Undo Send. A web search returned only third-party pages, which were not used.

[Blog-Reliable]: https://mailsuite.com/blog/why-mailtrack-is-the-most-reliable-email-tracker/
[Blog-Pixel]: https://mailsuite.com/blog/google-email-tracking-gmail/
[Privacy-Policy]: https://mailsuite.com/en/privacy
[Security-Center]: https://mailsuite.com/en/privacy-and-security-center
[CASA-Cert]: https://s3.eu-west-1.amazonaws.com/io.mailtrack.assets/downloads/docs/security_audit_certificate.pdf
[Whitepaper]: https://s3.eu-west-1.amazonaws.com/io.mailtrack.assets/downloads/docs/security-whitepaper.pdf
[Patent]: https://patents.google.com/patent/US10749835B2/en
[Google-Scopes]: https://developers.google.com/workspace/gmail/api/auth/scopes
[Google-OAuth]: https://developers.google.com/identity/protocols/oauth2
[lnkroute]: https://lnkroute.com/en/
