# Mailsuite (Mailtrack) product inventory for MailPulse

Research date: 2026-10-29. Research only, no implementation.

**How to read this document**

- **Verified** means we read it in a named source. **Inferred** means it is our reasoning from verified facts and is not confirmed by Mailsuite.
- Tags such as [S3] point to the numbered list in section 8.
- Everything is paraphrased. Short quoted phrases are Mailsuite's own labels, quoted only where the exact label matters. MailPulse must use its own names, text, icons and colours; nothing here is meant to be copied into our UI.
- Naming: "Mailtrack" is the original Gmail tracker and brand. "Mailsuite" is the company and the wider suite; Mailtrack has been part of it since 2024 [S2].
- **Scope:** pricing, plan tiers and quotas were skipped at the owner's request. MailPulse is a free, personal, local-only tool, so this document describes what each feature does and how it likely works, not who can buy it.

**Method notes**

- WebFetch failed on the Chrome Web Store and Google Workspace Marketplace pages (redirect loops), so both listings were downloaded directly with curl. chrome-stats.com returned HTTP 403.
- The store page no longer lists permissions. They were read from the extension's own `manifest.json` (version 12.100.1, the same version the store shows), downloaded from Google's public CRX update endpoint and inspected read-only: manifest, bundled config, English UI labels and CSS class names. No code was executed and nothing was reused [S11].

## 1. Key findings for MailPulse

1. **Check marks match our idea, but Mailsuite's own descriptions disagree on the details.** The store and Workspace listings say one check means sent but not opened, two green checks mean opened, and hovering shows when and how many times [S9, S12, S18]. The email-tracking page instead says double checks are grey when delivered and green when opened [S2], and a help article says grey checks mean the email was not tracked [S19]. Placement is documented only for the Sent folder [S2, S18]. The extension's CSS also styles checks in list rows and inside conversations, including collapsed messages (Inferred: thread view too) [S11].
2. **Mailsuite sends mail through its own servers. MailPulse will not.** Help articles say Mailsuite adds the pixel "before delivery" and then sends on the user's behalf, and that an email with open tracking turned off "still goes through Mailsuite" [S27, S28]. This needs the full Gmail permission, shown to users as "Read, compose, send, and permanently delete all your email from Gmail" [S12, S27]. The extension itself asks only for `storage`, `notifications` and `declarativeNetRequestWithHostAccess`, plus host access, and has no `identity` or `oauth2` entry [S11]. Features that depend on server-side sending are out of reach for an extension-only MailPulse that never stores or sends email bodies: per-recipient copies, tracked scheduled send, Gmail label sync and "clean Sent copy" replacement.
3. **Compose controls:** a Mailsuite button next to Send opens a menu. It has a per-email "Track email opens" checkbox and a "Notify me by" section with per-email alert choices [S28, S23, S24]. Link tracking is chosen **per link**: a "Track this link" switch in Gmail's Insert-link dialog or the link hover menu, or an "Insert tracked link" button. There is also a global "Click tracking by default" setting. We found no documented per-email "track links" switch [S29].
4. **Alerts:** desktop alerts fire on every open. Email open alerts fire on the first open. Link-click and PDF-view alerts fire on the first click or view, by desktop and email [S3, S5]. The extension uses Chrome notifications with buttons to mute all alerts of one type or to "mute this conversation". Its config includes a WebSocket endpoint (Inferred: the real-time push channel) [S11].
5. **Follow-ups use both triggers:** "not opened within N hours" and "no reply within N hours", where N is 24, 48 or 72 [S24, S3]. Defaults are set in dashboard settings and can be overridden per email in the compose menu. Reminders arrive by email with snooze and disable links [S24]. Marketing copy is inconsistent (24–48 h, 24–72 h, 72 h) [S2, S5, S9].
6. **Spike and revival alerts both exist.** Mailsuite calls them "Hot Conversation Alerts: multiple opens" and "Old Conversation Revival Alerts" in its feature list, and "Open Spike Alerts" and "Email Revival Alerts" on marketing pages [S3, S1, S5]. They arrive by email, and no thresholds are published [S22, S23]. Separately, a green "Active" label appears in the inbox when a conversation was opened or replied to within the last hour [S25, S11].
7. **Self-opens are blocked in three layers.**
   - (a) A patented "Debeaconizer" replaces the sender's Sent copy with a copy whose pixel is missing or inactive [S32]. This is US 10,749,835 B2, listed by Google Patents as active with an anticipated expiry of 2036-12-30 [S33].
   - (b) The extension blocks image requests for the sender's own pixel in the sender's Gmail tabs, including requests routed through Gmail's image proxy [S11].
   - (c) Emails sent to yourself are not tracked at all [S9, S11].

   Layer (b) maps directly onto an MV3 `declarativeNetRequest` rule. Layer (a) should not be copied without legal review; we have not assessed infringement.
