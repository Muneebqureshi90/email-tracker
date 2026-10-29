# MailPulse — Plan

Status: **Step 0 draft, waiting for owner approval.** Nothing here is built yet. Items marked
**[Spike n]** are assumptions that Step 1 must prove before we build on them.

Related: [FEATURES.md](FEATURES.md) · [DECISIONS.md](DECISIONS.md) · [LIMITATIONS.md](LIMITATIONS.md) ·
research notes in [research/](research/).

## 1. Goal in one paragraph

MailPulse is a private open/click tracker for the owner's own Gmail. A Chrome MV3 extension adds an
invisible pixel (and, optionally, tracked links) to each email at send time. The recipient's mail app,
or its image proxy, loads the pixel from `https://<public-host>/t/<token>.gif`, which reaches a
Spring Boot backend on the owner's PC through Tailscale Funnel. The backend filters out the owner's
own views, proxies and bots, then shows ✓/✓✓ marks in Gmail, desktop notifications, and a React
dashboard. No email body is ever sent to or stored by the backend. Everything runs on the owner's PC,
for the owner only, with free tools only. `<public-host>` below means the fixed Funnel address, for
example `mypc.tail1234.ts.net`.

## 2. Corrections and risks found in the brief

**First, a hard limit: a 100% localhost setup cannot see any opens.** The recipient's mail app (or
Google's image proxy) fetches the pixel over the internet, so the PC must expose one stable public URL
for `/t/*` and `/c/*`. Everything else (API, dashboard, database) stays on `127.0.0.1`. The free way to
do that is Tailscale Funnel (item 10).

Other places where the brief is wrong, outdated, or silent about a real problem; the matching question
is in the Step 0 checkpoint.

1. **Tracked links break while the PC is off.** The brief says events are lost while the backend or
   tunnel is down. Worse: a recipient who clicks a tracked link at that time gets an error page
   instead of the destination. Pixel misses are silent; broken links are visible to recipients.
   Because MailPulse runs only on the PC, link tracking should be **off by default** and switched on
   per email when the owner accepts that risk (Q2).
2. **InboxSDK telemetry cannot be fully switched off.** `eventTracking: false` and
   `globalErrorLogging: false` still leave "passive" usage events and InboxSDK's own error reports,
   each carrying a hash of the Gmail address and the extension ID (verified in the 2.2.33 source,
   see research/tech-notes.md §2). Plan: both options off **plus** declarativeNetRequest rules that
   block `api.inboxsdk.com` and the Streak Pub/Sub topic. InboxSDK also needs a free App ID from
   inboxsdk.com — a one-time registration with a third party.
3. **"Ignore opens within ±30 s of a self-view" means every open is held ~30 s before it counts.**
   The server cannot know whether a self-view report is still on its way. So notifications arrive
   roughly 35–65 s after the real open (proxy fetch + 30 s hold + up to 30 s poll). That still meets
   "within about a minute", but only just. Spike 3 measures the real gap so we can shorten the hold.
4. **Blocking self-views with declarativeNetRequest is undocumented — but Mailtrack relies on it.**
   Gmail loads the pixel from `googleusercontent.com/...#https://<public-host>/t/...`; our host appears
   only in the `#fragment`. Chrome's docs are silent on fragments, yet Mailtrack's own extension ships
   a DNR rule that unwraps exactly these proxy URLs by their `#original-url` part
   (research/mailsuite-product.md), so Chrome very likely exposes the fragment to DNR. If Spike 3
   confirms it, the DNR rule (layer L1c) stops self-opens at the source and self-view reports become
   the backup. Until then both are planned.
5. **Registering at send time with a 2 s wait is fragile.** InboxSDK's `presending` handler is
   synchronous. Waiting for the backend means cancelling the send and calling `send()` again, which
   risks breaking Undo Send, scheduled send and "Send & archive". Proposed instead: register the
   email while the owner is composing, then insert the pixel synchronously at send. Nothing waits on
   the network at send time, so failing open is automatic. **[Spike 1]** compares both.
6. **TypeScript 7 (current) breaks typescript-eslint** (peer range `<6.1.0`). Use TypeScript 6.0.x.
7. **Java 25 is the current LTS, but only JDK 21 is installed.** Spring Boot 4.1.2 supports both.
8. **Chrome Local Network Access** (prompt shipped in Chrome 142) is undocumented for extension
   service workers calling `http://127.0.0.1` **[Spike 1]**. Fallback: grant the permission once.
9. **Dashboard login token in an HttpOnly cookie, not an `Authorization` header.** `EventSource` (SSE)
   cannot send headers, and a cookie keeps the JWT away from page scripts. This needs CSRF protection,
   described in §8.
