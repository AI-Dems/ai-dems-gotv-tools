import { test } from "node:test";
import assert from "node:assert/strict";
import { whatToDo } from "../src/advice.mjs";

const err = (message) => new Error(message);

test("every advice line names the re-run command for that slot", () => {
  const cases = [
    [err("the export counts 657,592 people but the saved search has 51,328; the Counts page was counting \"Registered Voters\" (everyone), not \"My List\". File not saved."), ""],
    [err("the saved search \"All early voters\" was chosen but did not load into the search editor within 45 seconds"), ""],
    [err("no saved search named \"VC Returned\" visible to this account"), ""],
    [err("could not find \"Counts\" on the page (at https://www.votebuilder.com/x)"), ""],
    [err("timed out after 45000ms waiting for Run Search to finish"), ""],
    [err("something new"), ""],
    [err("Target closed"), "browser"],
    [err("could not find \"Counts\" on the page"), "the browser is on the ActionID sign-in page, so the saved sign-in has expired"]
  ];
  for (const [e, where] of cases) {
    const line = whatToDo(e, where, "returned");
    assert.match(line, /npm start -- --headed --only returned --then-make-data/, line);
  }
});

test("a lapsed sign-in is diagnosed from where the browser stopped, not the error text", () => {
  const line = whatToDo(err("could not find \"Counts\" on the page"), "the browser is on the ActionID sign-in page, so the saved sign-in has expired", "registered");
  assert.match(line, /sign-in needs to be redone/);
  assert.match(line, /Remember this device/);
});

test("the wrong People from setting points at the dropdown", () => {
  assert.match(whatToDo(err("the Counts page was counting \"Registered Voters\" (everyone), not \"My List\""), "", "returned"), /"People from" dropdown has to say "My List"/);
});

test("a missing saved search quotes the name to check", () => {
  assert.match(whatToDo(err("no saved search named \"VC Returned\" visible to this account"), "", "returned"), /"VC Returned"/);
});

test("a small mismatch is read as a stale count, a big one as the wrong People from setting", () => {
  assert.match(whatToDo(err("the export counts 51,300 people but the saved search has 51,328; the Counts page was counting \"Registered Voters\""), "", "returned"), /still running when the count was read/);
  assert.match(whatToDo(err("the export counts 657,592 people but the saved search has 51,328; the Counts page was counting \"Registered Voters\""), "", "returned"), /"People from" dropdown/);
});

test("a slow dialog is told apart from a wrong search name", () => {
  assert.match(whatToDo(err("the Open Saved Search dialog did not appear within 30 seconds of clicking Open"), "", "returned"), /slow to open/);
});

test("an incomplete crosstab is told apart from the People from bug", () => {
  assert.match(whatToDo(err("VoteBuilder's crosstab was incomplete twice: the score cells add up to 45,766 people but the row totals say 51,328"), "", "returned"), /had not finished computing/);
});

test("a search-not-found message never gets sign-in advice, even though it mentions the account", () => {
  const line = whatToDo(err('no saved search named "All early voters" in any of the 5 folder(s) this account can see: A; B'), "a VoteBuilder dialog is still open", "returned");
  assert.match(line, /Open Saved Search dialog/);
  assert.doesNotMatch(line, /sign-in needs to be redone/);
});
