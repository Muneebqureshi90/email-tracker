# MailPulse setup (Windows 11)

Run commands in PowerShell from the project folder unless stated otherwise. If PowerShell refuses
to run scripts, first run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`.

## 0. From an empty PC to a working MailPulse
Follow the sections in this order. Each one ends with a check.

1. Install the tools (section 1).
2. Sign in to Tailscale and allow Funnel (section 2).
3. Keep the PC awake on mains power (section 3).
4. Create the secrets file and back up the encryption key (sections 4 and 5).
5. Start MailPulse and choose your password (section 5).
6. Publish the tracking routes with Funnel and check them from outside (section 6).
7. Start everything automatically at sign-in (section 7).
8. Set up backups (section 8).

Moving to a new PC: do steps 1-7 on the new PC, copy `infra\.env` from your key backup (the same
`MAILPULSE_ENCRYPTION_KEY`), restore the latest dump (section 8), and give the new PC the **same
Tailscale machine name** as the old one (remove the old machine in the Tailscale admin console
first, then rename the new one). Every email you already sent points at that name.

## 1. Tools
| Tool | Install | Needed from |
|---|---|---|
| Git, Chrome | already installed | Step 1 |
| Node.js 24 LTS | already installed (24.19) | Step 1 |
| Tailscale | `winget install --id Tailscale.Tailscale`, or without winget: download the Windows installer from https://tailscale.com/download/windows and run it | Step 1 |
| Java 25 (Temurin) | `winget install --id EclipseAdoptium.Temurin.25.JDK`, or without winget: download the Windows x64 JDK `.msi` from https://adoptium.net/temurin/releases/?version=25&os=windows and run it with **Set JAVA_HOME variable** and **Add to PATH** switched on. Check with `java -version` in a new PowerShell window. | Phase 1 |
| Docker Desktop | already installed (29.8) | Phase 1 |

## 2. Public address with Tailscale Funnel (free)
Recipients' mail apps must reach the pixel over the internet. Only `/t/` and `/c/` are published;
the API, dashboard and database stay on `127.0.0.1`.

1. Install Tailscale (table above), open it and sign in. The free Personal plan is enough.
2. In the admin console (https://login.tailscale.com/admin/dns) turn on **MagicDNS** and
   **HTTPS Certificates**.
3. The first `.\scripts\funnel.ps1` run (section 6) may print a link to allow Funnel for this PC.
   Open it, approve, and run the script again.
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

## 4. Back up the encryption key outside the PC
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
5. Restoring a backup (section 8) only works with the matching key in `infra\.env`.

## 5. Run MailPulse
Needs Java 25 and Docker Desktop running.

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

## 6. Publish the tracking routes (Tailscale Funnel)
With MailPulse running (section 5):

```powershell
.\scripts\funnel.ps1             # mounts /t/ and /c/ on https://<pc>.<tailnet>.ts.net and checks them
.\scripts\funnel.ps1 -Action status
.\scripts\funnel.ps1 -Action off # stops publishing (opens and clicks no longer arrive)
```

`funnel.ps1` runs `tailscale funnel --bg --https=443 --set-path=/t ...` and the same for `/c`.
`--bg` keeps both mounts across reboots until you turn them off. Other Serve/Funnel settings on
the PC are not touched. Afterwards it runs `.\scripts\check-public.ps1`, which must print
`PASS` for every line:

- `GET /t/<random>.gif` returns the 43-byte GIF and `HEAD` returns 200;
- `GET /c/<random>` reaches MailPulse (`404 Not found`);
- `/`, `/api/...`, `/actuator/health` and path tricks return 404.

These checks run from the PC itself. To prove the internet reaches the PC, switch Wi-Fi **off** on
your phone and open `https://<pc>.<tailnet>.ts.net/t/phone-check.gif` in the phone browser: it
shows a blank page. Then do the end-to-end test in the final checklist (an open from another
account appears in MailPulse).

`.\scripts\check-public.ps1 -BaseUrl http://127.0.0.1:8081` checks the public port without Tailscale.

## 7. Start with Windows
After a reboot or sign-in MailPulse should come back by itself:

1. Docker Desktop → Settings → General → turn on **Start Docker Desktop when you sign in to your
   computer**.
2. Tailscale starts with Windows by default, and the Funnel mounts persist (`--bg`).
3. Add the MailPulse sign-in task (a shortcut in your Startup folder, no administrator rights):
   ```powershell
   .\scripts\autostart.ps1 -Install
   ```
   At each sign-in it waits for Docker, starts the containers (`docker compose up -d`, no rebuild),
   waits until the backend is healthy, and re-checks the Funnel mounts. Log:
   `%LOCALAPPDATA%\MailPulse\autostart.log`.
4. Check: restart the PC, sign in, wait two minutes, then run `.\scripts\funnel.ps1 -Action status`.

Remove it with `.\scripts\autostart.ps1 -Remove`. The containers also use `restart: unless-stopped`,
so Docker restarts them after a crash.

## 8. Backup and restore
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

## 9. Checks before every commit
```powershell
.\scripts\verify.ps1
```
Checks the PowerShell scripts, then runs the backend build with all unit and integration tests
(needs Java 25 and Docker running). It also runs the OWASP dependency audit when `NVD_API_KEY` is
set; without the key the audit is skipped with a warning. A free key is available at
https://nvd.nist.gov/developers/request-an-api-key.

## 10. Step 1 spikes
See [spikes/README.md](../spikes/README.md) on the `step-1-spikes` branch.
