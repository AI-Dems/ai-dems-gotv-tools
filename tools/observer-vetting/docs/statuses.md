# Statuses and matching rules

These are the rules from the original NH script, unchanged except where noted at the bottom. The test suite (`apps-script/test/parity.test.js`) checks 25 synthetic people against the original's output.

## Paths

| Path | Who | Decided by |
|---|---|---|
| Voter file | Rows with voter-file columns filled (see [data-contract.md](data-contract.md)) | Party and support score |
| Out of state | Address in another state | FEC donations |
| In state, no voter file match | Address in the home state, no voter-file columns | Always Review. FEC shown for context. Usually means the person should be looked up on the voter file by hand. |
| No address | No state pasted | Always Review. FEC shown for context (name-only match, weak). |

## Statuses

| Status | Meaning |
|---|---|
| **Pass** | Meets the rule with a confident identity match |
| **Review** | Needs a person to check; Notes says why |
| **Flag** | Evidence against: not a Democrat on the voter file, or a Republican-only donor with a confident match |
| **Pending** | FEC lookup not done yet; the run is still going (`Setup → Status`) |

**Voter-file path.** Pass if `voter_file_party` matches one of the labels on `Setup`, or `support_score` is above the threshold (default 0.5; exactly 0.5 does not pass). Otherwise Flag. If the pasted name and the voter-file name look like different people, Review instead, whatever the party.

**FEC path.** The verdict is one of Dem donor, Rep donor, Mixed, Other only (PACs with no party), No history.

| Verdict | Match confident? | Status |
|---|---|---|
| Rep donor | yes | Flag |
| Rep donor | no | Review |
| Dem donor, out of state | yes | Pass |
| anything else | | Review |

"Confident" means FEC Match is **Strong (street)**, or **Medium (zip, no street on file)** when no street was pasted to compare, and nothing in the records suggests a relative (a different first name, or a Jr/Sr suffix).

## Rows go to Review when

- The pasted name and the voter-file name differ beyond a nickname (Colin vs Danny)
- An FEC first name differs from the observer's (Chris vs Christie), or the FEC name carries Jr/Sr: it may be a relative at the same address
- The FEC match is by zip only but the pasted street differs, or is by name alone
- FEC shows Mixed donations, No history, or only party-less PACs
- The person is in the home state with no voter-file columns, or has no address at all

## Matching

**First names** count as the same if equal, equal apart from a trailing *e* (Ann/Anne), or in the same row of the `Nicknames` tab. One-letter names never match.

**Last names** match if one contains all of the other's parts (Smith-Lee / Lee) or they differ by a small typo (Quinn / Quin).

**FEC records** are fetched by full name and state for every election cycle since `Setup → Search FEC gifts since`. They are first kept only if the FEC last name contains the pasted last name and the first names share a prefix or a nickname. Then they narrow: to records at the pasted zip, then to records at the pasted street (house number plus first street word, or PO box number). The narrowest non-empty level is used, and **FEC Match** says which. Records at other streets or zips are counted in Notes but not in the totals.

**Party** of a gift is the FEC party of the receiving committee. ActBlue counts as Dem and WinRed as Rep, credited to the earmarked candidate in Top Recipients. Committees with no FEC party (most PACs and joint fundraisers) use the `Committees` tab. Gifts whose memo says they came through ActBlue or WinRed are dropped when the conduit's own record is present, so they are not counted twice.

**Served Before** matches on first and last name against `prior_observers`.

## Known limits

- Two people with the same (or nickname-equivalent) name at the same address look identical, e.g. a parent and child, unless the FEC record has Jr/Sr.
- Common names matched only on zip are weak evidence. Check these before acting on a Flag.
- The FEC has no emails or phone numbers, so matching uses names and addresses only.
- A nickname missing from the `Nicknames` tab sends a real match to Review. It never causes a false Pass.
- Only the first 500 FEC records per name and state are read. For a very common name in a big state, add a street and zip so the narrowing has something to work with, and check FEC Link by hand.

## Differences from the original NH script

- FEC records are kept when the first name is a nickname of the pasted one (Mike / Michael). The original required a shared prefix, so such gifts were invisible and the person showed "No history". The narrowing by zip and street still applies, and the result is checked in the test suite.
- A non-numeric support score is treated as blank rather than stopping the run.
- Dollar totals and gift counts are separate numeric columns instead of "$125 / 2" text, so the tab sorts and filters.