10. **Cloudflare Tunnel is not free for a fixed URL.** A stable Cloudflare hostname needs an owned
    domain (yearly fee). Free quick tunnels get a new random URL on every restart, which breaks every
    pixel already sent. Free and stable instead: **Tailscale Funnel** — a fixed
    `https://<pc-name>.<tailnet>.ts.net` address served by the Tailscale app on the PC, available on
    the free plan; TLS ends on the PC, so Tailscale's relays cannot read the requests. Needs a free
    Tailscale account (Q1). ngrok's free plan shows a warning page to browsers, which breaks link
    clicks and may break pixels.
11. **Mailsuite sends your mail through its own servers; MailPulse will not.** Mailsuite adds the
    pixel server-side and sends through the Gmail API, which needs Google's broadest Gmail permission.
    MailPulse stays extension-only: no Gmail permission, no body ever leaves the browser. So the
    Mailsuite features that depend on server-side sending are not available as-is: per-recipient
    copies, its own scheduler, and replacing the Sent copy with a pixel-free one (that last technique
    is also patented, US 10,749,835 — we will not use it).

## 3. Architecture

```
 INTERNET                                                OWNER'S PC (Windows 11, Docker Desktop)
 ────────                                                ─────────────────────────────────────────
 Recipient mail app ──► Gmail / Outlook / Apple proxy ─┐
 Recipient browser (link click) ───────────────────────┤
                                                       ▼
                  Tailscale Funnel relay (encrypted; cannot read requests)
                                                       │ outbound connection from the PC (no open ports)
                                                       ▼
                  Tailscale app on Windows: https://<public-host>  (TLS ends here)
                  serves only /t/ and /c/ ──► http://127.0.0.1:8081
                                                       ▼
          ┌──────────────────────── docker compose network "mailpulse" ─────────────────────────┐
          │  backend:8081  PUBLIC connector (/t, /c only) ◄── published on 127.0.0.1:8081       │
          │                                      backend:8080  PRIVATE connector ◄── 127.0.0.1:8080
          │                                      (/api/**, dashboard files, /actuator/health)   │
          │  postgres:5432  (no host port)                                                       │
          └──────────────────────────────────────────────────────────────────────────────────────┘

 CHROME ON THE PC
   Gmail tab ─ content script ─ InboxSDK adapter ─┐
                                                  ├─ chrome.runtime messages ─► extension service worker
   Popup / options pages ─────────────────────────┘        │  Bearer API token
                                                           ▼
                                                http://127.0.0.1:8080/api/**
   Dashboard tab  http://127.0.0.1:8080/  (same origin as the API, session cookie, SSE /api/stream)
```

Components:

| Component | Tech | Responsibility |
|---|---|---|
| backend | Spring Boot 4.1, Java 25, Maven | Public tracking endpoints; private API; event pipeline; alerts; retention; serves the built dashboard. One app, two Tomcat connectors (DECISIONS D-003). |
| postgres | PostgreSQL 18 | All data. Reachable only on the compose network. |
| Tailscale Funnel | Tailscale for Windows, free plan | Fixed public `https://<public-host>`; serves only `/t/` and `/c/` (other paths 404); TLS ends on the PC. |
| dashboard | React 19, TS 6, Vite 8, Tailwind 4, TanStack Query 5, React Router 8, Recharts 3 | Owner UI. Built into the backend image; Vite dev server only during development. |
| extension | Chrome MV3, TS 6, InboxSDK 2.2.x, React for popup/options | Compose hooks, pixel/link insertion, ✓/✓✓ marks, self-view reports, notifications. |

## 4. Key flows

### 4.1 Send (proposed flow; Spike 1 decides)

1. A compose window opens. If tracking is on for it, the content script asks the service worker to
   `POST /api/emails` with the Gmail account and a random `clientRef`. The response holds the email
   id and the pixel URL. Body text is never sent.
2. While the owner types, `bodyChanged` (debounced ~1 s) collects the `http(s)` link URLs from the
   new text (not the quoted part) and sends **only those URLs** to `POST /api/emails/{id}/links`.
   The response maps each original URL to a tracked URL.
3. On `presending` (synchronous, no network):
   - Skip tracking and show a compose notice if: tracking is off, recipients are only the owner's
     own addresses, plain-text mode is on, or registration has not completed (backend down or slow).
     The email sends untracked — fail open.
   - Confidential mode: Mailsuite tracks these emails, so we track them too unless Spike 1 shows the
     pixel cannot load (then skip with a notice).
   - Remove any MailPulse pixel found in the quoted area (old pixels from earlier emails).
   - If the body already holds this compose's own pixel (for example after Undo Send), keep it;
     never add a second one.
   - Insert `<img src="https://<public-host>/t/<token>.gif" width="1" height="1" alt=""
     style="width:1px;height:1px;border:0">` near the top of the new text (inside the first block),
     never with `display:none`, so Gmail's ~102 KB clipping cannot cut it off.
   - If link tracking is on, rewrite `href`s in the new text that have a mapping. Links without a
     mapping yet stay untouched (logged, not fatal).
   - Capture final subject, To/Cc/Bcc, the tracked link IDs actually used.