8. **False opens:** Mailsuite claims to tell human opens from automated fetches such as Apple Mail Privacy Protection, security scanners and Microsoft Safe Links for clicks. It marks an "unreliable" open status when a provider blocks images or when a reply arrives with no recorded open [S12, S32, S11]. It admits that cached images can hide repeat opens [S32]. It also lists CRMs that receive BCC copies, and mail clients that preview sent mail, as causes of instant opens [S26].
9. **Per-recipient tracking in group emails** works for up to 50 recipients and not for Google Groups. It is decided at send time, so older emails cannot be tracked per recipient later [S21]. Mechanism (Verified statement): Mailsuite makes identical copies for each recipient, keeps one in Sent and deletes the others [S27, S13]. With one pixel per message, opens cannot be credited to a single recipient; Mailsuite's own blog says the same [S32].
10. **Reports and dashboard.** A Daily Report email shows the previous day's stats and has a "View Full Report" button that opens the dashboard [S20]. Weekly and monthly reports also exist, but their delivery channel is not documented [S3]. The dashboard has:
    - Home, with KPIs and a "Latest activity" feed.
    - Reports: Email tracking (with tabs such as not opened), Link clicks, PDF analytics and My performance.
    - MyCRM contacts, a file list and CSV export [S30].

    A separate productivity view has time filters and period comparison [S6].
11. **Documents:** PDFs are sent as secure tracked links. Mailsuite tracks views, time per page and downloads, and offers access rules, expiry, revoke, a watermark with the recipient's email, and a download on/off switch [S7, S8, S16]. It cannot detect forwarding [S7].
12. **Privacy wording vs. disclosures.** The tracking page says Mailsuite will "never read, store, sell, or share" email content [S2]. The privacy center says bodies are not stored, data sits in AWS Ireland, and Mailsuite uses AES-256, ISO 27001 and a yearly Google assessment [S13]. Even so, the store disclosure says the extension handles "Personally identifiable information" and "Personal communications" [S10]. The blog says no recipient IP, device or location is reported [S32], yet the bundled notification templates have an optional "using {device}" phrase [S11].
13. **Gmail extras beyond tracking:**
    - A Sent-folder filter that shows only last month's unopened sent emails.
    - A green dot on incoming emails that contain tracking.
    - Tracked scheduled send and templates.
    - Campaigns and mail merge.
    - Polls, video messages, certified email and e-signature.
    - AI task tracker, AI dictation and AI spam check [S11, S31, S3].
14. **Mailsuite's own numbers disagree.** The store shows 4.2 stars from 11.8K ratings and 3,000,000 users [S9], but the listing's own description says 4.4 stars from 11,000+ reviews. The home page says 4.5/5 from 11.5K+ reviews [S1], and the Workspace listing says 14 million registered users [S12]. Treat marketing numbers as approximate.

## 2. Per-page summaries

### 2.1 Home page [S1]
- **Product groups:**
  - Insights: Email Tracker, Follow-up Reminders, Email Analytics.
  - Outreach: Campaigns/Mass Email, Mail Merge, Templates, Video Messages.
  - Document Sharing: Document Tracking, Secure Document Sharing, Confidential Watermark, Signature Request.
  - CRM for Gmail.
- **"Additional features" list:**
  - Unlimited tracking.
  - Individual tracking in group emails.
  - Full history of opens and clicks.
  - Instant email and desktop alerts for opens and clicks.
  - Follow-up reminders when an email is not opened or not replied to within 24–72 hours.
  - Open Spike Alerts and Email Revival Alerts.
  - False open prevention (your own views are not counted).
- **Platforms:** Chrome extension, Android and iPhone apps, Gmail mobile add-on, Outlook add-in and a Workspace organization add-on.
- **Social proof:** "+3M users", 4.5/5 from 11.5K+ reviews, trust badges and an ISO 27001 certificate link.
- The page does not describe the Gmail UI (checks, colours, tooltips).

### 2.2 Email tracking [S2]
- Promises "simple double check marks inside Gmail".
- **FAQ:** in the sent folder, every sent email shows double checks: grey means delivered, green means opened. Users also get real-time notifications and a full history per contact.
- **How it works:** a small invisible pixel loads when the email is opened, and the open's time and count are recorded. Email content is not read or stored. Mail is sent from the user's own Gmail account "without routing them through third-party servers". This contrasts with the help center's statement that mail "goes through Mailsuite" [S28].
- **Alerts:** open and click alerts by email and desktop, plus open spike and revival alerts. One section says "no reply after 24–48 hours"; another says "24–72 hours".
- **Group emails:** the page says it shows exactly which recipient opened and when.
- **Privacy:** GDPR, annual Google audit, AES-256 and ISO 27001.
- **Gmail read receipts:** Gmail's own receipts exist only for Workspace accounts, and recipients can decline them.
- **Not covered:** compose toggles, tooltip text, and checks in the inbox or thread view.

