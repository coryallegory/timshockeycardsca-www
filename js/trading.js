/* The Trading page, /trading (built only with API_URL; markup: apps/web/src/pages/trading.ts; docs/TRADING-PLAN.md).
   `/trading` is the hub; `/trading?u=<trade id>` a trader's profile, the same page for its owner (a preview) and
   everyone else.

   Requests (all through account.js): a visitor who never signed in on this browser makes none on the hub, and only
   the public GET /traders/{id} on a profile. With the signed-in hint the header asks who is signed in (header.ready);
   then the hub loads the collection (the header's one fetch, shared with the menu), GET /profile and GET /following,
   and a profile also loads the collection (for the match; GET /traders/{id} itself says whether you follow them).

   Nothing from the API is inserted as HTML: trade ids, areas and usernames go in as text, links are built only from
   usernames that pass trade.js's checks, and the card grids are rendered at build time (this only sets their classes,
   labels and counts). */
import * as account from './account.js?v=d40d4015b0';
import { copyLink } from './copy.js?v=d40d4015b0';
import * as header from './header-account.js?v=d40d4015b0';
import { signInHref } from './next.js?v=d40d4015b0';
import { extraCopies, inSet, SET_TOTAL, tally } from './set.js?v=d40d4015b0';
import { cellState, cellText, collectionMap, contactLinks, match, profilePath, reportHref, sortTraders, TRADE_ID } from './trade.js?v=d40d4015b0';

const $ = (id) => document.getElementById(id);
const msg = $('trade-msg');
const hubOut = $('hub-out');
const hubIn = $('hub-in');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fullUrl = (tradeId) => location.origin + profilePath(tradeId);

function say(text) {
  msg.textContent = text;
  msg.classList.toggle('is-error', Boolean(text));
}
/** The API says the session is gone: forget it (the header shows Sign in) and say so. */
function sessionEnded() {
  header.signedOut();
  say('Your session has ended. Sign in again to see your matches and the traders you follow.');
}

/** Fills a Follow / Following toggle's state. */
function setPressed(button, on) {
  button.setAttribute('aria-pressed', String(on));
  button.classList.toggle('following', on);
}

/**
 * Follows or unfollows from a toggle, optimistically: the button flips at once and flips back with a message if the
 * save fails. `onChange(on)` runs after the button flips (and again if it flips back).
 */
async function toggleFollow(button, tradeId, onChange = () => {}) {
  const on = button.getAttribute('aria-pressed') !== 'true';
  setPressed(button, on);
  onChange(on);
  button.disabled = true;
  try {
    await (on ? account.follow(tradeId) : account.unfollow(tradeId));
    say('');
  } catch (err) {
    setPressed(button, !on);
    onChange(!on);
    if (err.signedOut) sessionEnded();
    else say(`Couldn't ${on ? 'follow' : 'unfollow'} ${tradeId}. ${account.sentence(err.message)}`);
  } finally {
    button.disabled = false;
  }
}

// ======================================================================= the hub
function hub() {
  if (!account.maybeSignedIn()) return; // the pitch, as rendered; no requests
  hubOut.hidden = true; // neither until the header's check answers
  header.ready.then(({ email, error }) => {
    if (email) return loadHub();
    hubOut.hidden = false;
    if (error) say(`Couldn't check whether you're signed in. ${account.sentence(error.message)}`);
  });
  header.onSignOut(() => {
    hubIn.hidden = true;
    hubOut.hidden = false;
    say('Signed out.');
  });
}

async function loadHub() {
  const [mine, profile, following] = await Promise.allSettled([header.collection(), account.getProfile(), account.getFollowing()]);
  const failures = [mine, profile, following].filter((r) => r.status === 'rejected').map((r) => r.reason);
  if (failures.some((err) => err.signedOut)) {
    hubOut.hidden = false;
    return sessionEnded();
  }
  hubIn.hidden = false;
  if (failures.length) say(`Couldn't load everything. ${account.sentence(failures[0].message)}`);
  const collection = mine.status === 'fulfilled' ? mine.value : null;
  if (profile.status === 'fulfilled') drawMyProfile(profile.value, collection);
  if (following.status === 'fulfilled') drawFollowing(following.value, collection);
}

