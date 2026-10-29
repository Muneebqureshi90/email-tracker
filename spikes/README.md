# MailPulse Step 1 spikes — test guide

Throwaway tools that answer four questions before we build anything real:

1. Does the pixel survive sending, with nothing else in the email changed?
2. Does it load through the public address in Gmail web, the Gmail phone app and Outlook.com?
3. Can we stop your own views from counting, and is a 15 s hold enough?
4. Do Gmail's message and thread IDs match the right rows in the Sent list?

Time: about 60–75 minutes. Write your observations in [RESULTS.md](RESULTS.md) as you go.

## Safety
- The test extension only changes emails whose subject contains a test code such as `[S1-B]`.
  Every other email sends exactly as before.
- Send test emails only to your own test accounts.
- When you finish, run Part 6: it turns the public address off and removes the extension.

## What you need
- **Main Gmail** in Chrome (the extension runs here).
- **Second Gmail** opened in **Microsoft Edge** (or a Chrome Guest window). Not in the Chrome profile
  with the extension — otherwise the extension would treat the recipient's views as yours.
- **Outlook.com** account, also in Edge.
- **Phone** with the Gmail app, signed in to both the second Gmail and your main Gmail.

Body text for every test email (copy exactly, nothing else):

```
MailPulse spike test. Please ignore. https://example.com
```

Open PowerShell in the project folder and allow scripts for this window only:

```powershell
cd D:\muneeb\personal\email-tracker
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

**Marker command** — run it right before an action so the log shows what you did and when:

```powershell
.\spikes\mark.ps1 "S2-A open 1"
```

## Part 0 — One-time setup (about 15 min)
1. Install Tailscale: `winget install --id Tailscale.Tailscale`. Without winget: download the Windows
   installer from https://tailscale.com/download/windows and run it. Open Tailscale and sign in (free plan).
2. Open https://login.tailscale.com/admin/dns and turn on **MagicDNS** and **HTTPS Certificates**.
3. Register a free InboxSDK App ID at https://register.inboxsdk.com/ and copy it (starts with `sdk_`).
4. Build the test extension:
   ```powershell
   .\spikes\setup.ps1 -AppId sdk_your_id_here
   ```
5. Start the logger and the public address:
   ```powershell
   .\spikes\start.ps1
   ```
   A logger window opens. The first time, Tailscale may print a link to enable Funnel: open it,
   approve, then run `.\spikes\start.ps1` again. Expected results: `200`, `200`, `404`.
6. Phone check: turn Wi-Fi **off**, open `https://<your address>/t/selftest-phone.gif` in the phone
   browser. The logger window should print a `PUBLIC GET` line. Turn Wi-Fi back on.
7. Chrome: open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, choose
   `D:\muneeb\personal\email-tracker\spikes\extension\dist`. Reload the Gmail tab (main account).
8. Click the puzzle icon → **MailPulse Step 1 spike**. The popup must say **Logger reachable: yes**.
   If it says no, copy the error text into RESULTS.md. If Chrome asks about local network access,
   choose **Allow**, reload Gmail and check again.
9. Popup settings to start with: Insert pixel ✓, Strip old pixels ✓, **Mode A**, **Observe**.
10. Optional but helpful: Gmail Settings → General → Undo Send → **30 seconds**.

## Part 1 — Send tests (Chrome, main account, about 15 min)
Send each email to your **second Gmail** unless the row says otherwise. Use the exact subject.

| Code | What to do |
|---|---|
| S1-A | Popup: untick **Insert pixel**. Send `[S1-A] MailPulse spike`. Then tick **Insert pixel** again. |
| S1-B | Send `[S1-B] MailPulse spike`. |
| S1-C | Popup: **Mode B**. Send `[S1-C] MailPulse spike`. Popup: back to **Mode A**. |
| S1-D | Send `[S1-D] MailPulse spike`, then click **Undo** in the "Message sent" notice. The draft reopens: click **Send** again. |
| S1-E | Write `[S1-E] MailPulse spike`, click the arrow next to Send → **Schedule send** → **Pick date & time** → about 5 minutes from now. |
| S1-F | Write `[S1-F] MailPulse spike`, ⋮ (More options) → **Plain text mode** → Send. |
| S1-G | Write `[S1-G] MailPulse spike` to **both** the second Gmail and Outlook.com, click the confidential-mode icon (lock with clock) → Save → Send. |
| S1-I | Write `[S1-I] MailPulse spike`, press **Ctrl+Enter** to send. |
| S2-A | Send `[S2-A] MailPulse spike` (used for Gmail web opens). |
| S2-B | Send `[S2-B] MailPulse spike` (used for phone opens). |
| S2-C | Send `[S2-C] MailPulse spike` to **Outlook.com**. |

## Part 2 — Recipient opens and inbox placement (about 20 min)
Run the marker command right **before** each open.

Second Gmail in Edge:
1. Before opening anything, write down where each test email landed (Primary / Promotions /
   Updates / Spam) in RESULTS.md.
