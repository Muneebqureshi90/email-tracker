# Decisions log

Format: ID · decision · options considered · why. Status is **Accepted** (decided), **Proposed**
(needs owner approval or a spike result), or **Pending Qn** (waiting on a Step 0 question).

## D-001 Product name and design — Accepted
MailPulse, original logo (pulse line in an envelope) and colours. No Mailsuite/Mailtrack names, text,
icons or UI assets. The ✓/✓✓ convention is a generic symbol; our icons are drawn from scratch.

## D-002 Monorepo — Accepted
`backend/`, `dashboard/`, `extension/`, `infra/`, `scripts/`, `spikes/`, `docs/` in one git repo.
Options: separate repos. Why: one owner, shared API contract, one verify script.

## D-003 One Spring Boot app with two connectors — Accepted
Port 8081 (public, tracking routes only) and 8080 (private API). Options: two separate apps (tracker +
API) with separate DB roles. Why: the brief asks for it, half the moving parts, and a route filter on
the public connector plus the tunnel's path rules give two independent layers. Revisit if the public
side ever needs to scale or run elsewhere.

## D-004 Dashboard served by the backend on 127.0.0.1:8080 — Accepted
Options: separate nginx container; Vite dev server only. Why: same origin as the API, so no CORS for the
dashboard, cookies and SSE just work, one container less. Vite dev server (with an `/api` proxy) is used
only during development.

## D-005 Dashboard session in an HttpOnly cookie — Accepted
JWT (HS256, 12 h) inside an `HttpOnly; SameSite=Strict` cookie, plus CSRF token, Origin check and Host
allow-list. Options: JWT in `localStorage` + `Authorization` header; server-side sessions. Why:
`EventSource` cannot send headers; scripts cannot read the cookie (XSS cannot steal it); still a JWT as
the brief asks. Password change invalidates older tokens via `password_changed_at`.

## D-006 Extension auth with scoped API tokens — Accepted
Random `mp_…` tokens, SHA-256 hashed at rest, revocable, scope `EXTENSION` limited to the endpoints the
extension needs. Why: a leaked token cannot export, delete or change settings, and only works on
localhost.

## D-007 Live dashboard updates with SSE — Accepted
Options: WebSocket (STOMP). Why: one-way server→browser traffic is all we need; SSE is plain HTTP,
reconnects by itself, replays with `Last-Event-ID` from the `activity` table, and Spring MVC supports it
with `SseEmitter`.