/** Your trade profile: public or private, the link with Copy, haves and wants counts (no card lists). */
function drawMyProfile(profile, collection) {
  const isPublic = Boolean(profile.public && profile.tradeId);
  for (const [id, show] of [['mp-public', isPublic], ['mp-note-public', isPublic], ['mp-share', isPublic], ['mp-actions-public', isPublic], ['mp-private', !isPublic], ['mp-note-private', !isPublic], ['mp-actions-private', !isPublic]]) {
    $(id).hidden = !show;
  }
  if (isPublic) {
    $('mp-url').textContent = fullUrl(profile.tradeId).replace(/^https?:\/\//, '');
    $('mp-view').href = profilePath(profile.tradeId);
    $('mp-copy').onclick = () => copyLink(fullUrl(profile.tradeId));
  }
  if (!collection) return;
  const { collected, extras } = tally(collection);
  const haves = [...collection.values()].filter((n) => n > 1).length;
  $('mp-haves').textContent = String(haves);
  $('mp-haves-note').textContent = haves ? `cards to trade (${extraCopies(extras)})` : 'cards to trade';
  $('mp-wants').textContent = String(SET_TOTAL - collected);
}

/** Following: each trader with the two-way match, a Following toggle (unfollowed rows stay until reload, to undo), Sort. */
function drawFollowing(traders, collection) {
  const mine = collection ?? new Map();
  const rows = traders.map((t) => {
    const m = match(mine, collectionMap(t), inSet);
    return { tradeId: t.tradeId, fsa: t.fsa, has: m.has.length, needs: m.needs.length, following: true };
  });
  const list = $('fl-list');
  const sort = $('fl-sort');
  const count = () => {
    const n = rows.filter((r) => r.following).length;
    $('fl-count').textContent = n ? String(n) : '';
  };
  const draw = () => {
    list.replaceChildren(...sortTraders(rows, sort.value).map((r) => traderRow(r, count)));
  };
  $('fl-empty').hidden = rows.length > 0;
  $('fl-sort-wrap').hidden = rows.length < 2 || !collection;
  sort.addEventListener('change', draw);
  count();
  draw();
}

const rowTemplate = $('trader-row');
function traderRow(r, recount) {
  const li = rowTemplate.content.firstElementChild.cloneNode(true);
  li.querySelector('.av').textContent = r.tradeId[0];
  const link = li.querySelector('.tid');
  link.textContent = r.tradeId;
  link.href = profilePath(r.tradeId);
  li.querySelector('.where').hidden = !r.fsa; // the area is optional
  li.querySelector('.fsa').textContent = r.fsa ? `${r.fsa} area` : '';
  for (const [cls, n] of [['.m-has', r.has], ['.m-needs', r.needs]]) {
    const part = li.querySelector(cls);
    part.querySelector('b').textContent = String(n);
    part.classList.toggle('zero', n === 0);
  }
  const button = li.querySelector('.follow-btn');
  setPressed(button, r.following);
  button.setAttribute('aria-label', `Follow ${r.tradeId}`);
  button.addEventListener('click', () => toggleFollow(button, r.tradeId, (on) => {
    r.following = on;
    recount();
  }));
  return li;
}

// ======================================================================= a profile
const prof = $('prof');
const cards = $('cards');
const cells = [...cards.querySelectorAll('button.cell')];
const tip = $('cell-tip');
let theirs = new Map(); // the trader's set cards: id -> copies
let mine = null; // a signed-in visitor's collection (not the owner's), once loaded: the ring, the disc and the tiles
let own = false; // the owner's preview
let dim = ''; // the match tile pressed: '' (none), 'get' (you need) or 'give' (you can give)
let trader = null;
let tipFor = null; // the cell whose player popover is open
let pinned = false; // opened by a tap, click or Enter (not just a mouse over it)

function gone() {
  prof.hidden = true;
  $('prof-gone').hidden = false;
  document.title = `Profile not available · ${document.title}`;
}

async function profilePage(id) {
  hubOut.hidden = true;
  if (!TRADE_ID.test(id)) return gone();
  const viewer = account.maybeSignedIn() ? header.ready : Promise.resolve({ email: null });
  try {
    trader = await account.getTrader(id);
  } catch (err) {
    if (err.status === 404) return gone();
    say(`Couldn't load this profile. ${account.sentence(err.message)}`);
    return;
  }
  theirs = collectionMap(trader);
  drawProfile();
  prof.hidden = false;
  const { email } = await viewer;
  if (trader.owner) return drawOwner();
  if (!email) return drawSignedOut();
  // The API says whether you follow them when it knows who you are (signed in when it answered).
  if (typeof trader.following === 'boolean') drawFollow(trader.following);
  try {
    drawMatch(await header.collection());
  } catch (err) {
    if (err.signedOut) {
      sessionEnded();
      return drawSignedOut();
    }
    say(`Couldn't load your collection for the match. ${account.sentence(err.message)}`);
  }
  header.onSignOut(() => {
    say('Signed out.');
    drawSignedOut();
  });
}

/** What everyone sees: name, area, progress, contacts, report link, the grids. */
function drawProfile() {
  const t = trader;
  document.title = `${t.tradeId} · ${document.title}`;
  $('prof-name').textContent = t.tradeId;
  for (const el of document.querySelectorAll('[data-trader-name]')) el.textContent = t.tradeId;
  $('prof-area-wrap').hidden = !t.fsa;
  $('prof-area').textContent = t.fsa ? `${t.fsa} area` : '';
  const { collected } = tally(theirs);
  const haves = [...theirs.values()].filter((n) => n > 1).length;
  $('prof-collected').textContent = `${collected} of ${SET_TOTAL} collected`;
  $('prof-counts').textContent = `${haves} spares · ${SET_TOTAL - collected} wants`;
  // Collection: the count, the bar, Base / Inserts / Short prints.
  $('pc-count').textContent = String(collected);
  $('pc-bar').value = collected;
  for (const part of $('pc-split').querySelectorAll('[data-prefixes]')) {
    const prefixes = part.dataset.prefixes.split(' ');
    const n = [...theirs.keys()].filter((id) => prefixes.some((p) => id.startsWith(p))).length;
    const b = part.querySelector('b');
    b.textContent = `${n}/${b.dataset.total}`;
  }
  drawContacts(t.contacts);
  const report = $('report');
  report.href = reportHref(t.tradeId, report.dataset.to);
  for (const b of document.querySelectorAll('[data-copy-profile]')) b.addEventListener('click', () => copyLink(fullUrl(t.tradeId)));
  for (const tile of document.querySelectorAll('.mt[data-dim]')) {
    tile.addEventListener('click', () => {
      dim = dim === tile.dataset.dim ? '' : tile.dataset.dim;
      drawCells();
      if (dim) revealMatches();
    });
  }
  wireCells();
  drawCells();
}

const contactTemplate = $('contact-item');
function drawContacts(contacts) {
  const items = contactLinks(contacts).map((c) => {
    const li = contactTemplate.content.firstElementChild.cloneNode(true);
    const a = li.querySelector('a');
    a.href = c.href;
    a.setAttribute('aria-label', `${c.name}: ${c.label} (opens in a new tab)`);
    li.querySelector('.glyph').textContent = c.glyph;
    li.querySelector('small').textContent = c.name;
    li.querySelector('.handle').textContent = c.label;
    return li;
  });
  $('ct-list').replaceChildren(...items);
  $('ct-empty').hidden = items.length > 0;
}

/** The owner viewing their own profile: the page exactly as others see it (owner decision), minus Follow and the match; cells in "you" words. */
function drawOwner() {
  own = true;
  drawCells();
}

/** A visitor who isn't signed in: Sign in to follow, and to see the match (both returning to this profile). */
function drawSignedOut() {
  mine = null;
  dim = '';
  const back = signInHref(location.pathname + location.search);
  $('prof-follow').hidden = true;
  $('prof-signin').hidden = false;
  $('prof-signin').href = back;
  $('match-signin').href = back;
  $('prof-match').hidden = true;
  $('prof-match-out').hidden = false;
  drawCells();
}

function drawFollow(on) {
  const button = $('prof-follow');
  setPressed(button, on);
  button.classList.toggle('primary', !on);
  button.setAttribute('aria-label', `Follow ${trader.tradeId}`);
  button.hidden = false;
  button.onclick = () => toggleFollow(button, trader.tradeId, (now) => button.classList.toggle('primary', !now));
}

/** The two-way match with the viewer's collection: the two tiles (toggles that dim the other cells), rings and discs. */
function drawMatch(collection) {
  const m = match(collection, theirs, inSet);
  mine = collection;
  const tiles = [
    [$('mt-has'), $('mt-has-note'), m.has.length, 'Their spares on your missing list', 'None of their spares are on your missing list'],
    [$('mt-needs'), $('mt-needs-note'), m.needs.length, 'Your spares on their missing list', 'None of your spares are on their list'],
  ];
  for (const [count, note, n, some, none] of tiles) {
    const tile = count.closest('.mt');
    count.textContent = String(n);
    note.textContent = n ? `${some}. Tap to pick them out.` : none;
    tile.classList.toggle('zero', n === 0);
    tile.disabled = n === 0;
  }
  $('prof-match').hidden = false;
  $('prof-match-out').hidden = true;
  drawCells();
}

/**
 * Marks every cell from the trader's collection (and the visitor's, for the ring and disc), labels it, dims the cells a
 * pressed tile doesn't pick, and fills each set's count, the section's count, the legend and the tiles.
 */
function drawCells() {
  let missing = 0;
  let spares = 0;
  let picked = 0;
  for (const block of cards.querySelectorAll('.set-block')) {
    const inBlock = block.querySelectorAll('.cell');
    let m = 0;
    let s = 0;
    let lit = 0;
    for (const b of inBlock) {
      const cell = cellState(b.dataset.cardId, theirs, mine);
      const on = !dim || cell[dim];
      b.className = `cell ${cell.state}${cell.get ? ' get' : ''}${cell.give ? ' give' : ''}${on ? '' : ' dim'}`;
      b.querySelector('.cnt').textContent = cell.spare ? String(cell.spare) : '';
      b.setAttribute('aria-label', cellText(b.dataset.no, b.dataset.who, cell, own));
      if (cell.state === 'want') m++;
      if (cell.state === 'spare') s++;
      if (dim && on) lit++;
    }
    const spareText = s ? ` · ${s} spare` : '';
    block.querySelector('.n').textContent = dim
      ? `${lit} ${dim === 'get' ? 'you need' : 'you can give'}`
      : m ? `${m} of ${inBlock.length} missing${spareText}` : `✓ Complete${spareText}`;
    missing += m;
    spares += s;
    picked += lit;
  }
  $('cards-count').textContent = `${missing} missing · ${spares} spare`;
  for (const li of cards.querySelectorAll('.grid-key [data-key]')) li.hidden = !mine;
  for (const tile of document.querySelectorAll('.mt[data-dim]')) tile.setAttribute('aria-pressed', String(tile.dataset.dim === dim));
  $('dim-note').textContent = !dim ? '' : `Showing the ${plural(picked, 'card', 'cards')} ${dim === 'get' ? `you need from ${trader.tradeId}` : `you can give ${trader.tradeId}`}. Tap the tile again to show all.`;
  if (tipFor) tip.textContent = tipFor.getAttribute('aria-label');
}

/** After a tile is pressed: brings the first picked cell's set into view if it's off screen (phones: below the links). */
function revealMatches() {
  const block = cells.find((b) => !b.classList.contains('dim'))?.closest('.set-block');
  if (!block) return;
  const r = block.getBoundingClientRect();
  if (r.top > innerHeight * 0.75 || r.bottom < 0) block.scrollIntoView({ block: 'start' });
}

// The player popover: one at a time, under the cell's own <li> so it scrolls with it. Hover (a mouse) shows it while
// over the cell; a tap, click or Enter pins it until tapped again, Escape, or a tap elsewhere. It repeats the cell's
// label (which screen readers already get), so it's hidden from them.
function showTip(b, pin) {
  tipFor = b;
  pinned = pin;
  tip.textContent = b.getAttribute('aria-label');
  tip.classList.remove('at-start', 'at-end');
  b.parentElement.append(tip);
  tip.hidden = false;
  // Centred over the cell unless that would cross the grid's edge: then lined up with the cell's start or end.
  const grid = b.closest('.grid').getBoundingClientRect();
  const r = tip.getBoundingClientRect();
  if (r.left < grid.left) tip.classList.add('at-start');
  else if (r.right > grid.right) tip.classList.add('at-end');
}

function hideTip() {
  tipFor = null;
  pinned = false;
  tip.hidden = true;
}

/** Moves the grid's one Tab stop to `b` and focuses it (a pinned popover follows). */
function focusCell(b) {
  for (const c of b.closest('.grid').querySelectorAll('.cell')) c.tabIndex = c === b ? 0 : -1;
  b.focus();
  if (pinned) showTip(b, true);
}

/** Arrow keys, Home and End within a set's grid (up and down by the row's length as laid out). */
function arrowTarget(b, key) {
  const list = [...b.closest('.grid').querySelectorAll('.cell')];
  const i = list.indexOf(b);
  const cols = Math.max(1, list.filter((c) => c.offsetTop === list[0].offsetTop).length);
  const to = { ArrowLeft: i - 1, ArrowRight: i + 1, ArrowUp: i - cols, ArrowDown: i + cols, Home: 0, End: list.length - 1 }[key];
  return to === undefined ? null : list[Math.min(Math.max(to, 0), list.length - 1)];
}

function wireCells() {
  const cellOf = (e) => e.target.closest?.('button.cell'); // not the legend's samples
  cards.addEventListener('click', (e) => {
    const b = cellOf(e);
    if (!b) return;
    if (tipFor === b && pinned) return hideTip();
    focusCell(b);
    showTip(b, true);
  });
  cards.addEventListener('pointerover', (e) => {
    const b = cellOf(e);
    if (b && e.pointerType === 'mouse' && !pinned) showTip(b, false);
  });
  cards.addEventListener('pointerout', (e) => {
    const b = cellOf(e);
    if (b && e.pointerType === 'mouse' && !pinned && tipFor === b && !b.contains(e.relatedTarget)) hideTip();
  });
  cards.addEventListener('keydown', (e) => {
    const b = cellOf(e);
    if (!b) return;
    const next = arrowTarget(b, e.key);
    if (!next) return;
    e.preventDefault();
    focusCell(next);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tipFor) hideTip();
  });
  document.addEventListener('pointerdown', (e) => {
    if (tipFor && !cellOf(e)) hideTip();
  });
}

// ======================================================================= which one
const u = new URLSearchParams(location.search).get('u');
if (u === null) hub();
else profilePage(u.trim());