2. `.\spikes\mark.ps1 "S2-A open 1"` → open **[S2-A]** → wait 10 s → back to the inbox.
3. Wait 2 minutes. `.\spikes\mark.ps1 "S2-A open 2"` → open it again → back.
4. Wait 2 minutes. `.\spikes\mark.ps1 "S2-A open 3"` → open it again → back.
5. Open **[S1-B]** → Reply → type `reply from recipient` → keep the quoted text → Send.
6. Save the originals: open S1-A, S1-B, S1-C, S1-D, S1-F, S1-G, S1-I (and S1-E once it arrives) →
   ⋮ → **Download message** → save into `spikes\out\` as `S1-A.eml`, `S1-B.eml`, and so on.

Phone, Gmail app, **second** account:

7. `.\spikes\mark.ps1 "S2-B phone open 1"` → open **[S2-B]** → wait 10 s → back.
   2 minutes later: `.\spikes\mark.ps1 "S2-B phone open 2"` → open it again.

Outlook.com in Edge:

8. Write down the folder of [S2-C] and [S1-G] (Focused / Other / Junk).
9. `.\spikes\mark.ps1 "S2-C outlook open 1"` → open **[S2-C]**. If Outlook blocks images, write down
   its message, then `.\spikes\mark.ps1 "S2-C images allowed"` → click to show images.
10. 2 minutes later: `.\spikes\mark.ps1 "S2-C outlook open 2"` → open it again.
11. `.\spikes\mark.ps1 "S1-G outlook open"` → open **[S1-G]** in Outlook and follow its link.
    Write down what you see.
12. `.\spikes\mark.ps1 "S1-G gmail open"` → open **[S1-G]** in the second Gmail.

## Part 3 — Your own views (Chrome, main account, about 15 min)
Popup: **Observe**.

1. `.\spikes\mark.ps1 "S3-A sent list"` → open the **Sent** folder, do not open any email → wait 30 s.
2. `.\spikes\mark.ps1 "S3-B thread view 1"` → open **[S2-A]** from Sent → wait 30 s → back.
   Repeat twice, 1 minute apart, with marks `"S3-B thread view 2"` and `"S3-B thread view 3"`.
3. `.\spikes\mark.ps1 "S3-C reply compose"` → open [S2-A] → **Reply** → wait 20 s → discard the
   reply (trash icon).
4. `.\spikes\mark.ps1 "S3-D quoted view"` → Inbox → open "reply from recipient" → click **…** to
   show the quoted text → wait 30 s.
5. `.\spikes\mark.ps1 "S1-H1 reply collapsed"` → reply to that message **without** clicking …,
   type `second reply`, Send.
6. `.\spikes\mark.ps1 "S1-H2 reply expanded"` → reply again, click **…** to show the quoted text,
   type `third reply`, Send.
7. Phone, Gmail app, **main** account: `.\spikes\mark.ps1 "S3-E phone self view"` → Sent → open
   [S2-A] → wait 30 s.
8. Popup: **Block**. `.\spikes\mark.ps1 "S3-F block thread view"` → open [S2-A] from Sent → wait 30 s.
9. `.\spikes\mark.ps1 "S3-G block quoted view"` → open "reply from recipient" → click … → wait 30 s.
10. Popup: back to **Observe**.
11. In the second Gmail (Edge), download the two new replies as `spikes\out\S1-H1.eml` and
    `spikes\out\S1-H2.eml`.

## Part 4 — Gmail IDs (about 5 min)
1. Main account, Sent folder: a small green spike check should appear on the rows of your test
   emails. Hover it: the tooltip shows the test code. Note any missing or wrong check.
2. Open **[S1-B]** in Sent → ⋮ → **Show original**. In the new tab's address bar find
   `permmsgid=msg-f:NUMBER`, then run `.\spikes\mark.ps1 "S1-B permmsgid msg-f:NUMBER"`.

## Part 5 — InboxSDK telemetry check (about 3 min)
In the main Gmail tab press **F12** → **Network** → filter `inboxsdk`. Reload Gmail and wait 2
minutes. Requests to `api.inboxsdk.com` should show as blocked (`ERR_BLOCKED_BY_CLIENT`); none
should finish with status 200. Do the same with the filter `mailfoogae`. Write the result down.

## Part 6 — Finish
```powershell
node spikes\logger\analyze.mjs > spikes\out\analysis.txt
.\spikes\stop.ps1
```
Close the logger window. In `chrome://extensions`, **Remove** "MailPulse Step 1 spike".
Then reply **"spikes done"**. I will read `spikes\out\` and `spikes\RESULTS.md` and write the
checkpoint report.

## Troubleshooting
- Logger window closed by accident: run `.\spikes\start.ps1` again (the log file continues).
- Rebuilt the extension: click the reload icon on the extension card, then reload Gmail.
- Yellow InboxSDK bar about the App ID: rerun `setup.ps1` with `-AppId`, then reload the extension.
