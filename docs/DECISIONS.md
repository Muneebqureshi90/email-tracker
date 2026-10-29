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

## D-004 Dashboard served by the backend on 127.0.0.1:8080 — Proposed
Options: separate nginx container; Vite dev server only. Why: same origin as the API, so no CORS for the
dashboard, cookies and SSE just work, one container less. Vite dev server (with an `/api` proxy) is used
only during development.

## D-005 Dashboard session in an HttpOnly cookie — Proposed
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

## D-009 Gmail integration through InboxSDK behind an adapter — Pending Q3
Options: gmail.js (last release 2025-01-01, XHR interception, no list-row API); custom DOM adapter (most
work, breaks most often). Why InboxSDK: actively maintained (weekly releases in 2026), MIT/Apache-2.0,
has every hook we need (presending/sent/sendCanceled, thread rows with tooltips, message views,
`isElementInQuotedArea`). Cost: free App ID registration and telemetry that options cannot fully stop
(see D-010). All InboxSDK calls live in `extension/src/gmail/` so a switch touches one folder.

## D-010 Block InboxSDK telemetry — Proposed (Spike 1 verifies)
`eventTracking: false`, `globalErrorLogging: false`, plus DNR block rules for `||api.inboxsdk.com^` and
`||pubsub.googleapis.com/v1/projects/mailfoogae/`. Why: the 2.2.33 source still sends passive events
and SDK errors (with a hash of the Gmail address) even with both options off.

## D-011 Register during compose, insert synchronously at send — Proposed (Spike 1 + Q6)
Options: (a) the brief's flow — register at send, wait up to 2 s, which in InboxSDK means cancelling
`presending` and calling `send()` again; (b) register when the compose opens and register link URLs as
they are typed, then insert pixel/links synchronously in `presending`. Why (b): zero delay at send,
no cancel-and-resend (safer with Undo Send, scheduled send, Send & archive, shortcuts), and failing
open is automatic. Cost: unsent drafts leave `DRAFT` rows (purged after 24 h) and a link typed in the
last second may stay untracked. (a) stays as the fallback.

## D-012 Layered self-view suppression with a hold window — Proposed (Spike 3 tunes)
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

## D-018 Field encryption at rest — Pending Q4
Option A: none, rely on BitLocker and Postgres never being published. Option B: AES-256-GCM for
subjects, addresses and names (key in `.env`, key version stored per value) + HMAC-SHA256 blind index
for exact address lookups; subject search runs in memory after decrypting (fine for tens of thousands
of emails). Trade-off: B protects dumps/backups and casual DB reads, costs SQL `LIKE` search and adds
code; losing the key loses the data.

## D-019 Java 25 + Spring Boot 4.1 — Pending Q5
Options: stay on the installed JDK 21. Why 25: current LTS (support to 2031), supported by Boot 4.1.

## D-020 TypeScript 6.0.x — Accepted
TypeScript 7.0.2 is the latest release, but `typescript-eslint` 8.72.1 supports `<6.1.0`. Pin 6.0.x and
revisit when typescript-eslint supports 7.

## D-021 Extension build tooling — Proposed (decide in Phase 3)
Options: Vite + `@crxjs/vite-plugin` 3.0, WXT 0.21 (still 0.x), plain Vite multi-entry. Spikes use a
single esbuild command. Decide after Spike 1 shows InboxSDK's bundling needs.

## D-022 Charts with Recharts 3 — Proposed
Options: Chart.js, ECharts, visx. Why: React-native API, actively maintained (3.10.1, Oct 2026), enough
for line/bar/heatmap-style charts.

## D-023 Local-only, free-only — Accepted (owner, 2026-10-29)
Everything runs on the owner's Windows PC in Docker. No paid services, no cloud hosting, no domain
purchase, no pricing/teams/billing features. Consequence: opens are lost and tracked links fail while
the PC is off (LIMITATIONS.md), which drives D-029.

## D-024 Git workflow — Pending Q9
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

## D-028 Public URL through Tailscale Funnel — Proposed (Q1)
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

## D-029 Link tracking off by default — Proposed (Q2)
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
