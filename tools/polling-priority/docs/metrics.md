# Metrics: what the Priority tab computes

## Per voter

Two scores for each registered voter, from whatever models your campaign has:

| Score | Meaning |
|---|---|
| **t** turnout | Chance the voter casts a ballot (0–1) |
| **p** support | Chance the voter picks our candidate, if they vote (0–1). A Dem partisanship score is a fine stand-in. |

## Per polling location

Summed over everyone assigned to the location:

| Measure | Formula | Meaning |
|---|---|---|
| Likely Voters | Σ t | Expected ballots cast there |
| Likely Supporters | Σ p·t | Expected votes for us |
| **Net Vote Gain** | 2 × Likely Supporters − Likely Voters | Our expected votes minus everyone else's |

Each voter adds p·t votes for us and (1 − p)·t for others, so their net contribution is (2p − 1)·t. Positive net vote gain means shorter lines there help us on net; negative means they help the opponent. Third-party and blank votes count as "other", so the number slightly understates our margin over the main opponent, which is harmless for ranking.

The sums come from the `locations` tab ([data-contract.md](data-contract.md)); the tool never sees voter-level data.

## Why not rank by size

The DSCC's original template scored locations by a weighted sum of 84 demographic counts. In practice it correlated 0.987 with the number of registered voters: it was a size ranking. Large Republican-leaning sites came out on top, and opponent votes never counted against a site, so shortening a line there could cost net votes. Changing the weights barely moved anything. Net vote gain replaced it in 2026.

## Rank

Competition rank by Net Vote Gain, highest first (ties share a rank). *Voters Rank* is the same by Likely Voters, for comparison.

## Tiers

Five tiers for each of three measures: Net Vote Gain (deploy by this one), Likely Supporters, Likely Voters. The last two measure size and help judge where lines will be long.

Each tier is a range of values; ranges include their upper bound. Tier 1 is above the first cutoff, tier 5 at or below the last.

**Automatic (default).** With the cutoff cells on `Setup` blank, the tool finds Jenks natural breaks in your data (the five groups with the least spread inside each), rounds them to two significant figures so they read like numbers a person chose, and shows them in `Setup → Status`. They are recomputed every time you run *Recompute priority*, so if the locations tab changes a lot the tiers can shift.

**Fixed.** Type four numbers, high to low, into the cutoff cell to freeze a measure's tiers (`1000, 400, 0, -400`). Do this once the ranking looks right and you want a tier to mean the same range on every refresh. A good habit: run it automatically once, copy the cutoffs the Status area shows into `Setup`, and adjust by eye.

For reference, the 2026 New Hampshire cutoffs (statewide, ~300 locations) were Net Vote Gain `1000, 400, 0, -400`, Likely Supporters `4000, 2000, 1200, 500`, Likely Voters `8000, 5500, 3000, 1500`. Yours will differ with the size of your locations.

**Override.** The yellow *Tier Override* column on `Priority` pins a location's tier regardless of the number. Use it for local knowledge: a site with a known slow check-in, a location that moved, a place voter protection has decided to staff no matter what. Overrides are kept across recomputes and show on the Line Reports tab.

## Line Reports ordering

Longest reported wait first (`3+ Hours`, `2 Hours`, `1 Hour`, `30 Minutes`, then any wait value the tool doesn't know, then `No Line`, `Voting has completed`, then locations with no report), then by Rank, then by name. So the top of the tab is always "the longest lines, at the places where that matters most."
