# Advanced: automatic VAN pulls

Optional. The runner is a small program on a campaign laptop that signs in to VoteBuilder every morning, runs your four saved searches, exports the four crosstabs and writes `data.js` next to the page, so the page shows today's numbers when anyone opens it. Everyday use of the page needs none of this.

It runs a script against VoteBuilder. Read [security.md](security.md) before you start, and check with your VAN administrator that your committee is comfortable with it.

## Before you start

- **The page set up** per [setup.md](setup.md), with the four saved searches built per [van-searches.md](van-searches.md). The runner finds them by name, in any folder your login can see.
- **A VoteBuilder login.** Two options, explained in [security.md](security.md): a dedicated account without two-step sign-in, or a staffer's account with two-step sign-in (the runner asks for the code once, ticks "Remember this device", and the saved browser session stays trusted for about 30 days).
- **The exact score name** as VAN's Crosstab 1 picker lists it (open the picker once and copy it, for example `2026: DNC Dem Party Support`).
- **A laptop that stays on at the scheduled time.** Mac or Windows. On a Mac, a missed time runs when the laptop next wakes; on Windows the task runs at the next logon. Set it not to sleep when plugged in. Turn on disk encryption (FileVault, BitLocker).
- **Where the page lives.** If the team reads `index.html` from a shared drive, the runner writes `data.js` into that folder. The runner itself must sit in a folder that is **not** cloud-synced (see security.md).

## Part 1: the laptop

### 1. Install Node.js and download the runner

- Install Node.js 22.9 or newer from [nodejs.org](https://nodejs.org) (the *LTS* download). `node --version` in a terminal shows what you have.
- Download this repository: on GitHub, green **Code** button → **Download ZIP**. Unzip it somewhere permanent that is not synced to the cloud, for example `~/van-runner` on a Mac or `C:\van-runner` on Windows (not Desktop, Documents or Downloads if iCloud, OneDrive or Dropbox syncs them).
- Open a terminal in the `tools/vote-chase/runner` folder. On a Mac: right-click the folder in Finder → **New Terminal at Folder** (enable it under System Settings → Keyboard → Keyboard Shortcuts → Services if it is missing). On Windows: open the folder in Explorer, type `cmd` in the address bar, press Enter.

### 2. Run setup

```
npm install
npm run setup
```

Setup asks for the VoteBuilder email and password, the score name, and the four saved search names. It writes them to `.env` (the login, private) and `searches.json` (the names) in the runner folder, then downloads the browser the runner drives (about 150 MB, one time). Run it again any time to change a value; press Enter to keep the current one.

On a Mac the first run may show a system prompt asking to let Terminal access a folder; allow it. On Windows, SmartScreen may ask once about Node. Nothing else is installed.

### 3. Watch one pass

```
npm run check
```

A browser window opens and you can watch the runner sign in, open the *returned* search, run it, open Counts, pick the score and Precinct, set **People from** to My List, refresh and export. If ActionID asks for a one-time code, type it in that window and click Continue; the runner waits up to five minutes and ticks "Remember this device" for you. When the pass finishes it writes `exports/returned.xls` and `data.js`, and the log ends with `pass finished: 1/1 OK`.

Open the page: the blue banner should say *Showing data loaded automatically* with today's date. If the pass stops, the log says at which step and ends with a `What to do:` line; [troubleshooting.md](troubleshooting.md) has every message.

Then all four, without a window:

```
npm run export:all
```

Each slot should end with `export total N people (matches the list)`, then `pass finished: 4/4 OK` and a `make-data: wrote …` line.

### 4. Where `data.js` goes

By default the runner writes `data.js` next to `index.html` one level up (the page in this same download). If the team's copy of the page lives on a shared drive, point the runner at it:

```
npm run export:all -- --data-out "/path/to/shared/vote-chase/data.js"
```

(The page and `data.js` can live on the shared drive. The runner folder, with the login and the browser session, should not.)

### 5. Run it every morning

```
npm run service -- install
```

On a Mac this installs a launchd agent; on Windows, a daily Task Scheduler task. Either way `export:all` runs at 6:30 every morning. Options: `--at 07:15` for a different time, `--data-out <path>` for the shared folder, `--account campaign` if your searches live in My Campaign.

```
npm run service -- status       what is installed, and the last successful run
npm run service -- uninstall    stop the morning runs
npm run export:all              run a pass now, by hand
npm stop                        stop a pass that is running
```

The runner's own log is `logs/voters.log`; `logs/voters.last-success.txt` records the last run that saved every slot.

**Linux** is not automated. A systemd user timer works well:

```
# ~/.config/systemd/user/vote-chase.service
[Unit]
Description=Vote Chase VAN pull
[Service]
Type=oneshot
WorkingDirectory=/path/to/tools/vote-chase/runner
ExecStart=/usr/bin/node --env-file-if-exists=.env export.mjs --then-make-data

# ~/.config/systemd/user/vote-chase.timer
[Unit]
Description=Vote Chase VAN pull, daily
[Timer]
OnCalendar=*-*-* 06:30:00
Persistent=true
[Install]
WantedBy=timers.target
```

Then `systemctl --user enable --now vote-chase.timer` and `loginctl enable-linger $USER`.

## Changing things later

- **A new score, a renamed search:** `npm run setup` again (Enter keeps the other values). The next run picks it up; no reinstall needed.
- **A new VoteBuilder password:** `npm run setup`, then `npm run check` once so the browser session is refreshed.
- **The one-time code is being asked again** (about every 30 days, or when the log says `needs a fresh sign-in`): `npm run check`, type the code, done. Scheduled runs stop on their own until you do, so the account is not hit with a password attempt every morning.
- **Switching back to manual:** `npm run service -- uninstall`. The page does not change; dropping files on it works regardless. Delete `data.js` next to the page if you do not want the last automatic pull to reload.
- **Moving to a new laptop:** uninstall the service on the old one, delete its runner folder (login, session), then do Part 1 on the new one.
- **Half-way option:** a person does the four exports by hand (five minutes) and runs the converter: `npm run make-data -- --folder ~/Downloads/van-exports --out "/path/to/vote-chase/data.js"`. Name the files `returned.xls`, `returned_regulars.xls`, `registered.xls`, `registered_regulars.xls`.

## What it touches on the computer

The runner opens its own Chromium window (installed by setup into Playwright's cache folder) and drives only that window. It does not control your mouse or keyboard, read other apps, or take screenshots of anything but its own window. It reads and writes only inside the runner folder: `exports/` (the four count files), `logs/`, `failures/` (a screenshot when a step fails), `profiles/` (the browser's saved VoteBuilder session), `.env` and `searches.json`; plus the one `data.js` you point it at. The only network destinations are `votebuilder.com` and `id.ngpvan.com`.
