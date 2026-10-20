/**
 * Names.js — deciding whether two names or two addresses belong to the same
 * person. Pure; tested in Node.
 *
 * Nothing here is clever on purpose. A nickname missing from the list sends a
 * real match to Review; it never causes a false Pass.
 */

/** Default nickname groups. The Nicknames tab is seeded from this and wins over it. */
var DEFAULT_NICKNAME_GROUPS = [
  'ROBERT BOB BOBBY ROB ROBBIE BERT', 'WILLIAM BILL BILLY WILL WILLIE LIAM',
  'RICHARD RICK RICH RICKY DICK', 'JAMES JIM JIMMY JAMIE', 'JOHN JACK JOHNNY JON',
  'JOSEPH JOE JOEY', 'THOMAS TOM TOMMY', 'MICHAEL MIKE MICKEY', 'CHRISTOPHER CHRIS',
  'DANIEL DAN DANNY', 'DAVID DAVE', 'EDWARD ED EDDIE TED NED', 'STEVEN STEPHEN STEVE',
  'MATTHEW MATT', 'ANTHONY TONY', 'ANDREW ANDY DREW', 'NICHOLAS NICK', 'JONATHAN JON',
  'BENJAMIN BEN', 'SAMUEL SAM', 'ALEXANDER ALEX', 'TIMOTHY TIM', 'KENNETH KEN',
  'PATRICK PAT', 'PETER PETE', 'GREGORY GREG', 'JOSHUA JOSH', 'MITCHELL MITCH',
  'DOUGLAS DOUG', 'GERALD JERRY', 'LAWRENCE LARRY', 'RONALD RON', 'DONALD DON',
  'CHARLES CHARLIE CHUCK', 'FREDERICK FRED', 'HERBERT HERB BERT', 'ALBERT AL BERT',
  'JEFFREY JEFF', 'PHILIP PHILLIP PHIL', 'ELIZABETH LIZ BETH BETSY LIZZIE ELIZA',
  'MARGARET PEG PEGGY MAGGIE MEG', 'PATRICIA PAT PATTY TRISH', 'JENNIFER JEN JENNY',
  'DEBORAH DEBRA DEB DEBBIE', 'PAMELA PAM', 'KATHERINE CATHERINE KATHRYN KATE KATIE KATHY CATHY KAT',
  'SUSAN SUE SUSIE', 'REBECCA BECKY BECCA', 'JACQUELINE JACKIE', 'VICTORIA VICKI TORI',
  'CHRISTINE CHRISTINA CHRIS TINA', 'MICHELLE SHELLEY SHELLY', 'REGINA GINA', 'ABIGAIL ABBY ABBE',
  'KIMBERLY KIM', 'BRADFORD BRADLEY BRAD',
  'JESSICA JESS', 'JUDITH JUDY', 'BARBARA BARB', 'CYNTHIA CINDY', 'SAMANTHA SAM',
  'ALEXANDRA ALEX', 'ELEANOR ELLIE', 'DOROTHY DOT DOTTIE', 'VIRGINIA GINNY'
];

var SUFFIXES = { JR: 1, SR: 1, II: 1, III: 1, IV: 1 };
var DIRECTIONS = { N: 1, S: 1, E: 1, W: 1, NE: 1, NW: 1, SE: 1, SW: 1, NORTH: 1, SOUTH: 1, EAST: 1, WEST: 1 };

/** Upper-case words, letters only: "O'Brien-Smith Jr." → ["O", "BRIEN", "SMITH", "JR"]. */
function norm(s) {
  return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(Boolean);
}

/** { NAME: Set of group ids } from "ROBERT BOB ROB"-style rows. */
function nicknameIndex(groups) {
  var idx = {};
  (groups || DEFAULT_NICKNAME_GROUPS).forEach(function (group, i) {
    norm(group).forEach(function (n) {
      if (!idx[n]) idx[n] = {};
      idx[n][i] = true;
    });
  });
  return idx;
}

