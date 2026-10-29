# Features: Mailsuite vs MailPulse scope

Owner's scope (2026-10-29): personal use only, free tools only, runs on the owner's PC. Pricing, plans,
teams and billing are out. Sources: research/mailsuite-product.md and research/mailsuite-helpcenter.md
(read 2026-10-29). Mailsuite descriptions are paraphrased; MailPulse uses its own name, text and design.

Scope key: **v1** = Phases 1–5 · **v1 (proposed)** = small addition found in research, needs the
owner's OK (question Q8) · **later** = Phase 6, only after the owner confirms · **out** = not planned.

## Tracking

| Mailsuite feature | What it does | Likely technical approach | MailPulse scope |
|---|---|---|---|
| Open tracking | Records when and how often an email is opened. | Invisible image added server-side before delivery; Mailsuite sends the mail via the Gmail API. Opens = image fetches, then bot/prefetch filtering. | **v1.** Pixel inserted by the extension at send; Gmail sends normally; no Gmail permission (D-031). |
| Check marks in Gmail | Sent folder shows one check (sent, not opened) or two green checks (opened); hover shows when and how many times. Grey checks = not tracked. | Extension decorates Gmail list rows; status fetched from Mailsuite's API, pushed over a WebSocket. | **v1.** ✓ / green ✓✓ via InboxSDK thread rows, tooltip "Opened N times, last X ago". No mark for untracked mail. |
| Checks inside the conversation | Status shown next to messages in the thread view. | Extension styles message headers (seen in its CSS; not documented). | **v1.** `MessageView` icon on tracked messages the owner sent. |
| "Active" label | Green label in the inbox when a conversation was opened or replied to within the last hour. | Extension label from recent activity. | **later.** |
| Per-email tracking switch | Checkbox next to Send ("track opens") plus a global default. | Compose button + setting. | **v1.** Compose toolbar toggle + default in Settings. |
| Link click tracking | Per-link "track this link" plus a global "track clicks by default"; clicks redirect through Mailsuite. | Links rewritten to a redirect URL; server logs and redirects; scanner patterns filtered. | **v1 (Phase 5).** Per-email switch as the brief asks (D-035). **Default off**, because links fail while the PC is off (D-029). |
| Bot / prefetch filtering | Separates human opens from Apple Mail Privacy Protection, scanners, preloading apps; clicks right after delivery treated as bots. | User-agent, timing and IP heuristics. | **v1.** Every raw event stored with a verdict and reason (PLAN §4.2–4.4). |
| "Open status may be unreliable" | Tooltip warning for recipients whose mail service probably blocks images (~5–10%). | Recipient-domain list. | **v1 (proposed).** Same idea, small static list (Outlook.com, Yahoo, Proton…). |
| Self-open protection | Your own views are not counted. Three layers: replacing the Sent copy with a pixel-free one ("Debeaconizer", patented); extension rules that block your own pixel in Gmail tabs, including inside Google's proxy URLs; no tracking for emails to yourself. | Server-side Sent-copy swap; MV3 `declarativeNetRequest` rules on `*.googleusercontent.com`. | **v1**, own design: DNR rules on our host + self-view reports + 30 s hold + send grace (PLAN §4.3). Sent-copy swap **out** (patent, needs Gmail API — D-030). |
| Emails to yourself | Not tracked; a warning is shown. | Recipient check in the extension. | **v1.** |
| Plain-text mode | Warning; cannot be tracked. | Compose check. | **v1.** Notice; sends untracked. |
| Confidential mode | Tracked (Mailsuite warns about multi-recipient side effects). | — | **v1, pending Spike 1.** Track unless the pixel cannot load. |
| Multiple Gmail accounts | Works per account. | Account-scoped API calls. | **v1.** |
| Per-recipient tracking (group emails) | Shows who opened. Mailsuite sends a separate copy per recipient from its server (≤ 50 recipients), keeps one in Sent, deletes the rest; not for scheduled emails or Google Groups. | Server-side sending via the Gmail API. | **later.** Needs a new approach for an extension-only design; research first. |

## Notifications, reminders and alerts