### 2.3 Pricing [S3]
Read only for feature names and descriptions used in other sections. Prices, tiers and quotas were skipped at the owner's request.

### 2.4 Follow-up reminders [S5]
- **Alert types:**
  - Email Open Notification: email and desktop, on the first open.
  - Link Click Notifications: email and desktop, on the first click.
  - Not Opened Alerts: email.
  - No-Reply Alerts: email, after 72 h without a reply.
  - Open Spike Alerts: email, when opened several times in a short period.
  - Email Revival Alerts: email, when reopened after a long period.
- **Setup:**
  1. In the dashboard, open "Settings and Privacy", then "Notifications".
  2. Tick the alerts you want and save.
  3. Send as usual.

  Current help articles call the settings area "Settings & account" [S24].
- The FAQ gives examples of "not opened in 24 h" and "no reply in 72 h". A testimonial describes a reminder that offers "follow up or snooze", with 48 or 72 h.

### 2.5 Email analytics [S6]
- **"Email Productivity" metrics:** emails sent, open and click rates, your response time, best sending time (based on first-open times), and PDF views, downloads and view time.
- **Where to find it:** from the Gmail menu or the dashboard's left menu, in a central dashboard with "simple visualizations".
- **Time filters:** last 7 days, last week, this month and last month, with comparison to the previous period.
- **Counting rules:** each recipient counts as one sent email; clicks count emails with at least one click; PDF views count emails with at least one PDF view.
- Push and email notifications for opens, clicks and PDF views.

### 2.6 Document tracking [S7]
- **Flow:**
  1. In Gmail compose, choose Attach > "Add Document", or the "Advanced Document" button in the Mailtrack options.
  2. Pick or upload a PDF.
  3. In the pop-up, set who can access it, when and how; per-recipient page analytics; download permission; expiry; "signable"; and the link name and style.
- **Tracked:** view count, view duration, which pages were viewed and what share of the document, and downloads.
- Forwarding is not detected; views from forwarded copies are credited to the original recipient. Documents are added one at a time.
- Real-time mobile push and email notifications, with analytics in the inbox and the dashboard. No file-type or size limits stated (only PDF is mentioned).