/** Same first name: equal, equal apart from a trailing E (Ann/Anne), or in a shared nickname group. */
function sameFirst(a, b, nick) {
  if (!a || !b || a.length < 2 || b.length < 2) return false;
  if (a.replace(/E+$/, '') === b.replace(/E+$/, '')) return true;
  var ga = nick[a], gb = nick[b];
  if (!ga || !gb) return false;
  return Object.keys(ga).some(function (g) { return gb[g]; });
}

/**
 * Ratcliff/Obershelp similarity, the same measure as Python's difflib for
 * short strings: 2 × matched characters / total characters.
 */
function similarity(a, b) {
  if (!a.length && !b.length) return 1;
  var matches = 0;
  var stack = [[0, a.length, 0, b.length]];
  while (stack.length) {
    var s = stack.pop(), alo = s[0], ahi = s[1], blo = s[2], bhi = s[3];
    var best = longestMatch_(a, b, alo, ahi, blo, bhi);
    if (!best[2]) continue;
    matches += best[2];
    if (alo < best[0] && blo < best[1]) stack.push([alo, best[0], blo, best[1]]);
    if (best[0] + best[2] < ahi && best[1] + best[2] < bhi) stack.push([best[0] + best[2], ahi, best[1] + best[2], bhi]);
  }
  return 2 * matches / (a.length + b.length);
}

/** Longest common block in a[alo:ahi] vs b[blo:bhi], earliest in a then b on ties. */
function longestMatch_(a, b, alo, ahi, blo, bhi) {
  var bi = 0, bj = 0, size = 0;
  for (var i = alo; i < ahi; i++) {
    for (var j = blo; j < bhi; j++) {
      var k = 0;
      while (i + k < ahi && j + k < bhi && a[i + k] === b[j + k]) k++;
      if (k > size) { bi = i; bj = j; size = k; }
    }
  }
  return [bi, bj, size];
}

function subset_(small, big) {
  return small.every(function (t) { return big.indexOf(t) >= 0; });
}

/** Last names match if one contains the other's parts (hyphenated names) or they differ by a small typo. */
function sameLast(a, b) {
  return subset_(a, b) || subset_(b, a) || similarity(a.join(''), b.join('')) >= 0.85;
}

/**
 * Why the pasted name and the voter-file name might be two different people,
 * or '' when they agree. obs has first, last, vfFirst, vfMiddle, vfLast.
 */
function voterFileNameProblem(obs, nick) {
  var first = norm(obs.first)[0] || '', vfFirst = norm(obs.vfFirst)[0] || '';
  var firstOk = sameFirst(first, vfFirst, nick) || norm(obs.vfMiddle).indexOf(first) >= 0;
  if (firstOk && sameLast(norm(obs.last), norm(obs.vfLast))) return '';
  return 'Voter file record is ' + obs.vfFirst + ' ' + obs.vfLast + '; may be a different person';
}

/** House number plus first street-name word, or PO box number, as "123|MAIN"; null if unparseable. */
function streetKey(street) {
  var tokens = String(street || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  var head = tokens.slice(0, 2).join(' ');
  if (head === 'PO BOX' || head === 'P O') {
    var nums = tokens.filter(function (t) { return /^\d+$/.test(t); });
    return nums.length ? 'BOX|' + nums[0] : null;
  }
  if (tokens.length < 2 || !/^\d/.test(tokens[0])) return null;
  var name = null;
  for (var i = 1; i < tokens.length; i++) if (!DIRECTIONS[tokens[i]]) { name = tokens[i]; break; }
  return name ? tokens[0] + '|' + name : null;
}

/** "FIRST|LAST" for matching a person across lists that lack a shared ID. */
function nameKey(first, last) {
  return (norm(first)[0] || '') + '|' + norm(last).join(' ');
}

function hasSuffix(tokens) {
  return tokens.some(function (t) { return SUFFIXES[t]; });
}

if (typeof module !== 'undefined') {
  module.exports = {
    DEFAULT_NICKNAME_GROUPS: DEFAULT_NICKNAME_GROUPS, norm: norm, nicknameIndex: nicknameIndex, sameFirst: sameFirst,
    similarity: similarity, sameLast: sameLast, voterFileNameProblem: voterFileNameProblem, streetKey: streetKey,
    nameKey: nameKey, hasSuffix: hasSuffix
  };
}