| Mailsuite feature | What it does | Likely technical approach | MailPulse scope |
|---|---|---|---|
| Real-time desktop notifications | Chrome notification on every open; first click and first PDF view; "mute all of this type" and "mute this conversation" buttons. | Chrome notifications fed by a WebSocket. | **v1.** Every counted open and click, 30 s polling (D-008). **"Mute this email" button: v1 (proposed).** |
| Email notifications | Email on the first open. | Server sends email. | **out.** MailPulse never sends email (D-033). |
| "Not opened" reminder | Reminder if not opened within 24/48/72 h; default in settings, override per email in compose; snooze/disable from the reminder email. | Server scheduler + email. | **v1.** Desktop notification + dashboard alert; default 48 h. **Per-email override in compose: v1 (proposed).** |
| "No reply" reminder ("monitor reply") | Reminder if nobody replied within 24/48/72 h. | Server reads the thread via the Gmail API. | **later.** Needs reply detection. |
| Open spike ("hot conversation") alert | Alert when an email gets several opens in a short time (threshold not published). | Server rule on recent opens. | **v1.** 3+ opens within 60 min (editable). |
| Revival alert | Alert when an old email is opened again (threshold not published). | Server rule on gap since last open. | **v1.** Open after 7+ days without opens (editable). |

## Dashboard and reports

| Mailsuite feature | What it does | Likely technical approach | MailPulse scope |
|---|---|---|---|
| Latest activity feed | Recent opens and clicks. | Web dashboard on Mailsuite's servers. | **v1.** Live via SSE. |
| Email tracking report | List of tracked emails with tabs/filters (for example "not opened"). | Dashboard query. | **v1.** Filters: opened / not opened / clicked / date / search / account. |
| Email detail | Open/click history of one email. | Dashboard view. | **v1.** Full timeline including ignored events and why. |
| Link click report | Clicks per link. | Dashboard view. | **v1 (Phase 5).** |
| Contacts | Per-contact history and last contact date; lists, tags and notes. | Dashboard + CRM features. | **v1:** per-contact history. Lists/tags/notes **out** (CRM). |
| Daily report | Summary delivered by email with a link to the full report; weekly and monthly also exist. | Server job + email. | **v1:** daily and weekly report pages in the dashboard (no email). Monthly **later**. |
| "My performance" analytics | Open-rate trends. | Dashboard charts. | **v1:** inside the reports pages. |
| CSV export | Export of reports. | Dashboard export. | **v1:** full JSON export (brief). CSV **later**. |
| "Unopened" filter inside Gmail | Sent-folder filter for unopened emails. | Extension UI. | **later.** |
| Data deletion | Account/data deletion on request. | Support process. | **v1:** retention setting, delete-all, export. |

## Other Mailsuite products and features

| Mailsuite feature | What it does | Likely technical approach | MailPulse scope |
|---|---|---|---|
| Document tracking and sharing | Tracked PDF links: views, time per page, downloads, access control, expiry, revoke, watermark. | Hosted PDF viewer with per-page timing events. | **later** (brief Phase 6). |
| Tracked scheduled send (own scheduler) | Schedule tracked emails. | Server-side scheduler + Gmail API. | **later.** Gmail's own "Schedule send" with our pixel is handled in v1 if Spike 1 confirms it. |
| Templates | Reusable emails. | Extension + storage. | **later.** |
| Campaigns / mail merge | Bulk personalised sends. | Server-side sending. | **later.** |
| Mobile apps, Gmail mobile add-on | Tracking from phones. | Native apps / Workspace add-on. | **out.** |
| E-signature, certified email, polls, video, AI tools, CRM integrations, Zapier | Extra suite products. | Various. | **out.** |
| Plans, pricing, teams, billing, branding signature | Commercial features. | — | **out** (owner: personal and free). |

## Privacy comparison (for the owner's information)

| Topic | Mailsuite | MailPulse |
|---|---|---|
| Who sends the email | Mailsuite servers via the Gmail API | Gmail itself; the extension only edits the draft |
| Google permission | Broadest Gmail scope (read, compose, send, delete all mail) | None |
| Where data lives | Mailsuite's cloud (AWS Ireland) | Owner's PC (Docker + PostgreSQL) |
| Email bodies | Pass through Mailsuite until delivery | Never leave the browser |
| Stored metadata | Addresses, subjects, history, link URLs, clicker IP/browser/OS | Addresses, subjects, history, link URLs, truncated IP (or none), optional encryption (Q4) |
| Third parties in the path | Mailsuite, AWS, Rollbar, Datadog (per its manifest) | Tailscale relays (encrypted only); InboxSDK telemetry blocked |