### 2.7 Document sharing [S8]
- Works like attaching a file: upload, choose security settings and send. Several documents can go in one email.
- **Controls:** view rights, download rights, expiration date, and revoking access at any time.
- **Watermark:** one click adds "confidential" and the recipient's email address to every page.
- **Analytics:** opens, views, downloads, time per page and signing, with real-time notifications.
- Claims documents of any size can be sent (Gmail's limit is 25 MB).
- **E-signature:** claims legally binding signatures with an audit trail; recipients sign without downloading, and everyone gets the final signed copy.

### 2.8 Chrome Web Store listing
See section 5 [S9, S10, S11].

### 2.9 Linked pages read briefly
- **CRM for Gmail [S14]:** emails, documents and tracking events are logged automatically and grouped by client inside Gmail. It also offers contact lists, real-time notifications and reminders. The page gives no detail on the per-contact history UI.
- **Mobile app [S15]:**
  - Every email is tracked by default, with push notifications for opens, clicks and PDF views.
  - One check means sent with tracking; two checks mean opened. Tapping the checks shows details.
  - Per-recipient tracking.
  - The Gmail mobile add-on needs tracking switched on for each email.
- **Confidential watermark [S16]:** a visible confidential mark plus the recipient's email, both in the viewer and in downloads, on all pages by default.
- **Mass email [S17]:** a separate personalized copy per recipient, merged from Google Sheets, with scheduling, unsubscribe links, bounce detection and a campaign dashboard. Sending is batched to stay within Gmail's own sending limits.
- **Privacy & Security Center [S13]:**
  - Email bodies are not stored, and no staff can access emails.
  - Read, send and delete permissions are needed for automated processes, such as making campaign copies and deleting the extras.
  - Data lives in an AWS VPC in Ireland. AES-256, ISO 27001, a yearly Google assessment, and GDPR requests by email.
- **Workspace Marketplace listing [S12]:**
  - One check means sent but not opened; two green checks mean opened; hovering shows when and how many times.
  - Claims "real opens, not robot opens". Tracking runs in the Chrome extension.
  - 1M+ installs, 4.2 stars from 166 ratings, listing updated 2026-08-31.

## 3. Feature table

| Feature | What the user sees | Likely technical approach | Source |
|---|---|---|---|
| Open tracking | Opens recorded with time and count | Verified: invisible pixel image [S2, S32]. Verified: pixel URL path contains `/trace/mail/` and a `u=` sender-ID parameter (seen in the extension's block rule) [S11]. Inferred: one token per message (and per recipient copy). Gmail recipients fetch the pixel through Google's image proxy, so IP and device belong to Google [S32]. | S2, S11, S32 |
| Check marks in message lists | Verified: one check means sent, not opened; two green checks mean opened [S9, S12]. Tracking page: grey double means delivered, green double means opened [S2]. Grey means not tracked [S19]. Documented for the Sent folder | Verified: content scripts on mail.google.com at document start and end, a page-context bundle and own CSS [S11]. Inferred: DOM injection into Gmail list rows, with status fetched from Mailsuite by message id. Verified: Mailsuite says it updates Gmail labels when emails are opened [S27] (Inferred: so status shows on other clients). | S2, S9, S11, S12, S18, S19, S27 |
| Checks in conversation view | Inferred: checks next to sent messages inside a thread (also on collapsed messages), with an expand button labelled "Click to view email tracking data" | Verified: CSS selectors for checks inside thread containers and collapsed messages, plus the expand label [S11]. | S11 |
| Hover tooltip | Verified: when and how many times opened [S12, S18]. Verified labels combine: first opened, opened, N times, time ago, by (opener), "hasn't opened yet" variants, link visits [S11] | Inferred: rendered client-side from server event data. | S11, S12, S18 |
| Default tracking setting | Settings & account > Tracking > "Track emails by default" | Verified [S28]. Inferred: the extension reads this setting when compose opens. | S28 |
| Per-email open-tracking toggle | Mailsuite button next to Send; untick "Track email opens". The email still goes through Mailsuite, and its links and documents stay tracked | Verified [S28]. Inferred: the extension intercepts Send and the server sends through the Gmail API. | S27, S28 |
| Per-email alert options | Same compose menu: "Notify me by" with options for opened, links clicked, not opened within N h, no reply within N h, opened many times, reopened after a long time | Verified labels [S11, S23, S24]. Inferred: per-message alert settings stored on the server at send time. | S11, S23, S24 |
| Link click tracking | Per-link "Track this link" switch or "Insert tracked link" button; global "Click tracking by default"; links need http(s)://. Clicks show in the tooltip and the dashboard Click report. A notice appears when links went out untracked | Inferred: link rewritten to a redirect URL on Mailsuite's (or a custom) domain, with a 302 to the target. Verified: Mailsuite claims it filters security-scanner clicks [S32]. | S11, S29, S32 |
| Tracked buttons | Insert a call-to-action button and see who clicked, when and how often | Inferred: a styled HTML button wrapping a tracked link. | S3, S11 |
| Custom tracking domain | Your own domain in tracked links instead of shared ones | Inferred: a CNAME to Mailsuite's redirect service, with TLS. | S3, S11 |
| Desktop open alerts | Chrome notification on every open: ✓✓ plus "(recipient) has just read your email", or a generic version when the recipient is unknown. Buttons mute all open alerts or "mute this conversation" | Verified: `notifications` permission, `chrome.notifications.create` with per-event icons and two mute buttons, and a WebSocket endpoint in the config [S11]. Inferred: the server pushes events to the service worker over WebSocket. | S3, S11 |
| Click, PDF, reply and new-mail alerts | Desktop and email alerts on first link click and first PDF view. Desktop templates also exist for replies and new emails | Verified: templates [S11] and first-time behaviour [S3, S5]. | S3, S5, S11 |
| Open alerts by email | Email in your inbox on first open | Verified: Mailsuite says it "adds" open notifications to the Gmail inbox [S27]. Inferred: inserted through the Gmail API or sent as mail. | S3, S27 |
| Not-opened reminder | Email after 24, 48 or 72 h if still unopened. From the reminder you can re-remind, snooze, or disable for that contact | Inferred: a server-side scheduler checks open state at the deadline. | S24 |
| No-reply alert ("Monitor reply") | Compose option. Confirmation says you will be notified after N hours without a reply. Reply reminders can be on or off by default. Delivered by email | Verified labels [S11]. Inferred: the server checks the Gmail thread for a reply before the deadline (needs Gmail API read access). | S3, S5, S11 |
| Hot conversation (open spike) | Email alert when an email is opened many times in a short time; the alert has a per-email "turn off" link; may hint at forwarding | Inferred: a sliding-window rule on open events; thresholds unpublished. | S3, S22 |
| Revival alert | Email alert when an old email is reopened after a long time; turning it off affects only emails sent afterwards | Inferred: a "gap of at least X days" rule. The setting is fixed per email at send time, which explains why turning it off is not retroactive. | S3, S23 |
| "Active" label | Green "Active" label in the inbox; tooltip says it was opened or replied to less than an hour ago | Inferred: client-side rendering from recent events. | S11, S25 |
| Sent-folder unopened filter | Button that shows only last month's unopened sent emails; applies to mail sent after enabling it | Inferred: a Gmail label or search built from unopened message ids. | S11 |
| Incoming tracked-email dot | Green dot on received emails that contain tracking, with a tooltip saying the sender uses tracking; can be switched off in settings | Inferred: scans received HTML for known tracker patterns. | S11, S31 |
| Self-open prevention | Your own views are not counted; emails to yourself are not tracked (a warning is shown) | Verified: Debeaconizer replaces the Sent copy [S32, S33]. Verified: a DNR session rule blocks image requests that match your own pixel and user id in your Gmail tabs, and a dynamic rule unwraps Gmail image-proxy URLs (pattern `meips` or `proxy` … `#original-url`) [S11]. Verified: "device recognition" [S32]. Residual self-opens remain possible in the Gmail mobile app [S32]. | S9, S11, S32, S33 |
| Bot / automated opens | "Real opens, not robot opens"; an "open status may be unreliable" note; a warning when a reply arrives with no recorded open | Verified claims [S12, S32], methods not disclosed. Inferred: heuristics on timing, proxy user agents and IP ranges (Apple MPP, scanners). | S11, S12, S32 |
| Per-recipient tracking (group email) | Tooltip names who opened (the "by (opener)" label); per-recipient checks (Inferred from CSS); up to 50 recipients | Verified: identical copy per recipient, one kept in Sent and the others deleted [S13, S27]. Inferred: each copy has its own pixel and link tokens. | S11, S21, S27 |
| Multisend (split) | Compose option to split into individual tracked copies when there are 2+ Bcc or 10+ To/Cc recipients | Inferred: server-side split, sent through the Gmail API. | S11 |
| Daily Report | Email with the previous day's numbers (sent and received, open rate, click rate, average response time, opened emails) and a "View Full Report" link; can be switched off in Notifications or by unsubscribing | Inferred: nightly batch job that sends an email. | S20 |
| Weekly and monthly reports | Activity reports | Inferred: same batch pipeline; delivery channel not documented. | S3 |
| Dashboard | Home KPIs and a "Latest activity" feed; Reports (Email tracking with tabs such as not opened, Link clicks, PDF analytics, My performance); MyCRM; All files; Tools; Settings; CSV export | Inferred: web app on mailsuite.com on the same event store. Verified: the extension also injects a bundle into the dashboard pages [S11]. | S11, S30 |
| MyCRM and contacts | People you emailed, last-contact date, lists, tags, notes, consent ("privacy management") and unsubscribed status | Inferred: built from sent-message metadata. | S3, S14, S30 |
| Productivity analytics | Charts, time filters and period comparison; reached from the Gmail menu or the dashboard | Inferred: aggregates mailbox metadata (sent and received counts, response time), which needs Gmail API read access. | S6, S30 |
| Tracked scheduled send | "Schedule tracked send" offered next to Gmail's own (untracked) scheduling; a "Mailsuite Scheduled" list; cancelling returns the mail to Drafts | Inferred: server-side scheduler that sends through the Gmail API. | S3, S11 |
| Templates | Load and manage templates in compose | Inferred: stored on the server. | S3, S11 |
| Campaigns and mail merge | Separate copy per recipient, Google Sheets merge, scheduling, unsubscribe links, bounce detection, campaign report | Verified: Gmail API, with a separate message and id per recipient [S32]. Inferred: Google Sheets access requested when needed (Verified label asks for spreadsheet permission [S11]). | S3, S11, S17, S32 |
| PDF tracking | Tracked PDF link with views, time per page, downloads and alerts | Inferred: the PDF is uploaded (the extension can reach an S3 "file-tracking-temp" bucket) and served by a viewer on a separate file-tracking domain with page-timing beacons [S11]. | S3, S7, S11 |
| Secure document sharing | Access control, expiry, revoke, download on/off; no size limit claimed | Inferred: access checks in the server-side viewer. | S3, S8 |
| Watermark | "Confidential" plus the recipient's email on every page, in the viewer and in downloads | Inferred: per-recipient PDF rendering on the server. | S3, S8, S16 |
| E-signature | Signature requests from Gmail; Fill & Sign for incoming PDFs; audit trail | Not relevant to MailPulse. | S3, S8, S11 |
| Certified email | PDF certificate as proof of delivery; a "delivery certified" signature variant | Not relevant. | S3, S11 |
| Polls, video, attachments hub | Polls inside emails; screen and camera recording; central attachment list and favourites | Not relevant. | S3, S11 |
| Mobile app and add-ons | iOS/Android app tracks all mail and sends push alerts. Gmail mobile add-on: tracking per email, no per-recipient data. Outlook add-in: basic tracking | Not relevant to MailPulse v1. | S15, S18, S21 |
| Integrations | CRM auto-BCC (copies of tracked emails to your CRM); Zapier | Not relevant. | S3 |
| AI features | Task tracker built from the inbox (snooze, archive), AI dictation, AI spam-risk check | Seen only as extension labels, not on the marketing pages we read. | S11 |

## 4. Full pricing comparison table

Skipped at the owner's request: MailPulse is a free, personal, local-only tool, so plan tiers, prices, quotas and Mailsuite's comparison table are out of scope.

## 5. Chrome Web Store facts

Source: the store listing and its privacy subpage, fetched with curl on 2026-10-29 [S9, S10]. Permissions come from the extension's manifest [S11].

| Field | Value |
|---|---|
| Name | Mailtrack® – Email Tracker for Gmail |
| Extension id | `ndnaehgpjlnokgebbaldlmgkapkpjkkb` |
| Current version | 12.100.1 (manifest version 3) |
| Last updated | October 28, 2026 |
| Users | 3,000,000 |
| Rating | 4.2 out of 5, 11.8K ratings |
| Size | 3.89 MiB |
| Languages | 54 |
| Category | Extension > Communication |
| Badges | "Featured"; follows recommended practices; publisher has "a good record with no history of violations" |
| Developer | Mailsuite, Barcelona, Spain; self-declared EU trader; support email and phone listed |
| Website | mailsuite.com |

**Privacy practices (store disclosure) [S10]**

- Data handled: "Personally identifiable information" (for example, name, email address) and "Personal communications" (for example, emails).
- The developer certifies that data is not sold to third parties outside approved use cases, not used or transferred for purposes unrelated to the core function, and not used for creditworthiness or lending.
- The store links to the developer's privacy policy.

**Permissions from `manifest.json` [S11]**

- `permissions`: `storage`, `declarativeNetRequestWithHostAccess`, `notifications`.
- `host_permissions`: `mailtrack.io` and `mailsuite.com` (with subdomains), `https://mail.google.com/*`, `*.googleusercontent.com` (Gmail's image proxy domain), Rollbar's API, Datadog's EU log intake, and two Mailsuite S3 buckets (attachments and file-tracking temp).
- No `identity` or `oauth2` entry. Inferred: Google sign-in and the Gmail grant happen on mailsuite.com, and the backend holds the OAuth tokens.
- **Content scripts:** four on mail.google.com (two scripts at document start; a stylesheet and a script at document end), plus a bundle injected into the page context. Scripts also run on Mailsuite dashboard and setup pages.
- **Background and UI:** an MV3 service worker and a toolbar popup.
- **Bundled config:** a WebSocket endpoint on `ws.mailtrack.io`, a file-tracking host `maildoc.io`, and the API hosts `mailsuite.com` and `mailtrack.io`.

**Notable description claims (paraphrased) [S9]**

- Most accurate tracker: removes false self-opens and tracks recipients of group emails individually.
- Sends from your own Gmail account using Gmail's infrastructure, "no external servers". This sits awkwardly with help articles saying mail goes through Mailsuite [S27, S28].
- Open Spike, Revival and No-Reply alerts, with the no-reply window given as "24–48 hours". The feature list says not opened or not replied "within 24–72 hours".
- Never stores emails; does not sell, rent or share emails, browsing data or personal data. GDPR, annual Google audit, ISO certification, Google Cloud Partner, AES-256.
- How to use: open the Sent folder; one check means unread, two checks mean read.
- Integrations: Salesforce, CRMs, and Zapier (4,000+ apps).
- Claims "4.4 stars from over 11,000 reviews"; the same page shows 4.2 from 11.8K.

## 6. Conflicts with our assumptions

| # | Our assumption | What Mailsuite does | Verdict | Sources |
|---|---|---|---|---|
| 1 | Single check means sent/tracked; green double check means opened; hover tooltip such as "Opened 3 times, last 1 hour ago" | Store and Workspace: one check means sent, not opened; two green checks mean opened; hover shows when and how many times. Tracking page: grey double means delivered, green means opened. Help: grey checks mean not tracked. Tooltip labels build similar sentences (first opened, N times, time ago, by whom). Documented only for the Sent folder. The extension's CSS also supports in-thread and collapsed-message checks and per-recipient checks. Mobile app shows checks too. An "Active" label appears in the inbox | Matches in principle. Colours and single-check meaning are inconsistent; inbox and thread placement not documented (verify hands-on) | S2, S9, S11, S12, S18, S19, S25 |
| 2 | On/off tracking toggle in compose; per-email link-tracking toggle | Per-email "Track email opens" checkbox in the Mailsuite menu next to Send, plus a global default. Links are tracked per link or via a global "Click tracking by default" setting | Open toggle: matches. Link toggle: differs (per link and global, not per email) | S28, S29 |
| 3 | Real-time desktop notifications for opens and clicks | Desktop alerts on every open. Click alerts on the first click, desktop and email. Mute buttons per type and per conversation. Also PDF-view, reply and new-email templates | Matches | S3, S5, S11 |
| 4 | Follow-up reminder: trigger and time options | Two triggers: not opened within N h and no reply within N h. N is 24, 48 or 72. Defaults in settings, per-email override in compose. Delivered by email with snooze and disable | Mailsuite has both triggers; options are 24, 48 or 72 hours | S3, S5, S11, S24 |
| 5 | "Open spike" and "revival" alerts | Yes. Feature-list names: "Hot Conversation Alerts: multiple opens" and "Old Conversation Revival Alerts". Marketing names: "Open Spike Alerts" and "Email Revival Alerts". Email delivery; thresholds unpublished | Matches (no thresholds to copy) | S1, S3, S5, S22, S23 |
| 6 | Dashboard: activity feed, list filters, per-contact history, daily/weekly reports | "Latest activity" feed on Home. Email tracking report with tabs (for example not opened), plus a Gmail Sent filter for unopened mail. MyCRM shows contacts and last-contact date; "full history per contact" is claimed but not detailed. Daily Report arrives **by email**, with a link to the dashboard; weekly and monthly reports exist (channel undocumented). CSV export | Mostly matches. Reports are email-first, not dashboard-only | S2, S3, S11, S20, S30 |
| 7 | Per-recipient tracking in To/Cc/Bcc group emails | Up to 50 recipients; not for Google Groups; decided at send time. The server sends identical copies per recipient and deletes the extras from Sent. The tooltip names the opener. To/Cc/Bcc handling is not documented; Multisend splits when there are 2+ Bcc or 10+ To/Cc | Differs in mechanism. It needs server-side Gmail API sending, which conflicts with our no-body rule; one pixel per message cannot do this | S11, S13, S21, S27, S32 |
| 8 | Document/PDF tracking and sharing | Tracked PDF link: views, time per page, downloads, access control, expiry, revoke, watermark with recipient email, download on/off. Forwards not detected | Mailsuite has all of these | S7, S8, S16 |
| 9 | No-reply alerts, scheduled sends, templates, mail merge, e-signatures, others | All present: no-reply alerts, tracked scheduled send, templates, campaigns and mail merge, e-signature, certified email, polls, video, attachments hub, CRM, Zapier, and AI task, dictation and spam tools | Mailsuite has them | S3, S11 |
| 10 | Self-opens, false opens, privacy | Self-opens: Debeaconizer (patent), DNR blocking in your own Gmail tabs, no tracking of emails to yourself, device recognition. False opens: claims human-versus-robot detection, "unreliable" flag, scanner filtering for clicks. Privacy: says it never reads or stores email bodies, yet discloses that it handles "personal communications" and holds full Gmail access | Matches our goals. Its server-side model is far more invasive than MailPulse's | S9, S10, S11, S13, S27, S32, S33 |

## 7. Open questions to verify hands-on

Use a test Gmail account with the extension installed, plus a second recipient account.

1. Where do checks render? Check the Sent list, Inbox and All Mail rows for threads that contain a tracked sent message, inside the conversation, and on collapsed messages. What do the "not tracked" and "sent, not opened" states look like: a single check, or a grey double check?
2. What is the exact tooltip text for one open, many opens and link clicks?
3. List every option in the compose menu next to Send. Is there any per-email link-tracking switch?
4. On the recipient side, inspect the raw message:
   - Pixel: host, path, token length, image type and size, and whether the sender's user id (`u=`) is visible.
   - Link redirects: host, and whether the target URL is exposed.
5. For a group email, do recipients' copies show the full To/Cc list? Are they separate messages? What shows in the sender's Sent folder?
6. Desktop alerts: every open or first open only? How long is the delay? Does it still work with the Gmail tab closed, or with Chrome closed?
7. What are the actual thresholds for Hot Conversation (opens per window) and Revival (gap length)? Run timed tests.
8. Daily Report: what time and time zone is it sent? Is it sent on days with no activity?
9. Self-opens: open your own sent mail in Chrome with the extension, in another browser without it, and in the Gmail mobile app. Also view a reply that quotes the original. Which of these count as opens?
10. Bot opens: send to an Apple Mail (Mail Privacy Protection) address and to a Microsoft 365 Safe Links mailbox. How are those opens and clicks labelled?
11. Does any desktop alert ever show the "using (device)" phrase, and with what values?
12. Is open status also written to Gmail labels? Look in Gmail's label list or in the Gmail mobile app.
13. Does the "Active" label appear only in the Inbox, or also in Sent?

## 8. Sources

All accessed on 2026-10-29. Help-center dates are the "last updated" dates shown on each page.

- S1. Home page: https://mailsuite.com/en/
- S2. Email tracking: https://mailsuite.com/en/features/email-tracking
- S3. Pricing page, used only for feature names and descriptions (pricing skipped at the owner's request): https://mailsuite.com/en/pricing
- S4. Not used (pricing data, skipped at the owner's request).
- S5. Follow-up reminders: https://mailsuite.com/en/features/follow-up-reminders
- S6. Email analytics: https://mailsuite.com/en/features/email-analytics
- S7. Document tracking: https://mailsuite.com/en/features/document-tracking
- S8. Document sharing: https://mailsuite.com/en/features/document-sharing
- S9. Chrome Web Store listing, fetched with curl because WebFetch hit a redirect loop: https://chromewebstore.google.com/detail/ndnaehgpjlnokgebbaldlmgkapkpjkkb
- S10. Chrome Web Store privacy practices: https://chromewebstore.google.com/detail/ndnaehgpjlnokgebbaldlmgkapkpjkkb/privacy
- S11. Extension package v12.100.1 from Google's public CRX endpoint (`https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx3&x=id%3Dndnaehgpjlnokgebbaldlmgkapkpjkkb%26uc`). We read the manifest, the bundled config, English UI labels and CSS selector names, read-only.
- S12. Google Workspace Marketplace listing, fetched with curl (listing updated 2026-08-31): https://workspace.google.com/marketplace/app/mailtrack_for_gmail_email_tracker/224054973946
- S13. Privacy & Security Center: https://mailsuite.com/en/privacy-and-security-center
- S14. CRM for Gmail: https://mailsuite.com/en/features/crm-for-gmail
- S15. Mobile app: https://mailsuite.com/en/features/mailsuite-for-android-iphone
- S16. Confidential watermark: https://mailsuite.com/en/features/confidential-watermark
- S17. Mass email: https://mailsuite.com/en/features/mass-email
- S18. Help, "How to track email opens" (updated 2026-10-21): https://mailsuite.com/hc/en-us/articles/360013900257-How-to-track-email-opens
- S19. Help, "Emails not tracked (grey checkmarks)" (2026-10-19): https://mailsuite.com/hc/en-us/articles/360005942257-Emails-not-tracked-grey-checkmarks
- S20. Help, "Mailtrack Daily Report" (2026-10-22): https://mailsuite.com/hc/en-us/articles/360005926658-Mailtrack-Daily-Report
- S21. Help, group-email tracking (2026-10-28): https://mailsuite.com/hc/en-us/articles/4650746650641-Mailtrack-isn-t-showing-who-s-opened-mails-sent-to-more-than-one-person
- S22. Help, "Hot Conversations Alert" (2026-10-21): https://mailsuite.com/hc/en-us/articles/360005927198-Hot-Conversations-Alert
- S23. Help, "Revival conversation alert" (2026-10-22): https://mailsuite.com/hc/en-us/articles/360005940877-Revival-conversation-alert
- S24. Help, "Not Opened reminders" (2026-10-21): https://mailsuite.com/hc/en-us/articles/360005926798-Mailtrack-Not-Opened-reminders
- S25. Help, "Active email indicator" (2026-10-08): https://mailsuite.com/hc/en-us/articles/360005941697-See-multiple-email-opens-Mailtrack-s-Active-email-indicator
- S26. Help, "Open alerts received immediately after sending" (2026-10-21): https://mailsuite.com/hc/en-us/articles/360005926978-Open-alerts-received-immediately-after-sending-a-mail
- S27. Help, "Why is it necessary … to access, delete and send my emails" (2026-10-21): https://mailsuite.com/hc/en-us/articles/360005926458-Why-is-it-necessary-for-Mailsuite-Mailtrack-to-access-delete-and-send-my-emails
- S28. Help, "Disable email tracking by default" (2026-10-21): https://mailsuite.com/hc/en-us/articles/360005940697-Disable-email-tracking-by-default
- S29. Help, "Click tracking" (2026-10-15): https://mailsuite.com/hc/en-us/articles/360005941137-Click-tracking
- S30. Help, "The Activity Dashboard" (2026-10-21): https://mailsuite.com/hc/en-us/articles/360005927238--PRO-ADVANCED-The-Activity-Dashboard
- S31. Help, "Incoming tracked emails indicator" (2026-10-21): https://mailsuite.com/hc/en-us/articles/360005941337-Mailtrack-s-incoming-tracked-emails-indicator
- S32. Blog, "Why Mailtrack Is the Most Reliable Email Tracker for Gmail" (dated 2026-08-01): https://mailsuite.com/blog/why-mailtrack-is-the-most-reliable-email-tracker/
- S33. Google Patents, US10749835B2, "Method and system for tracking an email message" (priority 2016-12-30, granted 2020-08-18; status and expiry are Google's assumptions, not legal conclusions): https://patents.google.com/patent/US10749835B2/en

**Not available:** chrome-stats.com returned HTTP 403. WebFetch could not load the Chrome Web Store or the Workspace Marketplace (redirect loops), so both were fetched with curl instead.
