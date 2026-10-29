# MailPulse

A private, self-hosted open and click tracker for one person's Gmail. A Chrome extension adds an
invisible pixel to emails you send; when the recipient's mail app loads it, MailPulse records the
open and shows ✓/✓✓ marks in Gmail, desktop notifications and a dashboard. Everything runs on your
own PC with free tools; no email body ever leaves your browser.

Status: backend core (Phase 1) is built. The Chrome extension and the dashboard come in later
phases (see [docs/PLAN.md](docs/PLAN.md)).

## Quick start (Windows 11, PowerShell)
Requires Java 25, Docker Desktop and Tailscale (see [docs/SETUP.md](docs/SETUP.md)).

```powershell
.\scripts\new-env.ps1     # creates infra\.env with secrets - back up the encryption key!
.\scripts\dev.ps1         # starts PostgreSQL + backend on 127.0.0.1:8080 (API) and 8081 (tracking)
.\scripts\verify.ps1      # all checks: build, unit and integration tests, dependency audit
```

## Documentation
- [docs/PLAN.md](docs/PLAN.md) — architecture, data model, API, security, phases
- [docs/DECISIONS.md](docs/DECISIONS.md) — every decision and why
- [docs/SETUP.md](docs/SETUP.md) — setup, backup and restore
- [docs/LIMITATIONS.md](docs/LIMITATIONS.md) — what tracking can and cannot see
- [docs/FEATURES.md](docs/FEATURES.md) — feature scope compared with Mailsuite
