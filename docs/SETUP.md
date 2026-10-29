# MailPulse setup (Windows 11)

This guide grows with each phase. Sections marked with a phase apply from that phase on.
Run commands in PowerShell from the project folder unless stated otherwise.

## 1. Tools
| Tool | Install | Needed from |
|---|---|---|
| Git, Chrome | already installed | Step 1 |
| Node.js 24 LTS | already installed (24.19) | Step 1 |
| Tailscale | `winget install --id Tailscale.Tailscale`, or without winget: download the Windows installer from https://tailscale.com/download/windows and run it | Step 1 |
| Java 25 (Temurin) | `winget install --id EclipseAdoptium.Temurin.25.JDK`, or without winget: download the Windows x64 JDK `.msi` from https://adoptium.net/temurin/releases/?version=25&os=windows and run it with **Set JAVA_HOME variable** and **Add to PATH** switched on. Check with `java -version` in a new PowerShell window. | Phase 1 |
| Docker Desktop | already installed (29.8) | Phase 1 |

## 2. Public address with Tailscale Funnel (free)
Recipients' mail apps must reach the pixel over the internet. Only `/t/` (and later `/c/`) is
published; the API, dashboard and database stay on `127.0.0.1`.

1. Install Tailscale (table above), open it and sign in. The free Personal plan is enough.
2. In the admin console (https://login.tailscale.com/admin/dns) turn on **MagicDNS** and
   **HTTPS Certificates**.
3. The first `tailscale funnel` command prints a link to allow Funnel for this PC. Open it and approve.
4. Your public address is shown by:
   ```powershell
   (& "$env:ProgramFiles\Tailscale\tailscale.exe" status --json | ConvertFrom-Json).Self.DNSName
   ```
   Example: `mypc.tail1234.ts.net.` (ignore the final dot).
5. **Never rename this PC in Tailscale and never change the tailnet name.** Every email you send
   contains this address; renaming breaks the pixel and links in all of them.
6. Leave Tailscale set to start with Windows (its default).

## 3. Keep the PC awake while MailPulse runs
Opens that happen while the PC is asleep, hibernating or off are **lost for good**, and tracked
links show the recipient an error page. Keep the laptop **plugged in** and stop it from sleeping
on mains power. The screen may still turn off; that is fine.

Settings app way: Settings → System → Power & battery → Screen, sleep & hibernate timeouts →
"When plugged in, put my device to sleep after" → **Never** (and the same for hibernate, if shown).

PowerShell way (if a command reports "access denied", open PowerShell as administrator):

```powershell
powercfg /change standby-timeout-ac 0        # never sleep on mains power
powercfg /change hibernate-timeout-ac 0      # never hibernate on mains power
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0   # closing the lid does nothing on mains power
powercfg /setactive SCHEME_CURRENT
```

Check the result: `powercfg /query SCHEME_CURRENT SUB_SLEEP` shows "Current AC Power Setting Index:
0x00000000" for sleep and hibernate.

On battery Windows still sleeps as before (these commands do not change battery settings).
Also set Windows Update "active hours" so it does not restart the PC while you are away.

To undo:

```powershell
powercfg /change standby-timeout-ac 30
powercfg /change hibernate-timeout-ac 180
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 1
powercfg /setactive SCHEME_CURRENT
```

## 4. Back up the encryption key outside the PC (from Phase 1)
`.\scripts\new-env.ps1` (section 5) creates `infra\.env` with `MAILPULSE_ENCRYPTION_KEY`. Subjects,
email addresses, names and link URLs in the database and in every backup are encrypted with it.
**Without the key that data cannot be read,** including from backups.

1. After running `new-env.ps1`, open `infra\.env` and copy the value of `MAILPULSE_ENCRYPTION_KEY`.
2. Store it outside the PC, in at least one of these:
   - a password manager entry named "MailPulse encryption key";
   - a USB stick kept away from the PC;
   - a printed copy kept with your important papers.
3. Never put the key in git, email, chat, or cloud notes as plain text.
4. `new-env.ps1` never overwrites an existing `infra\.env`. If you ever create a new key, repeat
   these steps; old backups need the old key.
5. Restoring a backup (section 6) only works with the matching key in `infra\.env`.

## 5. Run MailPulse (from Phase 1)
Needs Java 25 and Docker Desktop running. Run from the project folder; if PowerShell refuses to run
scripts, first run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`.

1. Create the secrets file (reads your Tailscale address; or pass `-PublicBaseUrl https://<pc>.<tailnet>.ts.net`):
   ```powershell
   .\scripts\new-env.ps1
   ```
2. Back up the encryption key now (section 4).
3. Build and start PostgreSQL and the backend:
   ```powershell
   .\scripts\dev.ps1
   ```
   Private API: `http://127.0.0.1:8080` (this PC only). Public tracking routes: `http://127.0.0.1:8081`.
   PostgreSQL has no port outside Docker.
4. First run only: read the one-time setup code and choose your password (at least 12 characters).
   Until the dashboard exists (Phase 4), do it from PowerShell:
   ```powershell
   docker compose -p mailpulse --env-file infra\.env -f infra\docker-compose.yml logs backend | Select-String 'setup code'
   $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
   Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8080/api/auth/setup -ContentType 'application/json' `
     -Body '{"setupCode":"XXXXX-XXXXX","password":"your long password here"}' -WebSession $session
   ```
5. Stop: `docker compose -p mailpulse --env-file infra\.env -f infra\docker-compose.yml down`
   (your data stays in the `mailpulse_db-data` volume). Never add `-v` unless you want to delete all data.

## 6. Backup and restore
Backup (MailPulse must be running):
```powershell
.\scripts\backup.ps1            # writes backups\mailpulse-<date>-<time>.dump (git-ignored)
```
Copy backups somewhere outside the PC as well. Subjects, addresses and URLs inside a dump stay
encrypted; you need the key from section 4 to read them.

Restore a dump (replaces the current data):
```powershell
$compose = @('compose', '-p', 'mailpulse', '--env-file', 'infra\.env', '-f', 'infra\docker-compose.yml')
docker @compose stop backend
docker @compose cp backups\mailpulse-YYYYMMDD-HHMMSS.dump db:/tmp/restore.dump
docker @compose exec -T db pg_restore -U mailpulse -d mailpulse --clean --if-exists /tmp/restore.dump
docker @compose exec -T db rm -f /tmp/restore.dump
docker @compose start backend
```
These exact steps were tested in Phase 1: back up, delete all emails, restore, and the email, its
counted open and the owner account came back and decrypted correctly.

## 7. Checks before every commit
```powershell
.\scripts\verify.ps1
```
Runs the backend build with all unit and integration tests (needs Java 25 and Docker running).
It also runs the OWASP dependency audit when `NVD_API_KEY` is set; without the key the audit is
skipped with a warning. A free key is available at https://nvd.nist.gov/developers/request-an-api-key.

## 8. Step 1 spikes
See [spikes/README.md](../spikes/README.md) on the `step-1-spikes` branch.
