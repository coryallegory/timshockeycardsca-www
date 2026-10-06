/* The Trading page, /trading (built only with API_URL; markup: apps/web/src/pages/trading.ts; docs/TRADING-PLAN.md).
   `/trading` is the hub; `/trading?u=<trade id>` a trader's profile, the same page for its owner (a preview) and
   everyone else.

   Requests (all through account.js): a visitor who never signed in on this browser makes none on the hub, and only
   the public GET /traders/{id} on a profile. With the signed-in hint the header asks who is signed in (header.ready);
   then the hub loads the collection (the header's one fetch, shared with the menu), GET /profile and GET /following,
   and a profile also loads the collection (for the match; GET /traders/{id} itself says whether you follow them).

   Nothing from the API is inserted as HTML: trade ids, areas and usernames go in as text, links are built only from
   usernames that pass trade.js's checks, and the card lists are rendered at build time, hidden, then shown here. */
import * as account from './account.js?v=c464393174';
import { copyLink } from './copy.js?v=c464393174';
import * as header from './header-account.js?v=c464393174';
import { signInHref } from './next.js?v=c464393174';
import { extraCopies, inSet, SET_TOTAL, tally } from './set.js?v=c464393174';
import { collectionMap, contactLinks, match, profilePath, reportHref, sortTraders, TRADE_ID } from './trade.js?v=c464393174';

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
/** What the lists show: 'all', or 'match' (the cards you need / the cards you have extras of). */
const lists = { haves: 'all', wants: 'all' };
let theirs = new Map(); // the trader's set cards: id -> copies
let need = new Set(); // their extras you don't have
let give = new Set(); // their missing cards you have extras of
let matched = false; // a signed-in visitor (not the owner) whose collection loaded
let trader = null;

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

/** What everyone sees: name, area, progress, contacts, report link, the lists. */
function drawProfile() {
  const t = trader;
  document.title = `${t.tradeId} · ${document.title}`;
  $('prof-name').textContent = t.tradeId;
  for (const el of document.querySelectorAll('[data-trader-name]')) el.textContent = t.tradeId;
  $('prof-area-wrap').hidden = !t.fsa;
  $('prof-area').textContent = t.fsa ? `${t.fsa} area` : '';
  const { collected, extras } = tally(theirs);
  const haves = [...theirs.values()].filter((n) => n > 1).length;
  $('prof-collected').textContent = `${collected} of ${SET_TOTAL} collected`;
  $('prof-counts').textContent = `${haves} haves · ${SET_TOTAL - collected} wants`;
  $('haves-count').textContent = `${plural(haves, 'card', 'cards')} · ${extraCopies(extras)}`;
  $('wants-count').textContent = plural(SET_TOTAL - collected, 'card', 'cards');
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
  for (const [list, seg] of [['haves', $('haves-seg')], ['wants', $('wants-seg')]]) {
    for (const b of seg.querySelectorAll('button')) b.addEventListener('click', () => pick(list, b.dataset.show));
  }
  for (const tile of document.querySelectorAll('.mt[data-pick]')) tile.addEventListener('click', () => pick(tile.dataset.pick, 'match'));
  drawBlurbs(false);
  drawLists();
}

