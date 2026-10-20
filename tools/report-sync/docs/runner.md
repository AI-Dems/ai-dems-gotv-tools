# Advanced: the automatic runner

Optional. The runner is a small program on a campaign laptop that does the Votebuilder export and the upload for you, every 30 minutes during the day. It is plain browser automation and does not try to look like a person; see [security.md](security.md) for what that means for your VAN contract. Everyday use of the Sheet (Report Sync → Upload export…) needs none of this.

Read [security.md](security.md) before you start: the runner signs in to Votebuilder as a real account and downloads voter data to the laptop.

## Before you start

- **The Sheet set up** per [setup.md](setup.md), with the **Reports** table on `Setup` filled in: the runner exports exactly the rows with `enabled = yes`, using `report_name` to find the saved template and `tab` as the destination. Also check the **Settings** block: timezone, interval and active hours.
- **One Votebuilder account per database** you want reports from, used only by the runner. Two-step sign-in works: during `npm run check` you type the one-time code in the browser window once and the runner ticks "Remember this device", which keeps the session trusted for about 30 days. An account without two-step sign-in is smoother, since there is nothing to redo when that trust expires.
- **The saved reports** visible to that account in Report Manager.
- **A laptop that stays on.** Mac or Windows. Set it not to sleep when plugged in. A closed lid stops the runner on most laptops.

## Part 1: give the runner a door into the Sheet

### 1. Deploy the web app

This creates the address the laptop sends reports to. It's done once per copy of the sheet. ("Anyone" sounds alarming; the token in step 2 is what actually guards the sheet. See [security.md](security.md).)

1. **Extensions → Apps Script.** The code editor opens in a new tab.
2. Top right: **Deploy → New deployment**.
3. Click the gear next to *Select type* and choose **Web app**.
4. Set *Execute as* to **Me** and *Who has access* to **Anyone**.
5. **Deploy**, authorize if asked. Copy the **Web app URL** it shows (it ends in `/exec`); you'll paste it into the runner in step 4. It's always available again under **Deploy → Manage deployments**.

### 2. Generate the runner's token

Back in the sheet: **Report Sync → Advanced → Set up runner access**. A dialog shows the **Sync token**. Leave it open, or come back to it later with **Advanced → Show runner access**. (The dialog can't show the web app URL itself: a script asked from inside the sheet only knows its private test deployment, which the runner can't use. That's why step 1 has you copy it.)

## Part 2: the laptop

### 3. Install Node.js and download the runner

- Install Node.js 22 or newer from [nodejs.org](https://nodejs.org) (the *LTS* download).
- Download this repository: on GitHub, green **Code** button → **Download ZIP**. Unzip it somewhere permanent (not Downloads), e.g. `Documents/report-sync`.
- Open a terminal in the `tools/report-sync/runner` folder. On a Mac: right-click the folder in Finder → *New Terminal at Folder* (enable it under System Settings → Keyboard → Keyboard Shortcuts → Services if it's missing). On Windows: open the folder in Explorer, type `cmd` in the address bar, press Enter.

### 4. Run setup

```
npm install
npm run setup
```

Setup asks for the web app URL from step 1 and the token from step 2, then the Votebuilder email and password for each database (press Enter to skip one). It saves them to a `.env` file in the runner folder, checks that the sheet answers, and downloads the browser the runner drives.

### 5. Watch one pass

```
npm run check
```

A browser window opens and you can watch the runner log in, open Report Manager, export each report and wait for the file. If ActionID asks for a one-time code, type it in that window and click Continue; the runner waits up to five minutes and leaves "Remember this device" ticked. When it finishes, the report tabs in the sheet are filled and the `log` tab has a row per report. If something goes wrong, [troubleshooting.md](troubleshooting.md) is keyed to the exact messages.

`npm run check` uses the `campaign` account. For My Voters: `npm start -- --account voters --once --headed`.

### 6. Run it in the background

```
npm run service -- install campaign voters
```

List only the accounts you set up. On a Mac this installs a launchd agent per account; on Windows, a Task Scheduler task. Either way the runner starts now, runs through the active hours every day, and comes back after a restart or a crash.

Check on it any time with `npm run service -- status`. Stop it with `npm run service -- uninstall campaign voters`. The runner's own log is `runner/logs/campaign.log` (and `voters.log`).

**Linux** isn't automated. A systemd user unit works well:

```
[Unit]
Description=Report Sync (campaign)
[Service]
WorkingDirectory=/path/to/tools/report-sync/runner
ExecStart=/usr/bin/node --env-file-if-exists=.env sync.mjs --account campaign
Restart=always
RestartSec=60
[Install]
WantedBy=default.target
```

Save it as `~/.config/systemd/user/report-sync-campaign.service`, then `systemctl --user enable --now report-sync-campaign` and `loginctl enable-linger $USER`.

## Changing things later

- **Reports, interval, hours:** edit `Setup`. The runner re-reads it between passes; no restart needed.
- **A new Votebuilder password:** `npm run setup` again (press Enter to keep other values), then `npm run service -- uninstall` and `install` so the background runner picks up the new `.env`.
- **A new token** (Set up runner access again): same as above.
- **Switching back to manual uploads:** `npm run service -- uninstall campaign voters`. The Sheet doesn't change; Upload export… works regardless.
- **Moving to a new laptop:** uninstall the service on the old one, then do Part 2 on the new one. The sheet side doesn't change.
