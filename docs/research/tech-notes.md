# Technical research notes (Step 0)

Collected 2026-10-29. Sources are listed per section. "Verified" means read in a primary source
(registry, source code, official docs). "Inferred" means reasoning that a Step 1 spike must confirm.

## 1. Current versions

Queried from the npm registry (`npm view`), Maven Central (`maven-metadata.xml`) and endoflife.date
on 2026-10-29.

| Component | Latest stable | Notes |
|---|---|---|
| Java (Eclipse Temurin) | 25.0.5 (LTS, EOL 2031-09-30) | 27 is current non-LTS. Owner has JDK 21.0.9 installed (LTS, older). |
| Spring Boot | 4.1.2 (2026-10-22) | Supports Java 17–26. 4.0.x OSS support ends 2026-12-31. 4.2.0-RC1 is out (GA expected soon). |
| PostgreSQL | 18.6 | Docker image `postgres:18`. |
| Flyway | 13.11.1 | Use the version managed by Spring Boot plus `flyway-database-postgresql`. |
| Testcontainers | 2.0.5 | 2.x renamed module artifacts; use the Boot-managed version. |
| Bucket4j | 8.21.0 (`com.bucket4j:bucket4j_jdk17-core`) | In-memory rate limiting. |
| Yauaa (UA parser) | 8.3.0 | Accurate but heavy; see DECISIONS for the lighter alternative. |
| OWASP dependency-check-maven | 13.0.0 | Needs a free NVD API key for reasonable speed; first run downloads the NVD database. |
| Node.js | 24 LTS (24.22.2); 26 became LTS 2026-10-28 | Owner has 24.19.0 — fine. Vite 8 needs `^20.19 \|\| >=22.12`. |
| React | 19.3.1 | |
| Vite | 8.3.5 | |
| Tailwind CSS | 4.3.3 | v4 Vite plugin setup. |
| TypeScript | 7.0.2 latest, **use 6.0.3** | `typescript-eslint` 8.72.1 peer range is `>=4.8.4 <6.1.0`, so TS 7 breaks linting today. |
| TanStack Query | 5.105.0 | |
| React Router | 8.5.1 | |
| Recharts | 3.10.1 | |
| Vitest | 5.0.5 | |
| ESLint | 10.13.0 | Flat config. |
| Prettier | 3.9.10 | |
| Playwright | 1.64.1 | Optional dashboard E2E. |
| WXT (extension framework) | 0.21.5 | Still 0.x. |
| @crxjs/vite-plugin | 3.0.0 | |
| @inboxsdk/core | 2.2.33 (2026-10-27) | Released roughly weekly through 2026. |
| gmail-js | 1.1.16 (last publish 2025-01-01) | No release for ~22 months. |

Spring Boot 4 notes (from release notes knowledge, to re-check while scaffolding Phase 1): Jackson 3
is the default JSON library (`tools.jackson` packages), starters are modularised
(for example `spring-boot-starter-webmvc`), Spring Security 7, Hibernate 7.

## 2. InboxSDK — verified by reading the published package

Method: `npm pack @inboxsdk/core@2.2.33` into the scratchpad and read `inboxsdk.js`,
`background.js` and the bundled `.d.ts` files. The code was never installed or executed.

### Licence and MV3 setup
- Licence: `MIT OR Apache-2.0`.
- The package ships `background.js`. Imported in the extension service worker, it listens for the
  `inboxsdk__injectPageWorld` message and runs `chrome.scripting.executeScript({ world: 'MAIN',
  files: ['pageWorld.js'] })`. So the extension needs the `scripting` permission and must ship
  `pageWorld.js` in its build output. All SDK code is bundled — no remotely hosted code.

### App ID
- The App ID is checked **offline**: a regex plus a SHA-1 check of the name (`isValidAppId`).
  No network call validates it.
- With an unregistered ID the SDK still starts, but logs an error and shows a top bar:
  "Registration is free but necessary to load the SDK" with a link to `register.inboxsdk.com`.
