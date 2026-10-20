# Metrics

What every number on the page means, in the order you meet them. Everything is computed per precinct and per score band from the files you loaded; nothing is modelled or projected.

## Left

For one precinct and one score band: **registered minus returned**. Registered comes from the *Registered* file (or *Registered, regulars* when *Counting* is set to regular voters); returned comes from the matching *Returned* file. A precinct missing from the returned file counts as zero returned (VAN omits precincts with nobody in them). If returned exceeds registered (a different suppression setting, or a registration pull older than the returns), the value is clamped at zero and Checks says so.

## Buckets

The score bands in the file (`0 to 9.99`, `10 to 19.99`, …, `90+`) are grouped into buckets, highest score first, by the cutoffs you set under *Score groups*. The default is five buckets on a 0 to 100 Democratic support score:

| Bucket | Bands | Chase by default |
|---|---|---|
| Strong D | 80 and up | yes |
| Lean D | 60 to 79.99 | yes |
| Undecided | 40 to 59.99 | yes |
| Lean R | 20 to 39.99 | no |
| Strong R | 0 to 19.99 | no |
| No score | VAN's `Unknown` band | no |

Presets for four buckets (no undecided) and three (Dem, Undecided, Rep) are built in. A bucket's lowest band is picked from the bands actually in the file, so a 0 to 1 score works too. Cutoffs are yours to set; the page only assumes band labels begin with a number.

## Chase left

For a precinct: the sum of *left* over the buckets ticked as chase. This is the ranking column and the headline number. It is a count of people, not votes, and it does not say how many of them will vote.

## Who's left (the bar)

The precinct's *left* by bucket, chase buckets first in their own colours, then the rest. Every row uses the same scale, so a short bar is a precinct with few people left, not a different scale. Bars end where the people end: a precinct that has mostly voted has a short bar.

## Cumulative %

Of the chase voters still out in the current filter, the share covered by this row and every row above it. "The top 15 cover 40%" is read straight off the fifteenth row.

## % voted

For a precinct: returned divided by registered, on the current *Counting* basis. Early in voting this is small everywhere; it is the column to sort by when you want the precincts that are lagging.

## Headline numbers

- **Chase voters still out:** the sum of *chase left* over the precincts in the current filter.
- **Half of them are in N of M precincts:** the fewest top-ranked precincts whose cumulative share reaches 50%.
- **Ballots returned:** the *Returned* file's total (with the regulars total beside it when that file is loaded).
- **Share of registered / regular voters who voted:** ballots returned divided by the registered total on the current basis.
- **Days to Election Day:** from the date you set in the Data section.

## Regular voters

A voter who voted in the last midterm general or the last presidential general. The page does not decide this; your two "regulars" VAN searches do ([van-searches.md](van-searches.md)). Use the same definition in both.

## History

One row per as-of date: the four file totals. The page adds a row whenever files are loaded with a new date, and keeps the rows when files are replaced. It is a record of the totals, not of every precinct.

## What is deliberately not here

Turnout projections, vote-goal pace, persuasion assumptions, precinct matching between years. The page shows who is left by score today. What to do about it is the field plan's job.
