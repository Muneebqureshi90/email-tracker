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

## Commands
Step 1 spikes (throwaway, see spikes/README.md):
- `.\spikes\setup.ps1 -AppId <sdk_id>` builds the test extension into spikes/extension/dist
- `.\spikes\start.ps1` starts the logger and Tailscale Funnel for /t/; `.\spikes\stop.ps1` turns Funnel off
- `.\spikes\mark.ps1 "label"` writes a marker; `node spikes/logger/analyze.mjs` summarises spikes/out/
- npm installs: `npm install --save-exact --before=<today minus 14 days>` (D-036)

## Status
- Step 0 approved 2026-10-29 (main). Step 1 tooling built and tested on branch `step-1-spikes`;
  waiting for the owner to run spikes/README.md, then analysis and the Step 1 checkpoint.
