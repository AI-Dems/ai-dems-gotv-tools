# Data contract: the `observers` tab

One row per person. Columns are read by name (row 1); spaces, capitals and underscores do not matter, so `First Name`, `first_name` and `FIRSTNAME` are the same column. Column order does not matter and extra columns are ignored.

## Columns

| Column | Required | Also accepted as | Used for |
|---|---|---|---|
| `first_name` | yes | `first` | Matching |
| `last_name` | yes | `last` | Matching |
| `state` | strongly recommended | | Decides the path: home state, out of state, or no address. Without it a person can only be Review. |
| `zip` | recommended | `zip_code`, `postal_code` | Narrows FEC records to the person. 5 or 9 digits; a dropped leading zero is restored. |
| `street` | recommended | `address`, `street_address` | Narrows FEC records to the exact household: the strongest match. |
| `city` | optional | `town` | Shown on Vetting only |
| `id` | optional | `van_id`, `voter_id` | Keeps your Vetted initials attached to the right person across re-runs. Without it, name + zip is used. |
| `email`, `phone` | optional | `cell` | Shown on Vetting only. Leave out if the team does not need them there. |
| `voter_file_party` | voter-file rows | `party`, `registered_party` | Registered party as your voter file spells it ("Democratic", "DEM", "D"…). Add spellings on `Setup → Democratic party labels`. |
| `support_score` | voter-file rows | `dem_support`, `support` | 0–1. Above `Setup → Support score threshold` passes. If your scores are 0–100, divide by 100 first. |
| `voter_file_first_name`, `voter_file_last_name`, `voter_file_middle_name` | optional | `vf_first_name`… | The name on the matched voter-file record, if it can differ from the pasted name. A mismatch (other than a nickname) sends the row to Review. |
| `voter_file_match` | optional | `in_voter_file` | `Yes`/`No`. Only needed when a person is on your voter file but has neither a party nor a score; otherwise a filled party or score already means "on the voter file". |

A person is on the **voter-file path** when `voter_file_match` says yes, or (if that column is absent) when `voter_file_party` or `support_score` is filled. Everyone else goes to the **FEC path**.

## Where the columns come from

**From VAN / Votebuilder.** Build a list of your observers (a survey response, activist code or event role), then Export with name, address, phone, email, VAN ID, Party and your support score field. Paste the export in; rename headers if the names differ from the table above. People the export shows with a party are on your voter file.

**From a warehouse.** Any query that joins your observer list to the voter file works. The columns above are the whole interface; the original NH query joined MyCampaign survey responses to the state voter file and a DSCC score table, and selected exactly these fields.

**Out-of-state volunteers** will have no voter-file columns. That is expected: the FEC path handles them.

## The `prior_observers` tab (optional)

`first_name` and `last_name` of people who served in a past cycle. Matching rows on Vetting get `Yes (name match)` in **Served Before**. It matches on first and last name only, since IDs rarely carry over between cycles or committees.

## The `Nicknames` and `Committees` tabs

Both are seeded with defaults by **Build sheet** and can be edited.

- `Nicknames`: one group of equivalent first names per row (`Robert, Bob, Bobby, Rob`). A pasted first name and a voter-file or FEC first name in the same group count as the same person. Add a row when a real match lands in Review over a nickname.
- `Committees`: the FEC leaves party blank on PACs and joint fundraising committees. A committee whose name contains the text in column A counts for the party in column B (`DEM` or `REP`). Add your state party, your candidate's joint fundraiser, and the other side's.

## The `Vetting` tab (output)

| Column | Meaning |
|---|---|
| Vetted | Yours. Initials once a person has looked at the row. Kept on re-runs. |
| Status | Pass, Review, Flag, or Pending (FEC lookup not done yet). See [statuses.md](statuses.md). |
| Path | Voter file / Out of state / In state, no voter file match / No address |
| ID, Last, First, City, State, Zip, Email, Phone | As pasted |
| VF Party, Support Score | As pasted |
| Served Before | From `prior_observers` |
| Dem $, Dem Gifts, Rep $, Rep Gifts, Other $ | Totals over the FEC records matched to this person |
| Top Recipients | Up to four committees or earmarked candidates, with gift counts |
| FEC Match | How the records were tied to this person: Strong (street), Medium (zip…), Weak (name…) |
| FEC Address | Up to two addresses on the matched records, to compare with the pasted one |
| FEC Link | The public FEC search for this name and state |
| Notes | Why the status is what it is |

A hidden `row_key` column at the end ties rows to observers across rebuilds. Leave it alone.