## D-008 Extension notifications by polling with chrome.alarms (30 s) — Accepted
Options: WebSocket from the service worker (needs keep-alive traffic every <30 s), offscreen document
holding SSE (not an allowed offscreen reason), Web Push (needs Google's push service — a third party).
Why: alarms survive service-worker shutdowns, wake the worker reliably, and 30 s keeps us inside the
1-minute goal. Current Chrome docs allow intervals down to 1 s, older versions 30 s.

## D-009 Gmail integration through InboxSDK behind an adapter — Accepted (Q3)
Options: gmail.js (last release 2025-01-01, XHR interception, no list-row API); custom DOM adapter (most
work, breaks most often). Why InboxSDK: actively maintained (weekly releases in 2026), MIT/Apache-2.0,
has every hook we need (presending/sent/sendCanceled, thread rows with tooltips, message views,
`isElementInQuotedArea`). Cost: free App ID registration and telemetry that options cannot fully stop
(see D-010). All InboxSDK calls live in `extension/src/gmail/` so a switch touches one folder.

## D-010 Block InboxSDK telemetry — Accepted (Spike 1 verifies)
`eventTracking: false`, `globalErrorLogging: false`, plus DNR block rules for `||api.inboxsdk.com^` and
`||pubsub.googleapis.com/v1/projects/mailfoogae/`. Why: the 2.2.33 source still sends passive events
and SDK errors (with a hash of the Gmail address) even with both options off.

## D-011 Register during compose, insert synchronously at send — Accepted (Q6; Spike 1 verifies)
Options: (a) the brief's flow — register at send, wait up to 2 s, which in InboxSDK means cancelling
`presending` and calling `send()` again; (b) register when the compose opens and register link URLs as
they are typed, then insert pixel/links synchronously in `presending`. Why (b): zero delay at send,
no cancel-and-resend (safer with Undo Send, scheduled send, Send & archive, shortcuts), and failing
open is automatic. Cost: unsent drafts leave `DRAFT` rows (purged after 24 h) and a link typed in the
last second may stay untracked. (a) stays as the fallback.

## D-012 Layered self-view suppression with a hold window — Accepted (Spike 3 tunes)
DNR block/self-header for direct requests, optional DNR fragment rule, self-view reports, a 30 s
`PENDING` hold, a 10 s send grace, and a full raw log (PLAN §4.3). Why: no single layer is reliable in
Gmail because Google's proxy fetches the pixel for both sender and recipient. Evidence for the DNR
fragment rule: Mailtrack's extension ships a rule that unwraps Gmail proxy URLs by their
`#original-url` part (research/mailsuite-product.md). Our rule is our own: it matches our host and
`/t/` path, never a user ID.

## D-013 Store every event for known tokens, none for unknown tokens — Accepted
Why: every dashboard number is explainable from raw events, while random scans cannot fill the
database.

## D-014 Token format — Accepted
18 random bytes, base64url, no padding (24 chars, 144 bits). Why: above the 128-bit minimum, fixed
length makes a cheap regex pre-check possible.

## D-015 Tracking responses never wait for the database — Accepted
A bounded in-memory queue and a worker save events. Why: the brief asks for fast, asynchronous saving.
Trade-off: events in the queue are lost if the process crashes (seconds of data at most).

## D-016 IP handling — Accepted
Store the client IP truncated (IPv4 /24, IPv6 /48) or not at all. Trust `X-Forwarded-For` only on
requests that arrive through Tailscale Funnel (Spike 2 confirms Funnel sets it). GeoIP off in v1 (Google's proxy hides reader IPs anyway);
a local DB-IP Lite or GeoLite2 file can be added later.

## D-017 User-agent parsing — Proposed
Own small classifier for the signals that matter (mail proxies, Apple MPP, known scanners) + Yauaa
8.3 limited to browser/OS/device fields for clicks and direct opens. Options: ua-parser (lighter, less
maintained); Yauaa for everything. Measure startup and memory in Phase 1 before final choice.

## D-018 Field encryption at rest — Accepted: option B (Q4)
Option A: none, rely on BitLocker and Postgres never being published. Option B: AES-256-GCM for
subjects, addresses and names (key in `.env`, key version stored per value) + HMAC-SHA256 blind index
for exact address lookups; subject search runs in memory after decrypting (fine for tens of thousands
of emails). Trade-off: B protects dumps/backups and casual DB reads, costs SQL `LIKE` search and adds
code; losing the key loses the data.

## D-019 Java 25 + Spring Boot 4.1 — Accepted (Q5)
Options: stay on the installed JDK 21. Why 25: current LTS (support to 2031), supported by Boot 4.1.

## D-020 TypeScript 6.0.x — Accepted
TypeScript 7.0.2 is the latest release, but `typescript-eslint` 8.72.1 supports `<6.1.0`. Pin 6.0.x and
revisit when typescript-eslint supports 7.

## D-021 Extension build tooling — Accepted (Phase 3): plain esbuild
Options: Vite + `@crxjs/vite-plugin` 3.0, WXT 0.21 (still 0.x), plain Vite multi-entry. Chosen: one
esbuild script (`extension/build.mjs`), as in the spikes. InboxSDK only needs `pageWorld.js` copied,
so a framework adds nothing but dependencies.

## D-022 Charts with Recharts 3 — Accepted
Options: Chart.js, ECharts, visx. Why: React-native API, actively maintained (3.10.1, Oct 2026), enough
for line/bar/heatmap-style charts.

## D-023 Local-only, free-only — Accepted (owner, 2026-10-29)
Everything runs on the owner's Windows PC in Docker. No paid services, no cloud hosting, no domain
purchase, no pricing/teams/billing features. Consequence: opens are lost and tracked links fail while
the PC is off (LIMITATIONS.md), which drives D-029.

## D-024 Git workflow — Accepted (Q9)
One branch per step/phase (`step-0-research`, `step-1-spikes`, `phase-1-backend`, …); after the
owner's "approved", fast-forward `main`. Why: matches the approval gates; `main` only holds approved
work.

## D-025 Pixel markup and placement — Accepted (Spike 1 confirms)
`<img src="…/t/<token>.gif" width="1" height="1" alt="" style="width:1px;height:1px;border:0">` inside
the first block of the new text. Never `display:none`. Why: survives Gmail's ~102 KB clipping and is
loaded by clients that skip hidden images.

## D-026 Thread marks show the latest tracked email in the thread — Proposed
Why: matches the common case of follow-ups in one thread. Revisit after reading Mailsuite's behaviour.

## D-027 A counted open proves delivery — Accepted
An open that passes every filter promotes `DRAFT`/`SCHEDULED`/`CANCELLED` to `SENT`. Why: covers missed
`sent` callbacks (backend down, scheduled send) without losing real opens.

## D-028 Public URL through Tailscale Funnel — Accepted (Q1)
A fully local setup cannot see opens: the recipient's mail app or Google's proxy must reach the pixel
over the internet. Options:
- Cloudflare named tunnel — stable, but needs an owned domain (yearly fee). Rejected: not free.
- Cloudflare quick tunnel (`trycloudflare.com`) — free, but a new random URL on every restart breaks
  every pixel already sent. Useful only for throwaway tests.
- ngrok free — shows a browser warning page, which breaks link clicks and may break pixels. Rejected.
- Free subdomain service + Cloudflare named tunnel — free, but slow approval, unreliable providers and
  possible spam-list problems. Fallback only.
- **Tailscale Funnel** — free on all plans, fixed `https://<pc-name>.<tailnet>.ts.net` hostname, TLS ends
  on the PC (relays cannot read requests), `--set-path` mounts expose only `/t/` and `/c/`, proxies to
  `http://127.0.0.1:8081`, runs in the background (`--bg`), no extra container.
Risks: shared `*.ts.net` reputation (Spike 2 checks spam placement), unpublished bandwidth limits, and
the hostname depends on the machine and tailnet names (renaming breaks sent pixels).

## D-029 Link tracking off by default — Accepted (Q2)
The brief wants link tracking on by default. With a PC-only backend, a click while the PC is off shows
the recipient an error page instead of the destination. Default off, per-email toggle on.

## D-030 Never replace the Sent copy to remove the pixel — Accepted
Mailsuite's "Debeaconizer" swaps the sender's Sent copy for one with an inactive pixel. It is covered by
US patent 10,749,835 (estimated expiry 2036-12-30) and needs Gmail API access with Google's broadest
Gmail permission. MailPulse uses its own layers instead (D-012).

## D-031 Extension-only: no Gmail API permission — Accepted
Mailsuite sends mail through its own servers via the Gmail API. MailPulse inserts the pixel in the
browser and lets Gmail send normally, so it needs no Google OAuth permission and no body leaves the
browser. Cost: per-recipient copies, a MailPulse-run scheduler and the Sent-copy trick are not possible
as-is; per-recipient tracking needs fresh research in the later phase.

## D-032 Notifications follow current settings — Accepted
Mailsuite fixes notification settings per email at send time. MailPulse applies the settings in force
when the event happens, so "mute" and setting changes take effect immediately. Simpler and clearer.

## D-033 No outgoing email — Accepted
Reminders, alerts and reports appear as desktop notifications and dashboard pages. Mailsuite emails
them. Why: local-only and free; no SMTP server, no Gmail send permission.

## D-034 Device details only where they are real — Accepted
Opens through Gmail's proxy show "via Gmail" with no device or location (Mailsuite removed device
details for the same reason). Browser/OS/device appear only for clicks and direct (non-proxied) opens.

## D-035 Link tracking switch per email — Accepted (brief)
The brief asks for a per-email link-tracking toggle. Mailsuite uses a per-link choice plus a global
default. We follow the brief; a per-link choice can come later.

## Owner answers, 2026-10-29
"Approved, defaults" for Q1–Q10, plus six additions recorded below (D-036 to D-039) and in
SETUP.md: InboxSDK pinned to a version at least 14 days old, a 15 s hold-window test in Spike 3,
SETUP.md steps against Windows sleep, a spam-placement check in Spike 2, an encryption-key backup
step, and no Apple device for testing. Q7 (Apple prefetch flagged, not counted) and Q8 (three small
extras in v1) are accepted.

## D-036 Dependency age rule — Accepted (owner)
Install only versions published at least 14 days before the install date, pinned exactly (no `^`/`~`).
npm: `npm install --save-exact --before=<today minus 14 days>` so transitive packages follow the same
rule; the lockfile is committed. Maven: check the release date on Maven Central before adding or
bumping a dependency. Step 1 pins `@inboxsdk/core` 2.2.30 (published 2026-10-08); 2.2.31–2.2.33 are
newer than 14 days on 2026-10-29.

## D-037 Self-view hold window: 15 s or 30 s — Pending Spike 3
Spike 3 measures the gap between the extension's self-view report and Google's proxy fetch. Use 15 s if
every observed gap plus a 3 s margin fits inside 15 s; otherwise keep 30 s. The measured numbers go here.

## D-038 No Apple Mail testing — Accepted (owner)
No Apple device is available. Apple Mail Privacy Protection detection relies on published signatures
only; flagged events stay visible in the raw log so the rule can be corrected later.

## D-039 Spike safety — Accepted
The Step 1 test extension only touches emails whose subject contains a test code such as `[S1-B]`.
All other emails send unchanged. It is removed after Step 1.

## Phase 1 decisions (2026-10-29)

## D-040 No CSRF tokens: SameSite=Strict + CORS allow-list — Accepted (supersedes part of D-005)
The session cookie is `SameSite=Strict`, so browsers never attach it to cross-site requests. The CORS
filter covers every path and rejects any cross-origin request whose origin is not the dashboard or the
pinned extension (tested: a POST from `https://evil.example` gets 403). Request bodies are JSON only,
which a plain HTML form cannot send. Options: Spring Security CSRF tokens (double-submit cookie).
Why: same protection here with less moving parts for the dashboard and the extension.

## D-041 BCrypt for the owner password — Accepted (changes PLAN §8.1)
Spring Security's default delegating encoder (BCrypt). Argon2id would need the BouncyCastle library.
BCrypt only reads the first 72 bytes, so passwords are limited to 12–72 bytes.

## D-042 Own rate limiter — Accepted
A 60-line in-memory token bucket driven by the injectable Clock, instead of Bucket4j: one dependency
less and easy to test. Public routes: 120 requests/min per client, 1,200/min overall; when over the
limit the pixel still answers but nothing is recorded, clicks get 429. Login, setup and password
change: 5/min each, plus a 15-minute lockout after 10 failed logins.

## D-043 User-agent parsing stays small — Accepted (updates D-017)
Phase 1 only needs the signals in EventClassifier (mail proxies, Apple prefetch, scanners). A full
parser such as Yauaa is only useful for device details on clicks and direct opens (D-034), so it is
deferred to the phase that shows them.

## D-044 No Swagger UI — Accepted (owner, 2026-10-29)
The brief mentions Swagger on the private port. Phase 1 leaves it out: the API contract is PLAN §6
and every endpoint is exercised by integration tests. springdoc can be added on the private port
later if wanted (one dependency).

## D-045 Link URLs are encrypted too — Accepted
Q4 covered subjects and addresses. Tracked link URLs can be just as private (shared document links),
so they are AES-GCM encrypted as well, with a blind index to keep one row per email and URL.
The redirect decrypts one value per click.

## D-046 Spring JDBC (JdbcClient) instead of JPA — Accepted
Counters, `FOR UPDATE SKIP LOCKED`, `ON CONFLICT` upserts and blind-index lookups read more clearly
as explicit SQL. No lazy loading or entity state to reason about.

## D-047 Container images — Accepted
Version-pinned tags whose software release is at least 14 days old: `postgres:18.6-alpine`,
`eclipse-temurin:25.0.4.1_1-jre`, `maven:3.9.12-eclipse-temurin-25`. Official images are rebuilt
for operating-system patches under the same tag; those rebuilds are accepted. The backend runs as
an unprivileged user. While the owner's own Java 25 install was pending, the build used a
checksum-verified portable Temurin 25.0.4.1 in a temporary folder.

## D-048 Trusted proxies in Docker — Accepted
Inside Docker, requests arrive from the Docker gateway (private address ranges), so
`X-Forwarded-For` is trusted only from 127.0.0.1, ::1, 172.16.0.0/12, 192.168.0.0/16 and
10.0.0.0/8. Only processes on this PC can reach the published ports.

## Owner answers, 2026-10-29 (after Phase 1)
"Phase 1 approved. No Swagger." Then: build Phases 2-5 in one run without stopping or asking;
take the recommended default for every open decision and log it here; make every part that the
spikes have not proven yet a setting (self-view hold, send mode, DNR blocking, confidential-mode
tracking); use placeholders for anything that needs the owner (Tailscale sign-in, InboxSDK App ID,
test accounts) and list them in the final checklist.

## Phase 2 decisions (2026-10-29)

## D-049 Funnel mounts managed by scripts/funnel.ps1 — Accepted
`tailscale funnel --bg --https=443 --set-path=/t http://127.0.0.1:<public port>/t`, and the same for
`/c`. If the pixel does not answer through the mount, the script falls back to the bare-port target
(the same A/B check as Spike 2, because Tailscale's path handling is not documented). `off` removes
only these two mounts (`--set-path=... off`) instead of `funnel reset`, which would also delete any
other Serve/Funnel settings on the PC.

## D-050 Start with Windows through a Startup-folder shortcut — Accepted
Options: a Task Scheduler logon task (registering one often needs administrator rights), a Windows
service (needs administrator rights and starts before Docker Desktop). Why: no administrator rights,
visible under Task Manager → Startup apps, removed with one command. Docker Desktop's own sign-in
setting and `restart: unless-stopped` bring the containers back; the script also starts a stopped
stack and re-checks the Funnel mounts.

## D-051 Line endings — Accepted (owner)
`* text=auto eol=lf` and `core.autocrlf false`, as the owner asked. `*.cmd` and `*.bat` keep CRLF
because cmd.exe misreads LF-only batch files (labels and `goto`). PowerShell scripts stay ASCII so
Windows PowerShell 5.1 reads them correctly without a byte-order mark; verify.ps1 checks this.

## D-052 Public checks from the PC plus one phone check — Accepted
`check-public.ps1` tests the Funnel paths from the PC (MagicDNS routes the request to the PC's own
Tailscale node). A phone on mobile data proves the internet path. No external uptime monitor,
because that would be another third party seeing the address.

## Phase 3 decisions (2026-10-29)

## D-053 Unproven extension behaviour is a setting — Accepted (owner request)
The spikes have not run yet, so every uncertain part can be switched without new code: self-view
hold (`selfViewWindowSeconds`, default 30), send mode (`PRESYNC` = insert the pixel synchronously at
send, default; `CANCEL_RESEND` = cancel, register with a 2 s limit, insert, send again), DNR blocking
of the owner's own pixel loads (default on) and tracking of confidential-mode emails (default on).
They live in the backend `settings` row (migration V2) so there is one place to change them (the
dashboard), and reach the extension through `GET /api/config`.

## D-054 Fixed extension ID from a committed public key — Accepted
`extension/static/manifest.json` carries a public key, so the unpacked extension always has the ID
`pdinoocioohoejhjbeepjdadkkjldgeo` and `MAILPULSE_EXTENSION_ORIGINS` can be pre-filled. The private key
was never stored (no Chrome Web Store upload). Options: a key generated per install (one more setup
step). The ID is not a secret: the API still needs the bearer token and is only on 127.0.0.1.

## D-055 Gmail DOM checks without spike evidence — Accepted (Spike 1 revisits)
Plain-text mode is not detected (no reliable signal known; Gmail drops the pixel, so the email is
only untracked). Confidential mode is detected from the English "Content expires" notice. For
scheduled send the pixel goes in when the schedule menu opens and the email is reported as
`SCHEDULED` when the window closes, because `presending`/`sent` may not fire. All in LIMITATIONS.md.

## D-056 Extension security boundaries — Accepted
Content scripts never call the API; the service worker does, with the token kept in
`chrome.storage.local` restricted to trusted contexts (content scripts cannot read it). The backend
URL must be `http://127.0.0.1:<port>` or `http://localhost:<port>`, so the token cannot be sent
elsewhere. Lint bans `innerHTML`, `outerHTML`, `insertAdjacentHTML`, InboxSDK's HTML insert and
`dangerouslySetInnerHTML`; notifications and tooltips are plain text.

## D-057 Pause switch is local to the browser — Accepted
The popup switch "Track emails I send from Gmail" is stored in the extension, not the backend, so it
works even when the backend is down. The backend's "track new emails by default" decides the
starting state of each compose window; a button in the compose toolbar changes it per email.

## D-058 Live marks through Kefir streams — Accepted
InboxSDK views accept Kefir observables and re-render when they emit, so ✓ turns into ✓✓ without
reloading Gmail. `kefir` 3.8.8 (already inside InboxSDK's dependency tree, published years ago) is a
direct dependency.

## D-059 Security fixes count the 14 days by calendar date — Accepted
`npm audit` found eight high advisories in `undici` 8.12.1, a test-only dependency of jsdom. The fix,
8.12.2, was published on 2026-10-15, 14 calendar days before the install (a few hours short of 14×24
hours). It is pinned with an npm `overrides` entry. Rule from now on: a version that fixes a high or
critical advisory may be used once 14 calendar days have passed since its release.

## Phase 4 decisions (2026-10-29)

## D-060 Dashboard built on the PC, copied into the backend image — Accepted
`dev.ps1` runs `npm ci` and `npm run build` in `dashboard/` and the Docker build copies
`dashboard/dist` into the jar's `static/` folder. Options: a Node stage inside the Dockerfile. Why:
Tailwind 4 and Vite 8 ship platform-specific native packages, and a lockfile made on Windows can miss
the Linux ones; building on the host avoids that and keeps Node out of the image. The build context
is the repository root with an allow-list `.dockerignore` (only `backend/pom.xml`, `backend/src/main`
and `dashboard/dist` are sent to Docker).

## D-061 Dashboard routes and a strict Content-Security-Policy — Accepted
`DashboardController` forwards the app's own routes (`/emails/{id}` and so on) to `index.html`, so a
notification link opens the right page in a new tab; everything else stays closed. The CSP has no
`unsafe-inline`: React sets styles through the CSSOM, Vite emits files only, and the chart library
loads as a separate chunk. Charts have a screen-reader table and no animation.

## D-062 Reports from counted events in the owner's time zone — Accepted
Daily (per hour) and weekly (per day, Monday start) reports count only `COUNTED` events, bucketed in
Java with the settings time zone. "Opened" is the share of emails sent in the period that were ever
opened or clicked. Top contacts give each recipient of an email that email's opens, because there are
no per-recipient pixels (Phase 6).

## D-063 Export and delete-all — Accepted
`GET /api/export` returns one decrypted JSON file (emails with recipients, links and every event,
contacts, accounts, settings). `DELETE /api/data` needs the exact text `DELETE ALL MY DATA` and the
password, then runs one `TRUNCATE` of all tracking tables; the owner account, settings and tokens stay.
It is deliberately not wrapped in a transaction, so a wrong password still counts towards the login
lockout. Both are owner-only (extension tokens get 403).

## D-064 One endpoint for per-email switches — Accepted (changes PLAN §6)
PLAN §6 lists `PATCH /api/emails/{id}/tracking`. The existing `PATCH /api/emails/{id}/preferences`
already carries `trackingEnabled` (and `notifications`, `followUpHours`), so the dashboard uses it and
no second endpoint was added.

## Phase 5 decisions (2026-10-29)

## D-065 Scanner clicks are flagged, not counted — Accepted
Two click-only rules after the send grace: a click within 15 s of sending is `BOT_TIMING` (security
scanners follow links on delivery), and three or more different links of one email clicked within
2 s is `BOT_BURST`. Flagged clicks still redirect and stay visible in the email's timeline with the
reason. A counted click alone marks the email as engaged (✓✓).

## D-066 Alerts are activity items — Accepted
Alerts live in an `alert` table (migration V3) and each one also becomes an `activity` row, so desktop
notifications and the live dashboard need no second channel. Follow-up: checked every 5 minutes,
raised once per email when nothing was opened or clicked within the email's follow-up time (per-email
24/48/72 h or the default), and not raised more than 7 days after it was due (no flood after the PC
was off). Open spike: raised when an open makes the count within the window reach the threshold,
at most once per window. Revival: raised when an open follows at least `revivalDays` without opens.
A muted email still gets alerts in the dashboard but no desktop notification. Snoozed alerts come
back as new (and notify again) when the snooze ends.

## D-067 Link tracking in the compose window — Accepted
A "Track links" checkbox per compose window (default from Settings, off by default, D-029). While
the owner types, the extension sends only the link URLs of the new text (1 s after the last change)
and gets tracked URLs back; at send it rewrites those links synchronously. Quoted text is never
changed, links not yet registered stay as they are (fail open), and links whose visible text is
itself a URL are not rewritten, so the visible text and the real target never disagree (spam
filters dislike that, and it looks like phishing).

## D-068 The three small extras (Q8) — Accepted
"Mute this email" is a button on single-email desktop notifications (it turns notifications off
for that email through the extension token). The follow-up time can be chosen per email in the
compose status bar and on the email page (default, 24, 48 or 72 hours). When every recipient uses a
provider that blocks images by default, Gmail tooltips and the email page say "open status may be
unreliable".
