// Plain-language "What to do" lines for failed slots, logged after the error.

/**
 * One plain-language instruction for a failed slot, from the error and from where the
 * browser was when it failed. Read by whoever runs the script, who may not be technical.
 */
export function whatToDo(err, where, slot) {
  const m = err?.message || "";
  const rerun = `npm start -- --headed --only ${slot} --then-make-data`;
  const watch = `Run it again with the browser window visible and watch where it stops: ${rerun}`;
  if (where === "browser") return `The browser itself closed. ${watch}. If that happens every time, run "npx playwright install chromium" to reinstall the browser.`;
  if (/no saved search named/i.test(m)) {
    return `Open VoteBuilder yourself and check the Open Saved Search dialog: the search must exist with exactly the name in searches.json ("${m.match(/named "([^"]+)"/)?.[1] ?? ""}"), in a folder this account can see. Fix the name in VoteBuilder or in searches.json, then: ${rerun}`;
  }
  if (/sign-in page|has expired/i.test(where) || /ActionID|one-time code|login (form|did not)|rejected the login/i.test(m)) {
    return `The VoteBuilder sign-in needs to be redone. Run with the window visible, sign in and enter the code when asked, and tick "Remember this device": ${rerun}. Scheduled runs work again after that (for about 30 days).`;
  }
  if (/dialog did not appear/i.test(m)) {
    return `VoteBuilder was slow to open the saved-search dialog. Nothing wrong was saved. Just run it again: ${rerun}. If it keeps happening, open the search by hand once in VoteBuilder to confirm the dialog works for this login.`;
  }
  if (/did not load into the search editor/i.test(m)) {
    return `VoteBuilder was slow or the dialog did not open the search. Nothing wrong was saved. Just run it again: ${rerun}. If it keeps happening, open the search by hand once in VoteBuilder to confirm it loads.`;
  }
  if (/was counting "Registered Voters"|not counting "My List"|People from/i.test(m)) {
    const nums = m.match(/counts ([\d,]+) people but the saved search has ([\d,]+)/);
    const ratio = nums ? Number(nums[1].replace(/,/g, "")) / Math.max(1, Number(nums[2].replace(/,/g, ""))) : 0;
    if (nums && ratio > 0.8 && ratio < 1.25) {
      return `The export and the list differ by a little, which usually means the search was still running when the count was read, or VoteBuilder changed between the two. Nothing wrong was saved. Run it again: ${rerun}. If the two numbers differ every time, send the last 30 lines of logs/voters.log to whoever maintains the script.`;
    }
    return `On the Counts and Crosstabs page the "People from" dropdown has to say "My List", not "Registered Voters". ${watch}. If the dropdown looks different in your VoteBuilder, send the screenshot in failures/ to whoever maintains the script.`;
  }
  if (/crosstab was incomplete/i.test(m)) {
    return `VoteBuilder handed back a count table whose score cells had not finished computing, twice in a row. Nothing wrong was saved. Run it again in a few minutes: ${rerun}. If it keeps happening at the same time every day, schedule the run for a quieter hour (npm run service -- install --at 07:30).`;
  }
  if (/could not read the "My List/i.test(m)) {
    return `The sidebar count the script checks against was not readable. ${watch}, and note what the left sidebar shows under "My List" after the search runs; send that and the screenshot in failures/ to whoever maintains the script.`;
  }
  if (/no "Total People" row|not a precinct crosstab|voter list|binary Excel|\.xlsx/i.test(m)) {
    return `The file VoteBuilder sent back is not a precinct-by-score crosstab. ${watch}, and check that the Counts page shows Crosstab 1 = your score and Column 1 = Precinct before Export To Excel. If VoteBuilder has changed its export, send the screenshot in failures/ to whoever maintains the script.`;
  }
  if (/which committee|SelectCommittee/i.test(where + m)) {
    return `This login has access to more than one committee and VoteBuilder asked which to open. The script cannot pick one. Open VoteBuilder yourself once, choose the committee with the saved searches, and then: ${rerun}. If it asks every time, ask your VAN admin to make that committee the login's default.`;
  }
  if (/still shows|expected .* but/i.test(m)) {
    return `A picker on the Counts page did not take the value from searches.json. Check that "crosstab" there is spelled exactly as VoteBuilder lists the score (open the Crosstab 1 picker by hand and copy the name), then: ${rerun}`;
  }
  if (/could not find|no .* button|no .* tab/i.test(m)) {
    return `A button or link the script looks for was not on the page, so your VoteBuilder may be laid out differently. ${watch}. Then send the last 30 lines of logs/voters.log plus the .png in failures/ to whoever maintains the script, with the name of the button you would click there yourself.`;
  }
  if (/timed out/i.test(m)) {
    return `VoteBuilder did not respond in time. Nothing wrong was saved. Run it again: ${rerun}. If it times out at the same step every time, send the last 30 lines of logs/voters.log to whoever maintains the script.`;
  }
  return `${watch}. Then send the last 30 lines of logs/voters.log and the .png in failures/ to whoever maintains the script.`;
}
