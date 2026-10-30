# MailPulse — rules for Claude Code

Private, self-hosted Gmail open/click tracker for the owner's personal use. Plan: docs/PLAN.md.
Decisions: docs/DECISIONS.md. Research notes: docs/research/.

## Process
- Work in steps/phases (PLAN §10). Stop after each with a checkpoint report and wait for "approved".
- Evidence over claims: run it before saying it works; show test output.
- No mock data in the real app, no TODO placeholders, no "implement later" stubs.
- Never change scope silently. Ask before adding a paid service or anything that sends data to a
  third party.
- `scripts/verify.ps1` must pass before every commit. One git branch per step/phase.
- Before building a feature that copies Mailsuite, re-open that page on mailsuite.com
  (notes in docs/research/mailsuite-*.md).
- Owner uses Windows 11 + PowerShell: give PowerShell commands.
- Free and local only: runs on the owner's PC, for the owner only. No paid services, cloud hosting,
  domain purchase, pricing, teams or billing features.

## Hard rules
- Never store or send email bodies. The extension sends only account, subject, recipients, link URLs.
- Public port 8081 serves only `GET/HEAD /t/{token}.gif` and `/c/{token}`; everything else 404.
  The internet reaches it only through Tailscale Funnel mounts for `/t/` and `/c/`.
- `/api/**`, actuator and API docs only on 127.0.0.1:8080. Postgres is never published.
- Tokens: 18 random bytes, base64url (24 chars). No emails, names or sequential IDs in public URLs.
- `/c/{token}` redirects only to the stored URL. Never read a target URL from the request.
- No email addresses, subjects or tokens in logs.
- Subjects and user agents are untrusted text: no `innerHTML`, no `dangerouslySetInnerHTML`.
- Use the injectable `Clock` for every time-based rule.
- Fail open: tracking must never block, delay or break sending.
- TypeScript strict mode, no `any`. TypeScript pinned to 6.0.x (typescript-eslint limit).

## Commands (PowerShell, from the project folder)
- `.\scripts\verify.ps1` — gate before every commit: backend build, unit + integration tests
  (needs Java 25 on PATH and Docker running), OWASP audit when `NVD_API_KEY` is set.
- `.\scripts\new-env.ps1` — creates `infra\.env` with secrets once; never overwrites it.
- `.\scripts\dev.ps1` — builds and starts PostgreSQL + backend in Docker (127.0.0.1:8080 / 8081).
- `.\scripts\funnel.ps1 [-Action on|status|off]` — Tailscale Funnel mounts for /t/ and /c/ only, then
  `check-public.ps1` (pixel 200, everything else 404). `-BaseUrl http://127.0.0.1:8081` tests without Tailscale.
- `.\scripts\autostart.ps1 -Install|-Remove` — Startup-folder shortcut; at sign-in starts Docker stack + Funnel.
- `.\scripts\backup.ps1` — pg_dump into `backups\`; restore steps in docs/SETUP.md §8.
- Throwaway stack for manual checks: env file from `new-env.ps1 -EnvFile <scratch>` plus
  `MAILPULSE_PRIVATE_HOST_PORT=18080` / `MAILPULSE_PUBLIC_HOST_PORT=18081`, then `dev.ps1 -EnvFile ... -ProjectName mailpulse-check`.
- Backend only: `cd backend; .\mvnw.cmd verify` (unit tests `*Test`, integration tests `*IT`).
- Dashboard: `cd dashboard; npm run typecheck|lint|test|build`.
- Viewer (public PDF page behind document links): `cd viewer; npm run typecheck|lint|test|build` (build ->
  `viewer/dist`, packaged into the backend jar as `static/viewer/` by `dev.ps1`).
- Extension: `cd extension; npm run typecheck|lint|test|build` (build -> `extension/dist`, load unpacked;
  App ID from `MAILPULSE_INBOXSDK_APP_ID` in infra/.env). Fixed ID `pdinoocioohoejhjbeepjdadkkjldgeo` (D-054).
- New dependencies: only versions at least 14 days old, pinned exactly (D-036);
  npm: `npm install --save-exact --before=<today minus 14 days>`.

## Layout
- `backend/` Spring Boot 4.1.1, Java 25, packages by feature: `common` (ports, filters, crypto,
  rate limiter, client IP), `auth`, `settings`, `emails`, `tracking`, `activity`, `maintenance`.
  Schema: `backend/src/main/resources/db/migration`. Tests share one Spring context
  (`support/IntegrationTest`) with PostgreSQL 18 in Testcontainers and a `MutableClock`.
- `extension/` MV3, TS 6 strict, esbuild. `src/core` pure tested logic (pixel, DNR rules, notifications,
  retry queue); `src/gmail` the only InboxSDK code (compose session, thread marks, message views);
  `src/background` service worker (API client, handlers, poller); `src/popup`, `src/options` React.
- `dashboard/` React 19 + Vite 8 + Tailwind 4 + TanStack Query + React Router 8 + Recharts (lazy chunk).
  `src/api` client/queries, `src/pages` one file per screen, `src/test` page tests with fetch stubs.
  Built into the backend jar by `dev.ps1` (D-060); `npm run dev` proxies /api to 127.0.0.1:8080.
- `viewer/` Vite + TS 6 + PDF.js 6, no framework, no WebAssembly, no eval (D-130): `src/main.ts` the page,
  `src/beat.ts` read-time heartbeats, `src/link.ts` link info. Served on the public port: `/d/{token}` and `/d/_/**`.
- `infra/` docker-compose.yml (build context = repo root), `.env.example`. `scripts/` PowerShell helpers. `docs/` plan and decisions.

## Status
- Step 0 approved 2026-10-29 (main). Step 1 spike tooling is on branch `step-1-spikes` (not merged),
  waiting for the owner's test run ("spikes done" starts the analysis; D-037 decides 15 s vs 30 s,
  and spike results may flip the D-053 settings).
- Phase 1 approved 2026-10-29. Phases 2-5 built in one run on the owner's request (2026-10-29), each on
  its own stacked branch (phase-2-public, phase-3-extension, phase-4-dashboard, phase-5-links-alerts),
  verified, pushed and fast-forwarded into `main`. Work happened in worktree `.worktrees/phase-1-backend`.
- Next: owner checklist (final report): Java 25, Tailscale + Funnel, InboxSDK App ID, load the
  extension, token, spikes, end-to-end Gmail test. Phase 6 only after explicit confirmation.
- Throwaway test stack `mailpulse-check` (ports 18080/18081, env in the session scratchpad) may still
  be running: `docker compose -p mailpulse-check down -v` removes it.