4. On `sent`: the worker sends `PATCH /api/emails/{id}` with status `SENT`, Gmail message ID, thread
   ID, sent time, final subject and recipients. If the backend is down, the PATCH goes into a retry
   queue in `chrome.storage.local`.
5. On `sendCanceled` (Undo Send): `PATCH` status `CANCELLED`. The reopened compose still contains the
   pixel; the extension looks it up (`GET /api/emails/by-token/{token}`), adopts that email, and a
   later send flips it back to `SENT`. No duplicate pixels.
6. Scheduled send: handled by the same `presending` path if it fires; otherwise via
   `scheduleSendMenuOpening` **[Spike 1]**. Status `SCHEDULED` until the first counted open.
7. Drafts closed without sending: the registration stays `DRAFT` and is purged after 24 h if no
   event ever arrived.

Fallback flow if Spike 1 shows body edits in `presending` are unreliable: cancel in `presending`,
register with a 2 s timeout, edit the body, then call `composeView.send()`. On timeout, send untracked
and show a notice.

### 4.2 Open

1. `GET /t/{token}.gif` (also `HEAD`) always returns the same 43-byte transparent GIF, `200`,
   `Content-Type: image/gif`, `Cache-Control: no-store, no-cache, must-revalidate, private, max-age=0`,
   `Pragma: no-cache`, `Expires: 0`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
   Unknown or malformed tokens get exactly the same response and are not written to the database.
2. The request details (receive time from the server `Clock`, method, user agent, client IP from
   `X-Forwarded-For` only when the request came through Funnel, `X-MailPulse-Self` header)
   go onto a bounded in-memory queue; a worker saves them. The response never waits for the database.
3. Ingest classification (immediate): `HEAD` → ignored (`BOT_HEAD`); self header → ignored (`SELF`);
   Apple MPP signature → ignored (`PREFETCH`, configurable); within the send grace period →
   ignored (`SEND_GRACE`); otherwise `PENDING`.
4. Finalizer job (every 5 s) takes `PENDING` events older than the self-view window (30 s):
   - a self-view report for the same email within ±30 s → `IGNORED/SELF_VIEW`;
   - a counted open from the same source key within 60 s → `IGNORED/DUPLICATE`;
   - otherwise `COUNTED`: update counters, add an `activity` row, push SSE, run alert rules.
5. A counted open on a `CANCELLED`/`SCHEDULED`/`DRAFT` email proves the email went out, so the
   status becomes `SENT` (sent time = earliest known).