function drawBlurbs(own) {
  const who = own ? 'you' : trader.tradeId;
  $('haves-blurb').textContent = `Copies beyond ${own ? 'your' : 'their'} first: what ${who} can trade away.`;
  $('wants-blurb').textContent = `Set cards ${own ? "you don't" : `${who} doesn't`} have yet, by card number. Hover or tap and hold a number for the player.`;
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

/** The owner's preview: the bar (and "Private" while private); no Follow, no match. */
function drawOwner() {
  $('own-banner').hidden = false;
  $('own-private').hidden = trader.public;
  $('prof-actions').hidden = true;
  drawBlurbs(true);
}

/** A visitor who isn't signed in: Sign in to follow, and to see the match (both returning to this profile). */
function drawSignedOut() {
  matched = false;
  need = new Set();
  give = new Set();
  const back = signInHref(location.pathname + location.search);
  $('prof-follow').hidden = true;
  $('prof-signin').hidden = false;
  $('prof-signin').href = back;
  $('match-signin').href = back;
  $('prof-match').hidden = true;
  $('prof-match-out').hidden = false;
  for (const list of ['haves', 'wants']) lists[list] = 'all';
  drawLists();
}

function drawFollow(on) {
  const button = $('prof-follow');
  setPressed(button, on);
  button.classList.toggle('primary', !on);
  button.setAttribute('aria-label', `Follow ${trader.tradeId}`);
  button.hidden = false;
  button.onclick = () => toggleFollow(button, trader.tradeId, (now) => button.classList.toggle('primary', !now));
}

/** The two-way match with the viewer's collection: two tiles, the highlights and the lists' toggles. */
function drawMatch(mine) {
  const m = match(mine, theirs, inSet);
  need = new Set(m.has);
  give = new Set(m.needs);
  matched = true;
  $('mt-has').textContent = String(need.size);
  $('mt-needs').textContent = String(give.size);
  $('mt-has-note').textContent = need.size ? 'Their extras on your missing list' : 'None of their extras are on your missing list';
  $('mt-needs-note').textContent = give.size ? 'Your extras on their missing list' : 'None of your extras are on their list';
  for (const [tile, n] of [[$('mt-has'), need.size], [$('mt-needs'), give.size]]) tile.closest('.mt').classList.toggle('zero', n === 0);
  $('prof-match').hidden = false;
  $('prof-match-out').hidden = true;
  drawLists();
}

function pick(list, show) {
  lists[list] = show;
  drawLists();
}

/** Shows the trader's haves (cards with extras, "+N") and wants (missing set cards), each set with its counts. */
function drawLists() {
  // Haves
  let shownHaves = 0;
  for (const block of document.querySelectorAll('#haves .set-block')) {
    let cards = 0;
    let hits = 0;
    let shown = 0;
    for (const li of block.querySelectorAll('li[data-card-id]')) {
      const n = theirs.get(li.dataset.cardId) ?? 0;
      const hit = matched && need.has(li.dataset.cardId);
      if (n > 1) cards++;
      if (n > 1 && hit) hits++;
      li.hidden = !(n > 1 && (lists.haves === 'all' || hit));
      if (!li.hidden) shown++;
      li.classList.toggle('hit', hit);
      li.querySelector('.xn').textContent = n > 1 ? `+${n - 1}` : '';
    }
    block.hidden = shown === 0;
    shownHaves += shown;
    block.querySelector('.n').textContent = lists.haves === 'match' ? plural(shown, 'card', 'cards') : `${plural(cards, 'card', 'cards')}${hits ? ` · ${hits} you need` : ''}`;
  }
  const haveTotal = [...theirs.values()].filter((n) => n > 1).length;
  drawSeg('haves', haveTotal, need.size);
  $('haves-key').hidden = !(matched && need.size && lists.haves === 'all');
  $('haves-empty').hidden = shownHaves > 0;
  $('haves-empty').textContent = lists.haves === 'match' ? 'None of their extras are on your missing list.' : 'No extras yet.';

  // Wants
  let shownWants = 0;
  const complete = [];
  for (const block of document.querySelectorAll('#wants .set-block')) {
    let missing = 0;
    let hits = 0;
    let shown = 0;
    const chips = block.querySelectorAll('li[data-card-id]');
    for (const li of chips) {
      const owned = theirs.has(li.dataset.cardId);
      const hit = matched && give.has(li.dataset.cardId);
      if (!owned) missing++;
      if (!owned && hit) hits++;
      li.hidden = !(!owned && (lists.wants === 'all' || hit));
      if (!li.hidden) shown++;
      li.classList.toggle('hit', hit);
    }
    if (missing === 0) complete.push(block.dataset.name);
    block.hidden = shown === 0;
    shownWants += shown;
    block.querySelector('.n').textContent = lists.wants === 'match' ? plural(shown, 'card', 'cards') : `${missing} of ${chips.length} missing${hits ? ` · ${hits} you have` : ''}`;
  }
  drawSeg('wants', SET_TOTAL - theirs.size, give.size);
  $('wants-key').hidden = !(matched && give.size && lists.wants === 'all');
  $('wants-complete').hidden = !complete.length || lists.wants === 'match';
  $('wants-complete').textContent = `✓ Complete: ${complete.join(', ')}`;
  $('wants-empty').hidden = shownWants > 0;
  $('wants-empty').textContent = lists.wants === 'match' ? 'None of your extras are on their missing list.' : 'Nothing missing: the set is complete.';
}

/** A list's All / You need toggle: only with a match; counts in each half. */
function drawSeg(list, all, hits) {
  const seg = $(`${list}-seg`);
  seg.hidden = !matched;
  for (const b of seg.querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.show === lists[list]));
    b.querySelector('[data-n]').textContent = String(b.dataset.show === 'all' ? all : hits);
  }
}

// ======================================================================= which one
const u = new URLSearchParams(location.search).get('u');
if (u === null) hub();
else profilePage(u.trim());
