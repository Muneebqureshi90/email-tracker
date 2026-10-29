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
Phase 1 creates `infra\.env` with `MAILPULSE_ENCRYPTION_KEY`. Subjects and email addresses in the
database and in every backup are encrypted with it. **Without the key that data cannot be read,**
including from backups.

1. After Phase 1 setup, open `infra\.env` and copy the value of `MAILPULSE_ENCRYPTION_KEY`.
2. Store it outside the PC, in at least one of these:
   - a password manager entry named "MailPulse encryption key";
   - a USB stick kept away from the PC;
   - a printed copy kept with your important papers.
3. Never put the key in git, email, chat, or cloud notes as plain text.
4. If the key is ever rotated, repeat these steps; old backups need the old key.
5. The restore steps (added in Phase 1) include a test that uses this stored copy.

## 5. Step 1 spikes
See [spikes/README.md](../spikes/README.md).