- Conclusion: we need to register a free App ID once (registration is on InboxSDK's site).

### Telemetry — cannot be fully disabled with options
Endpoints found in the bundle:
- `POST https://api.inboxsdk.com/api/v2/errors` — error reports, rate-limited to 10 per minute.
- `GET https://api.inboxsdk.com/api/v2/events/oauth` — fetches a token for event upload.
- `POST https://pubsub.googleapis.com/v1/projects/mailfoogae/topics/events:publish` — batched usage
  events (Streak's Google Cloud project), flushed at most every 120 s from a localStorage queue.

Load options (`platform-implementation.d.ts`): `globalErrorLogging: boolean`, `eventTracking: boolean`
(both default `true`).

What the options do, from the code:
- `eventTracking: false` stops "sdkActive" events (user-triggered actions) and "Site" events.
- It does **not** stop "sdkPassive" events (for example `load`, `instantiate`, handler registrations,
  Gmail DOM-detection diagnostics). Those are still queued and sent by the logger master.
- `globalErrorLogging: false` stops capturing the extension's own uncaught errors. InboxSDK's own
  internal errors are still sent to `/api/v2/errors`.
- Every event/error includes: a salted SHA-256 hash of the Gmail address (`sha256('inboxsdk:' + email)`),
  the extension ID, App IDs, a session ID, page origin and SDK versions. Error details can include
  Gmail HTML, passed through `censorHTMLstring` (text nodes and non-whitelisted attribute values are
  replaced with `...`). No evidence of message bodies or subjects being sent in clear, but the hash
  of the address is a stable identifier.

Mitigation: set both options to `false` **and** add declarativeNetRequest block rules for
`||api.inboxsdk.com^` and `||pubsub.googleapis.com/v1/projects/mailfoogae/` (initiator
`mail.google.com`). The send calls are fire-and-forget with `.catch`, so blocking should only cause
console noise. Spike 1 must confirm that nothing breaks and that zero requests leave for those hosts.

### Compose API (from `views/compose-view.d.ts`)
- Events: `presending { cancel() }`, `sending`, `sent { getMessageID(): Promise<string>, getThreadID():
  Promise<string> }`, `sendCanceled`, `scheduleSendMenuOpening { cancel() }`,
  `scheduleSendMenuOpenCanceled`, `discard { cancel() }`, `destroy` (carries the saved draft's message
  ID when closed unsent), `bodyChanged`, `recipientsChanged`, `subjectChanged`, `draftSaved`,
  `messageIDChange`, `responseTypeChanged`.
- Methods: `send({ sendAndArchive })`, `openScheduleSendMenu()`, `getBodyElement()`, `getHTMLContent()`,
  `setBodyHTML()`, `insertHTMLIntoBodyAtCursor()`, `getSubject()`, `getToRecipients()`,
  `getCcRecipients()`, `getBccRecipients()`, `getFromContact()`, `isReply()`, `isForward()`,
  `isInlineReplyForm()`, `getDraftID()`, `addButton()`, `addComposeNotice()`, `addStatusBar()`.
- **Not present:** any confidential-mode or plain-text-mode detection. These need a small DOM check
  inside our Gmail adapter.
- Unknown until Spike 1: whether body edits made synchronously in `presending` are always included
  in the sent MIME; how `sent` and `sendCanceled` behave with Undo Send; whether `presending` fires
  for scheduled send (the existence of `scheduleSendMenuOpening` suggests a separate path).

### Lists and conversations
- `ThreadRowView`: `addLabel`, `addImage({ imageUrl, imageClass, tooltip, orderHint, onHover })`,
  `addAttachmentIcon`, `replaceDate`, `getThreadIDAsync()`, `getThreadIDIfStableAsync()`,
  `getDraftID()`, `getVisibleMessageCount()`, `getContacts()`, `getSubject()`.
  → ✓/✓✓ with a tooltip fits `addImage` (tooltip is a plain string, so no HTML injection).
- `MessageView`: `getBodyElement()`, `getMessageIDAsync()`, `isElementInQuotedArea(el)`, `isLoaded()`,
  `getViewState()`, events `load`/`viewStateChange`/`destroy`, `getSender()`,
  `getRecipientEmailAddresses()`, `addAttachmentIcon({ iconUrl, iconClass, tooltip })`.
  → Self-view detection: scan `getBodyElement()` for our pixel; `isElementInQuotedArea` tells us
  whether it sits in quoted text.
- IDs: the driver reads Gmail's `data-legacy-thread-id` and `data-legacy-message-id` attributes, so
  InboxSDK IDs are Gmail's legacy hex IDs. Spike 4 confirms the `sent` event returns the same format.

## 3. gmail.js
- `gmail-js` 1.1.16, last published 2025-01-01. Must run in the page's MAIN world and works by
  intercepting Gmail's XHR traffic. No thread-row decoration API (we would hand-write DOM code).
- Keep it only as a fallback if InboxSDK becomes unusable.

## 4. Chrome MV3 platform
- **Alarms** (developer.chrome.com/docs/extensions/reference/api/alarms, read 2026-10-29): the current
  page says Chrome limits alarms "to at most once every second". Older Chrome versions enforced 30 s
  (Chrome 120+) or 1 min. `persistAcrossSessions` exists from Chrome 150 (default true). The docs
  recommend re-creating alarms when the service worker starts. A 30 s poll is safe on any version.
- **declarativeNetRequest and URL fragments:** Chromium's matcher (`components/url_pattern_index/
  url_pattern.cc`, `UrlInfo(const GURL&)`) matches against `url.possibly_invalid_spec()`, the full URL
  spec, which includes a `#fragment` *if* the request URL carries one. Whether Blink keeps the fragment
  on image requests sent to the network layer is not documented. A Safari developer reported that
  Safari's DNR ignores fragments. **Spike 3 must test** a rule that matches
  `googleusercontent.com/...#https://track.<domain>/t/` with `onRuleMatchedDebug`.
- **Local Network Access (LNA):** Chrome 142 launched a permission prompt for requests from public
  sites to local/loopback addresses. Service-worker requests need the permission pre-granted
  (blink-dev intent-to-ship, Feb 2026). A localhost page calling a localhost API is not a
  "public to local" request, so the dashboard is unaffected. **No documentation covers extension
  service workers** (origin `chrome-extension://`). Spike 1 must check that the service worker can call
  `http://127.0.0.1:8080`. Fallbacks: grant the permission once for the extension, or use the
  enterprise policy `LocalNetworkAccessAllowedForUrls`.
- Content scripts in MV3 follow the page origin's CORS rules, so every backend call goes through the
  service worker (as the brief requires).

## 5. Cloudflare Tunnel
(developers.cloudflare.com … /local-management/configuration-file/, read 2026-10-29)
- Locally-managed tunnels support `hostname` plus a `path` **regular expression** per ingress rule.
- A catch-all rule (`service: http_status:404`) must end the list. Rules are evaluated first to last;
  `cloudflared tunnel ingress rule <url>` tests a URL against them.
- Planned config:

```yaml
ingress:
  - hostname: track.example.com
    path: ^/(t|c)/[A-Za-z0-9_-]+(\.gif)?$
    service: http://backend:8081
  - service: http_status:404
```

- A named tunnel needs a domain whose DNS is on Cloudflare (full nameserver setup). Quick tunnels
  (`trycloudflare.com`) give a random URL each run — spikes only.
- Cloudflare terminates TLS, so Cloudflare sees every tracking request (path, IP, user agent).

## 6. Mail clients and proxies (summary; Spike 2 measures the real behaviour)
- Gmail fetches remote images through its proxy; the user agent contains
  `(via ggpht.com GoogleImageProxy)` and the IP is Google's, so reader IP/device are hidden.
- The proxy can cache, so repeat opens by the same reader may not reach the server.
- No confirmed 2025–2026 change makes Gmail prefetch images at delivery. There are anecdotal reports
  (Dec 2024) of some messages not loading images by default.
- The sender's own view in Gmail almost certainly loads the pixel through the same proxy, which makes
  it indistinguishable from a recipient open on the server side (Inferred; Spike 3 measures it).

## 7. Tailscale Funnel (free public URL)
Added after the owner required a free, local-only setup.
- "Tailscale Funnel is available for all plans" — includes the free Personal plan. (Verified)
- Funnel listens only on ports 443, 8443 and 10000. (Verified)
- TLS terminates on the owner's device; "Funnel relay servers do not decrypt the traffic". (Verified)
- `--set-path=<path>` mounts a target under a path; `--bg` keeps the Funnel running across reboots
  until turned off; for proxies "only `http://127.0.0.1` is currently supported". (Verified)
- Traffic is "subject to non-configurable bandwidth limits" (no figures). Fine for 43-byte pixels.
- Not documented, to check in Spike 2: hostname rule (examples suggest `<machine>.<tailnet>.ts.net`),
  what unmounted paths return (third-party guides say 404), whether `X-Forwarded-For` carries the
  client IP, whether `HEAD` passes through.
- Planned commands (exact syntax confirmed in Spike 2):
  `tailscale funnel --bg --set-path=/t/ http://127.0.0.1:8081/t/` and the same for `/c/`.

## Sources
- https://tailscale.com/kb/1223/funnel
- https://tailscale.com/kb/1311/tailscale-funnel
- npm registry and Maven Central metadata, queried 2026-10-29.
- https://endoflife.date/api/spring-boot.json, eclipse-temurin.json, postgresql.json, nodejs.json
- `@inboxsdk/core@2.2.33` tarball: `inboxsdk.js` (logger around lines 16200–16930, App ID check
  around 39805–39945), `background.js`, `src/platform-implementation-js/**/*.d.ts`
- https://inboxsdk.github.io/inboxsdk-docs/
- https://developer.chrome.com/docs/extensions/reference/api/alarms
- https://raw.githubusercontent.com/chromium/chromium/main/components/url_pattern_index/url_pattern.cc
- https://developer.apple.com/forums/thread/725892 (Safari DNR fragment report)
- https://developer.chrome.com/blog/local-network-access
- https://groups.google.com/a/chromium.org/g/blink-dev/c/8AK8V4fSZFU (LNA and service workers)
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/
- https://www.suped.com/email-deliverability/answers/how-does-gmails-image-proxy-affect-email-open-tracking-and-what-could-cause-very-fast-opens
- https://www.suped.com/knowledge/email-deliverability/troubleshooting/is-gemini-integration-causing-a-drop-in-gmail-open-rates
