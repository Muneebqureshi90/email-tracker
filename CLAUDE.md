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
- `.\scripts\backup.ps1` — pg_dump into `backups\`; restore steps in docs/SETUP.md §6.
- Backend only: `cd backend; .\mvnw.cmd verify` (unit tests `*Test`, integration tests `*IT`).
- New dependencies: only versions at least 14 days old, pinned exactly (D-036);
  npm: `npm install --save-exact --before=<today minus 14 days>`.

## Layout
- `backend/` Spring Boot 4.1.1, Java 25, packages by feature: `common` (ports, filters, crypto,
  rate limiter, client IP), `auth`, `settings`, `emails`, `tracking`, `activity`, `maintenance`.
  Schema: `backend/src/main/resources/db/migration`. Tests share one Spring context
  (`support/IntegrationTest`) with PostgreSQL 18 in Testcontainers and a `MutableClock`.
- `infra/` docker-compose.yml, `.env.example`. `scripts/` PowerShell helpers. `docs/` plan and decisions.

## Status
- Step 0 approved 2026-10-29 (main). Step 1 spike tooling is on branch `step-1-spikes`, waiting for
  the owner's test run.
- Phase 1 (backend core) built on branch `phase-1-backend` (worktree `.worktrees/phase-1-backend`);
  waiting for the owner's approval.
