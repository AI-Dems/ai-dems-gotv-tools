# The VAN searches and the export

Written for someone who already builds lists in VAN. Four saved searches, one export each. Build them once; the daily pull is "open, run, count, export".

## The four searches

Build each in **My Voters → Create a New Search** (or **Create a New List**), then **Save Search** (the save button on the search editor) with the name below, in a folder your team can see. Every name is yours to choose; these are the ones the automatic runner's example uses.

| Save as | Filters | Who it counts |
|---|---|---|
| `All early voters` | **Early Voting / Absentee:** ballot returned (the exact label varies by state: *Ballot Returned*, *Voted Early*, *Returned Absentee*; pick the one your state's early-vote file updates). | Everyone who has already voted. |
| `All active early voters` | The same, **plus** **Voting History:** voted in the 2022 general election **or** the 2024 general election (two general-election rows, joined with OR). | Everyone who has already voted and has recent voting history. |
| `All registered voters` | **Registration Status:** Active. No early-vote filter. | Every active registered voter, whether or not they have voted. |
| `Active registered voters` | The same, **plus** the same Voting History filter. | Every active registered voter who also voted in 2022 or 2024: the "regular voters" the page can count instead of everyone. |

The 2022 and 2024 general elections are the right pair for a 2026 race (the last midterm and the last presidential). For a later cycle, use the two most recent general elections.

Two rules that matter more than the filters:

1. **Same suppression setting on all four.** At the top of the search editor VAN offers suppression options (for example *Remove All Suppressions*, or the default that drops deceased and moved voters). Choose one and use it on every search, every pull. Mixing them makes the "left" numbers drift by a couple of percent, and the page's Checks section warns when the registered total moves.
2. **Same regular-voter definition in both "regulars" searches.** If the returned-regulars search says 2022-or-2024 and the registered-regulars search says 2024 only, the page is subtracting apples from oranges.

A quick check after saving: run `All registered voters`; the count in the left sidebar ("My List (N People)") should be the committee's whole active file. Run `All early voters`; it should be a small fraction of that early in voting.

## The export

For each search, in this order:

1. **Run the search.** Wait until the sidebar count updates.
2. **Counts** (the Counts and Crosstabs page; on some committees it is **Counts → Quick Counts**).
3. **Crosstab 1:** your support score. The picker is a tree; open **Scores** and choose the score, for example `2026: DNC Dem Party Support`. Note the name exactly as VAN lists it; the automatic runner needs it spelled the same.
4. **Column 1:** open **Data Field** and choose `Precinct`.
5. **People from: My List.** This dropdown defaults to *Registered Voters*, which is **everyone in the committee**, not your search. If you skip this, every file will have the same total and the page will show nothing left to chase. Check it every time; VAN does not remember it.
6. **Refresh Results.** The table on screen should now have one row per precinct and one column per score band.
7. **Export To Excel.** The file is `DemographicsNew.xls`. Rename it (`returned.xls`, `registered.xls`, `returned_regulars.xls`, `registered_regulars.xls`).

VAN does not save the two pickers with the search, so steps 3 to 5 repeat on every pull. (Report Manager has *Counts and Crosstabs Formats* and *Scheduled Templates* that could save them, but a standard committee login gets "Access to this page is restricted" there, checked October 2026. If your VAN administrator grants that access, a scheduled template that drops the four files into My Export Files would replace the manual pull.)

## What the file looks like

A header row whose first cell is `Precinct`, a row of score-band labels (`0 to 9.99`, `10 to 19.99`, …, `90+`, `Unknown`; percent columns in between are ignored), one row per precinct, and a `Total People` row and column. VAN leaves out precincts with nobody in them, so the returned file usually has fewer rows than the registered file; the page treats a missing precinct as zero returned. A precinct that VAN lists under two counties appears as two rows; use a groups file to bring them together if that matters. The full layout is in [data-contract.md](data-contract.md).

Drop the files on the page and read **Checks**. "The score bands differ" means a different score was picked for one of the files; "Registered total moved more than 3%" usually means a different suppression setting.
