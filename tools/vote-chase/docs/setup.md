# Setup guide

Written for the person on the campaign who will own the page. No coding involved. Five minutes once the VAN searches exist.

## 1. Open the page

Two ways to open it:

- **The file.** Download [`index.html`](../index.html) (on GitHub: open the file and use the download button, or use the repository's green **Code → Download ZIP**) and double-click it. It opens in your web browser. Keep it somewhere permanent, such as a shared drive the field team can see. This is the right choice for a team that wants one shared copy, and the only choice for the automatic VAN pull ([automation.md](automation.md)), which writes its results into the same folder as the file.
- **The hosted copy.** [ai-dems.github.io/ai-dems-gotv-tools/tools/vote-chase](https://ai-dems.github.io/ai-dems-gotv-tools/tools/vote-chase/) opens the same page without a download. Everything it does still happens in your browser; nothing you load is sent to the host. See [security.md](security.md).

Chrome, Edge, Firefox and Safari all work. The page keeps what you load in the web browser on the computer where you loaded it. It does not use a server, so another laptop, another browser or a private window starts with an empty page.

## 2. Pull the files from VAN

Build and save the searches once, following [van-searches.md](van-searches.md). Then, for each search: run it, **Counts** → Crosstab 1 = your support score, Column 1 = `Precinct`, **People from = My List**, **Refresh Results**, **Export To Excel**. VAN names every file `DemographicsNew.xls`; rename them as you go (`returned.xls`, `registered.xls`, `returned_regulars.xls`, `registered_regulars.xls`) so you can tell them apart.

Two files are enough to start: *Returned* and *Registered*. The two *regular voters* files let the page count only people who voted in the 2022 or 2024 general election. That leaves out registrants who never vote and gives a more realistic picture of who can still be turned out.

## 3. Load them

Open **Update data** on the page. Drag each file onto its slot, or click a slot to browse. The slots are:

| Slot | Who the VAN search counts | How often to pull it |
|---|---|---|
| Returned | Everyone who has returned a ballot (voted early or by mail) | Every morning |
| Returned, regulars | Everyone who has returned a ballot and also voted in the 2022 or 2024 general election | Every morning |
| Registered | Every active registered voter, voted or not | Once, then again after the registration deadline |
| Registered, regulars | Every active registered voter who also voted in the 2022 or 2024 general election (recent voting history) | Once, then after the deadline |

The **Data as of** date comes from the returned file's modification date; change it in the same section if the pull was earlier. Set **Election Day** once for the countdown.

Then read **Checks** (the chip under the title, and the section at the bottom). OK means the files line up. Anything else names the problem and what to do; [troubleshooting.md](troubleshooting.md) has the full list.

## 4. Set the score groups

Open **Score groups**. The page reads the score bands from your files (`0 to 9.99` … `90+`, `Unknown`) and groups them into buckets, highest score first. Pick a preset (5, 4 or 3 buckets), then adjust each bucket's lowest band, name and colour if your score is not a 0 to 100 Democratic support score. The **chase** tick is what counts: ticked buckets add up to the "chase voters" number and the ranking. By default Strong D, Lean D and Undecided are ticked.

Voters with no score (VAN's *Unknown* band) are their own "No score" group, off the chase list by default; tick it to include them (they are often new registrants).

## 5. Read the page

- **Headline:** how many chase voters are still out and how many precincts hold half of them. It follows the current filter.
- **Table:** one row per precinct, ranked. *Chase left* is the number to knock; the bar shows who is left by bucket, chase buckets first; *Cumulative %* says how much of the chase the rows so far cover; *% voted* is that precinct's turnout so far.
- **Counting:** *regular voters* (the regulars pair) or *all registered* (the full pair). *Show* and *Sort* do what they say; **breakdown columns** adds one column per bucket.

## Precinct groups

Optional. A CSV with a `precinct` column holding VAN's exact precinct names and any other columns you want (`county`, `turf`, `organizer`, `region`). Each extra column becomes a choice in the **Filter** menu, and the headline follows the filter, so an organizer can see the ranking inside their own turf and a field director can see one county at a time.

Under **Update data → Precinct groups**, click **Download template**: it is pre-filled with every precinct name in your files. Fill in the columns in Excel or Google Sheets, save as CSV, drop it back on the page. It assigns whole precincts to labels; it does not cut turf within a precinct.

## Saving and sharing

- **Download workspace** writes one `.json` file with every file you loaded, your buckets, the groups file and the history. **Load workspace** restores it on any computer. This is the backup, and the way to hand the page to a colleague.
- **Reset page** removes everything the page stored in this browser (counts, settings, history, caches). Files on disk are untouched.
- For a whole team reading one copy, use the file on a shared drive plus the automatic pull ([automation.md](automation.md)), which writes a `data.js` next to the page that loads on open.