Source key = proxy family for proxied requests (Gmail's proxy IPs vary) or truncated IP + user-agent
hash for direct requests.

### 4.3 Self-view suppression (layers)

| Layer | What it does | Covers |
|---|---|---|
| L1 DNR block | Blocks the owner's browser from loading `https://<public-host>/t/*` directly. | Compose editor showing the inserted pixel; webmail that does not proxy images. |
| L1b DNR header | Adds `X-MailPulse-Self: <install secret>` to the owner's requests to `https://<public-host>/c/*`. | Owner clicking their own tracked links (link still works; click recorded as self). |
| L1c DNR fragment block **[Spike 3]** | Blocks `googleusercontent.com` image requests whose URL contains `#https://<public-host>/t/`. | Owner's Gmail rendering of any email that contains our pixel — stops the self-open at the source. Mailtrack uses a rule of this kind in production; Spike 3 confirms for ours. |
| L2 Self-view report | When Gmail shows a message or compose body containing our pixel, the extension sends `POST /api/self-views` with the tokens. The server stamps its own receive time. | Sent folder, thread view, replies quoting our email, compose after Undo Send. |
| L3 Hold window | Opens stay `PENDING` for 30 s so late self-view reports still win. | Race between the proxy fetch and the report. |
| L4 Send grace | Opens in the first 10 s after send are ignored. | Gmail rendering the just-sent message in the thread. |
| L5 Raw log | Every event is kept with its verdict and reason. | Explaining any number in the dashboard. |

Not coverable: the owner opening their sent mail on a device without the extension (phone app, other
browser). Documented in LIMITATIONS.md.

### 4.4 Click (Phase 5)

1. `GET /c/{token}` (and `HEAD`): look up the stored URL → `302 Location: <stored URL>`,
   `Cache-Control: no-store`, `Referrer-Policy: no-referrer` (the token never leaks to the destination).
   Unknown token → `404 text/plain` with a fixed body. The target URL is never read from the request.
2. Same queue/finalizer as opens, plus bot rules: `HEAD` → `BOT_HEAD`; known scanner user agents →
   `BOT_UA`; click within 15 s of send → `BOT_TIMING`; 3+ different links of one email within 2 s →
   `BOT_BURST`; same link + same source within 60 s → `DUPLICATE`.
3. A counted click also marks the email as engaged (✓✓), even if no open was counted.

### 4.5 Marks in Gmail

- Sent list: `ThreadRowView` handler collects thread IDs for ~150 ms, then the worker calls
  `GET /api/marks?account=…&threadIds=…` (max 100). Results are cached for 30 s and refreshed when an
  activity poll reports a change.
- Mark per thread = the latest tracked email from that account in the thread:
  ✓ grey = sent, not opened; ✓✓ green = opened or clicked; no mark = not tracked. Tooltip (plain
  text): "Opened 3 times, last 1 hour ago · 2 clicks".
- If every recipient uses a provider that blocks images by default (for example Outlook.com, Yahoo,
  Proton), the tooltip adds "open status may be unreliable" (proposed, small; Mailsuite does the same).
- Thread view: `MessageView.addAttachmentIcon` on each tracked message sent by the owner.

### 4.6 Notifications

- Service-worker alarm every 30 s → `GET /api/activity?since=<lastId>&limit=20` → one
  `chrome.notifications` toast per item (grouped into one toast when there are more than 3).
- The first run after install starts from the newest id (no backlog flood).
- Clicking a toast opens `http://127.0.0.1:8080/emails/<id>`. A "Mute this email" button stops
  further toasts for that email (proposed, small; Mailsuite has the same).
- Notification rules use the settings at the time of the event, so muting works immediately
  (Mailsuite freezes them per email at send time).
- The dashboard receives the same items live over SSE (`GET /api/stream`).

### 4.7 Alerts and reports

- Rules run with the injectable `Clock`: follow-up (no counted open within N hours; default 48,
  options 24/48/72, per-email override in the compose status bar — proposed), open spike (3+ opens
  within 60 min), revival (open after 7+ days without opens).
- Alerts arrive as desktop notifications and in the dashboard. MailPulse never sends email
  (no SMTP, no Gmail send permission); Mailsuite emails its reminders and reports.
- Daily and weekly reports are dashboard pages, in the owner's time zone.
- No-reply reminders need reply detection, which is a later phase.

## 5. Data model (PostgreSQL 18, Flyway)

All times are `timestamptz` in UTC. IDs are UUIDs except high-volume tables (`bigserial`).
If field encryption is approved (question Q4), the columns marked 🔒 hold AES-256-GCM ciphertext and a
`*_hash` column holds an HMAC-SHA256 blind index for exact-match lookups.

| Table | Key columns | Notes |
|---|---|---|
| `owner_account` | `id`, `password_hash` (Argon2id), `password_changed_at`, `failed_logins`, `locked_until` | Exactly one row. Sessions issued before `password_changed_at` are rejected. |
| `api_token` | `id`, `name`, `token_hash` (SHA-256, unique), `token_prefix`, `scope` (`EXTENSION`), `created_at`, `last_used_at`, `revoked_at` | Raw token shown once. |
| `gmail_account` | `id`, `address` 🔒, `address_hash` (unique), `created_at` | One row per Gmail account the extension sends from. |
| `tracked_email` | `id`, `gmail_account_id`, `client_ref` (unique, idempotency), `status` (`DRAFT`/`SENT`/`SCHEDULED`/`CANCELLED`), `subject` 🔒, `track_opens`, `track_links`, `gmail_message_id`, `gmail_thread_id`, `created_at`, `sent_at`, `cancelled_at`, `open_count`, `click_count`, `first_opened_at`, `last_opened_at`, `last_clicked_at`, `notify` (mute flag), `follow_up_hours` (nullable per-email override) | Index `(gmail_account_id, gmail_thread_id)`, `(sent_at desc)`. |
| `contact` | `id`, `address` 🔒, `address_hash` (unique), `display_name` 🔒, `first_seen_at`, `last_emailed_at` | Lower-cased, trimmed address. |
| `recipient` | `id`, `tracked_email_id`, `contact_id`, `kind` (`TO`/`CC`/`BCC`), `position` | |
| `tracking_token` | `token` (PK, 24 chars), `tracked_email_id`, `recipient_id` (null in v1), `kind` (`PIXEL`), `created_at` | Ready for per-recipient pixels later. |
| `tracked_link` | `id`, `tracked_email_id`, `token` (unique), `original_url`, `used`, `click_count`, `first_clicked_at`, `last_clicked_at` | URL validated `http`/`https`, ≤ 2048 chars. |
| `tracking_event` | `id`, `tracked_email_id`, `tracked_link_id`, `type` (`OPEN`/`CLICK`), `received_at`, `http_method`, `user_agent` (≤ 512), `ip_prefix` (nullable), `source` (`GMAIL_PROXY`/`OUTLOOK_PROXY`/`YAHOO_PROXY`/`APPLE_MPP`/`SCANNER`/`DIRECT`/`UNKNOWN`), `client`, `device`, `os`, `country` (nullable), `verdict` (`PENDING`/`COUNTED`/`IGNORED`), `reason`, `decided_at` | Partial index on `PENDING`. Reasons: `SELF`, `SELF_VIEW`, `SEND_GRACE`, `DUPLICATE`, `BOT_HEAD`, `BOT_UA`, `BOT_TIMING`, `BOT_BURST`, `PREFETCH`. |
| `self_view` | `id`, `tracked_email_id`, `received_at`, `context` (`THREAD`/`COMPOSE`/`OTHER`) | Kept 2 days. |
| `activity` | `id` (bigserial = feed cursor and SSE event id), `kind` (`OPEN`/`CLICK`/`ALERT`), `tracked_email_id`, `event_id`, `alert_id`, `created_at` | Source of the feed, SSE and extension polling. |
| `alert` | `id`, `type` (`FOLLOW_UP`/`OPEN_SPIKE`/`REVIVAL`), `tracked_email_id`, `created_at`, `status` (`NEW`/`SEEN`/`DISMISSED`/`SNOOZED`), `snoozed_until`, `details` (jsonb) | |
| `settings` | single row: tracking defaults, `send_grace_s`=10, `self_view_window_s`=30, `dedupe_window_s`=60, `follow_up_hours`=48, `spike_opens`=3, `spike_window_min`=60, `revival_days`=7, `retention_days`=365, `ip_mode` (`TRUNCATED`/`OFF`), `count_apple_prefetch`=false, `notify_opens`, `notify_clicks`, `notify_alerts`, `timezone` | Validated ranges. |

Tokens: 18 bytes from `SecureRandom`, base64url without padding → 24 characters (144 bits).
Public endpoints reject anything not matching `^[A-Za-z0-9_-]{24}$` before touching the database.

IP storage: IPv4 truncated to /24 (`203.0.113.0`), IPv6 to /48, or not stored (`ip_mode=OFF`).

## 6. API contract

Errors use RFC 9457 Problem Details. All request bodies are JSON with size limits and Bean Validation.

### 6.1 Public (port 8081, internet via Tailscale Funnel, no auth)

| Method | Path | Response |
|---|---|---|
| GET, HEAD | `/t/{token}.gif` | Always `200 image/gif`, 43 bytes, no-cache headers. Event saved asynchronously. |
| GET, HEAD | `/c/{token}` | `302` to the stored URL, or `404 text/plain` "Not found". |
| any other | anything | `404`, empty body, no server banner. |

### 6.2 Private (127.0.0.1:8080)

Auth: **S** = owner session cookie (dashboard), **T** = extension bearer token, **—** = none.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/auth/status` | — | `{ setupRequired, authenticated }` |
| POST | `/api/auth/setup` | — | First run only: `{ setupCode, password }`. The one-time setup code is printed in the backend log. |
| POST | `/api/auth/login` | — | `{ password }` → sets session cookie. 5 attempts/min, then backoff. |
| POST | `/api/auth/logout` | S | Clears cookie. |
| PUT | `/api/auth/password` | S | `{ currentPassword, newPassword }`; invalidates all sessions. |
| GET / POST | `/api/tokens` | S | List / create extension tokens (`{ name }` → raw token shown once). |
| DELETE | `/api/tokens/{id}` | S | Revoke. |
| GET | `/api/config` | S, T | `{ publicBaseUrl, settings needed by the extension }` |
| POST | `/api/emails` | T | `{ account, clientRef, trackOpens, trackLinks }` → `201 { id, pixelUrl }` (idempotent on `clientRef`). |
| POST | `/api/emails/{id}/links` | T | `{ urls: [...] }` → `{ links: [{ originalUrl, trackedUrl, linkId }] }` |
| PATCH | `/api/emails/{id}` | T | `{ status, gmailMessageId, gmailThreadId, sentAt, subject, recipients: [{ email, name, kind }], usedLinkIds }` |
| GET | `/api/emails/by-token/{token}` | T | `{ id, status }` (Undo Send adoption). |
| POST | `/api/self-views` | T | `{ account, tokens: [...], context }` → `202`. |
| GET | `/api/marks` | T | `?account=&threadIds=a,b` or `&messageIds=` → `{ marks: { <id>: { state, openCount, clickCount, lastOpenedAt } } }` |
| GET | `/api/activity` | S, T | `?since=<activityId>&limit=` → `{ items: [...], lastId }` |
| GET | `/api/stream` | S | SSE: `activity` events (id = activity id, replay via `Last-Event-ID`), heartbeat every 25 s. |
| GET | `/api/emails` | S | Filters `status=opened|not_opened|clicked`, `from`, `to`, `q`, `account`, `page`, `size`, `sort`. |
| GET | `/api/emails/{id}` | S | Detail with recipients, links, and the full event timeline (verdicts and reasons). |
| PATCH | `/api/emails/{id}/tracking` | S | `{ enabled: false }` stops counting further events for one email. |
| GET | `/api/contacts`, `/api/contacts/{email}` | S | Per-contact totals and history. |
| GET | `/api/reports/daily?date=`, `/api/reports/weekly?weekStart=` | S | Sent, opened, open rate, clicks, opens by hour/day, top emails/contacts (owner time zone). |
| GET | `/api/alerts`, PATCH `/api/alerts/{id}` | S | List; mark seen/dismissed/snoozed. |
| GET, PUT | `/api/settings` | S | Read / update settings. |
| GET | `/api/export` | S | Streams all data as a JSON file download. |
| DELETE | `/api/data` | S | `{ confirm: "DELETE ALL MY DATA", password }` → wipes emails, contacts, events, alerts. Keeps account, settings, tokens. |
| GET | `/actuator/health` | — | Liveness for Docker only. No other actuator endpoints exposed. |

Extension tokens can call only the endpoints marked **T**.

## 7. Extension design

```
extension/src/
  gmail/        InboxSDK adapter — the ONLY code that knows InboxSDK or Gmail DOM
                (compose hooks, plain-text/confidential checks, thread rows, message views)
  core/         Pure, unit-tested functions: pixel HTML, find/strip pixels (direct and proxy URLs),
                link extraction and rewriting, self-only recipient check, token parsing
  background/   Service worker: API client (2 s timeout, retry queue), alarms poller,
                notifications, DNR rule manager, message router
  popup/        React: recent activity, global tracking switch, backend status
  options/      React: backend URL, API token, connection test
```

- Permissions: `storage`, `alarms`, `notifications`, `scripting` (InboxSDK page world),
  `declarativeNetRequestWithHostAccess`; host permissions `https://mail.google.com/*`,
  `http://127.0.0.1:8080/*`; optional host permission for the tracking host, requested once at setup.
- DNR rules: block InboxSDK telemetry hosts; L1/L1b/L1c rules from §4.3, created as dynamic rules from
  the configured tracking host.
- Stable ID via manifest `key`; the private key stays outside git.
- Untrusted text (subjects, user agents) is set with `textContent` / React only. Never `innerHTML`.
- Multi-account: every request carries the account from `sdk.User.getEmailAddress()`.
- Compose UI: a toolbar toggle (tracking on/off) and a small status bar with the link-tracking toggle.

## 8. Security

### 8.1 Controls

- Public surface: only the Tailscale Funnel mounts `/t/` and `/c/` are internet-facing. The public
  connector itself also rejects everything except the two routes (defence in depth).
- Private API: published only on `127.0.0.1`. Host header must be `127.0.0.1:8080` or
  `localhost:8080` (blocks DNS-rebinding attacks).
- Dashboard session: JWT (HS256, 12 h) in an `HttpOnly; SameSite=Strict; Path=/` cookie; Spring Security
  CSRF token for unsafe methods; `Origin` must be the dashboard origin.
- Extension: bearer tokens, stored as SHA-256 hashes, scoped, revocable, `last_used_at` visible.
- CORS: only `chrome-extension://<pinned id>` (and `http://127.0.0.1:5173` in the dev profile).
- Passwords: Argon2id. First-run setup needs the one-time code from the backend log, so a website
  cannot claim the account by posting to localhost first.
- Headers: CSP `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
  connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`, `nosniff`,
  `Referrer-Policy: no-referrer`, no `Server` header.
- Rate limits (Bucket4j, in memory): public 60 req/min per client IP and 600/min overall; when over
  the limit the pixel still returns the GIF but nothing is recorded; clicks get `429`. Login 5/min.
- Logging: no addresses, subjects, tokens or full URLs in logs; access logs off.
- Secrets in `.env` (git-ignored), `.env.example` committed. DB password random per install.
- Dependency audit in `verify.ps1`: OWASP dependency-check (Maven) and `npm audit --audit-level=high`.

### 8.2 Threat model

| Threat | Mitigation | Residual risk |
|---|---|---|
| Internet scans of the public endpoint | No inbound ports; Funnel serves only `/t/` and `/c/`; connector route filter; identical 404s; no banners; rate limits. | The Funnel address is the only exposure. |
| Token guessing | 144-bit random tokens; pixel answers identically for unknown tokens (no oracle); rate limits. | Negligible (2^144 space). |
| Open redirect | `/c` only redirects to URLs stored at registration; `http`/`https` only; no request parameters used. | A stolen extension token could register a malicious target — see below. |
| XSS via subjects / user agents | React escaping only; no `dangerouslySetInnerHTML`; extension uses `textContent`; strict CSP; length limits. | Low. |
| Stolen extension token | Works only against `127.0.0.1` (attacker needs local access); scoped (no export, delete, settings, tokens); hashed at rest; revocable; last-used shown. | A local attacker could create redirect links on the tracking domain until revoked. |
| CSRF / DNS rebinding against localhost | SameSite=Strict cookie + CSRF token + Origin check + Host allow-list; Chrome's Local Network Access prompt adds another barrier. | Low. |
| Local database access | Postgres not published; strong random password; optional field encryption (Q4); recommend BitLocker; backups land in a git-ignored folder. | Anyone with full control of the PC can read everything — out of scope. |
| Third parties seeing data | Funnel relays see only encrypted traffic and IPs; InboxSDK telemetry blocked by DNR (Spike 1 proves zero requests). | Tailscale stays in the path (encrypted). |
| Supply chain | Pinned versions, lockfiles, dependency audits, no remote code in the extension. | Medium; accepted. |

## 9. Folder structure

```
email-tracker/
├─ CLAUDE.md                  rules and commands for Claude Code
├─ README.md                  (Phase 1)
├─ backend/                   Spring Boot (Maven wrapper)
│  └─ src/main/java/<base>/
│     ├─ common/              Clock, errors, web filters, IP utils, crypto
│     ├─ auth/                owner account, session cookie, API tokens, security config
│     ├─ tracking/            public controllers, ingest queue, classifier, finalizer, self-views
│     ├─ emails/              registration, links, marks, queries
│     ├─ contacts/  activity/  alerts/  reports/  settings/  data/ (export, delete, retention)
├─ dashboard/                 React app
├─ extension/                 MV3 extension
├─ infra/                     docker-compose.yml, backend Dockerfile, .env.example
├─ scripts/                   dev.ps1, verify.ps1, backup.ps1, funnel.ps1, new-extension-key.ps1
├─ spikes/                    Step 1 throwaway code (never imported by real code)
└─ docs/                      FEATURES, PLAN, DECISIONS, SETUP, LIMITATIONS, research/
```

## 10. Phases and definition of done

Each step ends with a checkpoint report, a commit on its own branch, and a stop for approval.

**Step 1 — Spikes (throwaway, `spikes/`)**
Setup: a tiny request logger (raw JSONL of every request) behind Tailscale Funnel (the real public
address), plus a minimal MV3 + InboxSDK extension. Needs: a second Gmail account, an Outlook.com account, the Gmail
phone app (Apple Mail if available).
1. Send hook: pixel inserted in `presending` appears in the received "Show original"; diff against an
   untracked control email shows no other change. Also: Undo Send, scheduled send, plain-text mode,
   confidential mode, reply with quoted pixel, Ctrl+Enter, Send & archive. Compare the proposed
   pre-registration flow with cancel-and-resend.
2. Public reach: requests logged for Gmail web, Gmail phone app, Outlook.com (Apple Mail optional):
   user agent, headers, IP, timing, repeat opens (proxy caching), HEAD requests.
3. Self-views: exact requests for Sent list, thread view, reply, Undo Send, phone view. DNR fragment
   rule test with `onRuleMatchedDebug`. Measured gap between self-view report and proxy fetch → size
   of the hold window.
4. Gmail IDs: `sent` event IDs vs `ThreadRowView`/`MessageView` IDs; correct row matched.
5. Extra checks: InboxSDK with telemetry blocked (zero requests, no breakage); service worker →
   `127.0.0.1` under Local Network Access; Funnel passes `HEAD`, sets `X-Forwarded-For` and returns
   404 on other paths; spam-folder check for emails carrying `*.ts.net` pixels.

**Phase 1 — Backend core.** Schema, public endpoints (`/t` and `/c`), ingest + finalizer, auth,
tokens, email registration, self-views, marks, activity, SSE, settings. Done when `verify.ps1` passes
with Testcontainers tests; on 8081 the pixel returns `200 image/gif` with no-cache headers and
`/api/**` returns 404; on 8080 `/api/**` returns 401 without credentials.

**Phase 2 — Public access.** Tailscale Funnel on the fixed `*.ts.net` address, `/t/` and `/c/` mounts,
start with Windows, SETUP.md.
Done when only `/t/*` and `/c/*` answer on the public hostname, a real open from another account is
saved through the tunnel, and SETUP.md rebuilds everything from scratch.

**Phase 3 — Extension (pixel only).** Compose flow, marks, self-view reports, DNR rules, notifications,
popup, options. Done when sending shows ✓; a recipient open gives green ✓✓ and a notification within
~1 min; Sent views, thread views and replies never count; with the backend stopped, email still sends.

**Phase 4 — Dashboard.** All screens with real data, light/dark, responsive, loading/empty/error states.
Done when every screen works on real data, new events appear without refresh, export and delete-all work.

**Phase 5 — Links + alerts.** Link rewriting, `/c` classification, bot flags, alert rules, alert
notifications. Done when clicks count and redirect, bot clicks are flagged, each alert rule has
Clock-driven unit tests and fires in a manual test.

**Phase 6 — Later (only after the owner confirms):** per-recipient tracking, PDF tracking, no-reply
alerts, scheduled/templates/mail merge.

## 11. Test plan

- **Backend unit:** token generation (length, alphabet, uniqueness), token regex, IP truncation,
  user-agent classification table, ingest rules, finalizer (self-view ±window, grace, dedupe, status
  promotion), bot click rules, alert rules (follow-up, spike, revival) with a fixed `Clock`, URL
  validation, settings validation, crypto round-trip and blind index (if Q4 = on).
- **Backend integration (Testcontainers + PostgreSQL 18):** pixel bytes and headers, always 200,
  unknown token identical response and no DB row; click 302 / 404 / no open redirect; port separation
  (API on 8081 → 404, tracking routes on 8081 only); `/api` 401 without auth, 403 for token scope
  violations; CSRF and Host checks; SSE delivery; export and delete-all; retention job.
- **Extension unit (Vitest + jsdom, saved Gmail DOM fixtures):** pixel insertion position, no duplicate
  pixel, quoted pixel removal (direct and proxy URL forms), link rewriting only in new text,
  self-only detection, plain-text/confidential detection, retry queue.
- **Dashboard (Vitest + Testing Library; test-only request mocks):** each screen's loading, empty,
  error and data states; filters; settings validation.
- **Manual end-to-end matrix:** recipients Gmail web, Gmail app, Outlook.com, Apple Mail (if
  available) × actions open, re-open, forward, reply, click; owner side Sent folder, thread view,
  reply, Undo Send, backend offline, tunnel offline. Results recorded in the checkpoint reports.

## 12. Risks

| Risk | Likelihood | Impact | Plan |
|---|---|---|---|
| Gmail UI change breaks InboxSDK | Medium | Marks/compose hooks stop | InboxSDK ships weekly; adapter isolates it; fail-open send path. |
| Blocking InboxSDK telemetry breaks it | Low | Extension unusable | Spike 1; fallback: allow only the error endpoint, or switch to gmail.js. |
| DNR cannot see the fragment | Medium | More reliance on reports | Layers L2–L4 already cover it. |
| Local Network Access blocks the worker | Medium | Extension cannot reach API | Grant permission once / policy; Spike 1. |
| `presending` edits not sent / scheduled send differs | Low–Medium | Untracked or broken sends | Spike 1; fallback flow in §4.1. |
| PC off: lost opens and broken links | High | Missing data; recipients see errors | Link tracking off by default (Q2); documented. |
| Proxy caching hides repeat opens | High | Under-counting | Documented; counts are lower bounds. |
| Pixel/links hurt deliverability | Low–Medium | Emails to spam | HTTPS, one consistent host, no shorteners; watch spam placement in Spike 2. |
| `*.ts.net` reputation or Funnel limits | Low–Medium | Spam placement or failed pixels | Spike 2 checks; fallback: free subdomain + Cloudflare named tunnel. |
| PC or tailnet renamed | Low | Every sent pixel breaks | SETUP.md warning; keep both names fixed. |

## 13. Open questions for the owner (Step 0)

Each has a recommended default. Answers will be recorded in DECISIONS.md.

| # | Question | Recommended default |
|---|---|---|
| Q1 | Public address: use Tailscale Funnel with a free Tailscale account? | Yes. Alternatives: free subdomain + Cloudflare named tunnel (fiddly, unreliable providers); Cloudflare quick tunnel (tests only). |
| Q2 | Link tracking default while the backend runs only on the PC? | Off by default, per-email switch on (D-029). |
| Q3 | InboxSDK: register a free App ID on inboxsdk.com and block its telemetry with extension rules? | Yes. Alternative: gmail.js + own DOM code (no registration, more fragile, more work). |
| Q4 | Encrypt subjects and email addresses in the database? | Yes: AES-256-GCM, key in `.env` (back it up separately), search runs in memory. Alternative: no, rely on BitLocker. |
| Q5 | Java version? | Install free Temurin 25 LTS: `winget install --id EclipseAdoptium.Temurin.25.JDK`. Alternative: keep the installed JDK 21. |
| Q6 | Send flow? | Register while composing, insert the pixel instantly at send (D-011). Alternative: the brief's "register at send, wait up to 2 s". |
| Q7 | Apple Mail Privacy Protection auto-loads? | Flag them and do not count them. |
| Q8 | Add three small Mailsuite-style extras to v1: "Mute this email" on notifications, per-email follow-up hours in compose, "open status may be unreliable" hint? | Yes to all three. |
| Q9 | Git workflow? | One branch per step/phase; `main` fast-forwarded after "approved" (D-024). |
| Q10 | Test accounts for Step 1? | Owner provides a second Gmail account, an Outlook.com account and the Gmail phone app; an Apple Mail device if available. |
