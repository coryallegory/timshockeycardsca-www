/* Ticking on the Checklist (loaded only when the site is built with API_URL; docs/DATABASE-AUTH-PLAN.md, Checklist UI).
   Signing in happens on /account (the red pill links there and back) and signing out in the header's account menu
   (header-account.js); this file does what being signed in or out means for the Checklist and keeps the collection:
   card id -> copies, the set's cards only (set.js; hits and prizes are reference only and have no checkbox).
   Signed out, the page is the read-only reference with a "Sign in to track your collection" pill. Signed in, <main>
   gets `tracking`, which shows what checklist.ts renders hidden: each set card's checkbox ("have it") and, once ticked,
   its extras badge (extras.js), each set's progress, and the filter bar with the action row's Print (filter.js); the
   pill becomes "Your collection | 42 of 234", linking to the Collection dashboard. The filter starts from the address
   (?show=missing, show.js) and a #<set> in it is scrolled to just below the sticky filter bar and briefly marked: the
   dashboard's links. Every change saves at once, optimistically: a failed save puts the row back with a message.
   All API calls go through account.js.
   No request is made for a visitor who has never signed in on this browser: who is signed in comes from the header's
   one check (`header.ready`), made only with account.js's localStorage hint, and the collection from the header's one
   fetch (`header.collection()`), which the menu shares; the menu then counts from this page (header.countWith). */
import * as account from './account.js?v=d1788456b3';
import * as extras from './extras.js?v=d1788456b3';
import * as filter from './filter.js?v=d1788456b3';
import * as header from './header-account.js?v=d1788456b3';
import { signInHref } from './next.js?v=d1788456b3';
import { SET_TOTAL, tally } from './set.js?v=d1788456b3';
import { showFrom } from './show.js?v=d1788456b3';

const TOAST_MS = 8000;
const MSG_MS = 8000;
/** How long a set the page landed on stays marked (the ring's animation in checklist.css). */
const TARGET_MS = 2600;

const $ = (id) => document.getElementById(id);
const main = document.querySelector('main.checklist');
const msg = $('account-msg');
const pill = $('coll-link');
const pillLabel = $('coll-link-label');
const pillCount = $('coll-link-count');
const rows = [...main.querySelectorAll('.cards li[data-card-id]')];
/** Each set's "12 / 18" and each group's "71 of 120", with the rows they count. */
const tallies = [...main.querySelectorAll('[data-progress]')].map((el) => ({
  el,
  rows: [...el.closest('.subset, .group').querySelectorAll('.cards li[data-card-id]')],
  total: Number(el.dataset.total),
}));
/** Card id -> copies (1 to 99) for the set cards the user owns; empty while signed out. */
const owned = new Map();
const countOf = (li) => owned.get(li.dataset.cardId) ?? 0;
let tracking = false;
let counts = { collected: 0, extras: 0 }; // for the header menu and the pill

extras.init({ countOf, change, names });
filter.init({ rows, countOf });
header.onSignOut(() => {
  signedOut();
  say('Signed out.');
});

// ---------- messages ----------
let msgTimer;
/** A short note in the status line under the lede (save failures, a session that ended). */
function say(text, isError = false) {
  clearTimeout(msgTimer);
  msg.textContent = text;
  msg.classList.toggle('is-error', isError);
  if (text) msgTimer = setTimeout(() => say(''), MSG_MS);
}

// ---------- the red pill ----------
/** Signed in: "Your collection", with "42 of 234" once the collection is here, to the dashboard; signed out: sign in, back here. */
function showPill(signedIn) {
  pill.href = signedIn ? '/collection' : signInHref('/checklist');
  pillLabel.textContent = signedIn ? 'Your collection' : 'Sign in to track your collection';
  pillCount.textContent = signedIn && tracking ? `${counts.collected} of ${SET_TOTAL}` : '';
  pillCount.hidden = !pillCount.textContent;
}

// ---------- signed in and out ----------
async function signedIn() {
  showPill(true);
  try {
    const collection = await header.collection();
    owned.clear();
    for (const [id, copies] of collection) owned.set(id, copies);
    track(true);
    header.countWith(() => counts);
    arrive();
  } catch (err) {
    if (err.signedOut) return showPill(false); // the header has signed out
    say(`Couldn't load your collection. ${account.sentence(err.message)} Reload the page to try again.`, true);
  }
}
/** Back to the read-only reference. */
function signedOut() {
  owned.clear();
  track(false);
  header.countWith(null);
}
/** The session is gone mid-visit (expired, or signed out elsewhere): signed out, with a short note. */
function sessionEnded() {
  if (!tracking) return;
  signedOut();
  header.signedOut();
  say('Your session has ended. Sign in again to keep tracking your collection.', true);
}

/** Shows (or hides) the ticking controls, draws every row, applies the filter (the address's when signing in) and the progress. */
function track(on) {
  tracking = on;
  main.classList.toggle('tracking', on);
  if (!on) {
    extras.close(false);
    hideToast();
  }
  for (const li of rows) render(li);
  filter.reset(on ? showFrom(location.search) : 'all');
  progress();
  showPill(on);
}

/** Each set's and group's count, the pill's and the header menu's numbers. */
function progress() {
  counts = tally(owned);
  for (const t of tallies) {
    const n = t.rows.reduce((sum, li) => sum + (countOf(li) > 0 ? 1 : 0), 0);
    const set = t.el.classList.contains('subset-count');
    const done = tracking && set && n === t.total;
    // Signed out a group shows its size, as without accounts; a set's count is hidden (checklist.css).
    t.el.textContent = !tracking ? (set ? '' : `${t.total} cards`) : done ? '✓ Complete' : set ? `${n} / ${t.total}` : `${n} of ${t.total}`;
    t.el.classList.toggle('done', done);
  }
  if (tracking) showPill(true);
}

/** Arriving with #<set> (a dashboard tile): once the filter has changed the layout, the set goes just below the sticky filter bar and its ring glows briefly. */
function arrive() {
  const target = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  if (!target?.matches('.subset, .group')) return;
  requestAnimationFrame(() => {
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
    target.classList.add('is-target');
    setTimeout(() => target.classList.remove('is-target'), TARGET_MS);
  });
}

// ---------- names ----------
/** The card's set ("Sensational Cellys"), from its heading's first text. */
const setName = (li) => li.closest('.subset')?.querySelector('h3')?.firstChild?.textContent ?? '';
/** How the page names a card: `short` "#2 Evan Bouchard" or "SC-2 Erik Karlsson", `full` adds the set for screen readers
    (checklist.ts labels the checkboxes the same way). */
function names(li) {
  const no = li.querySelector('.no')?.textContent ?? '';
  const who = li.querySelector('.who')?.textContent ?? '';
  const set = setName(li);
  const card = [no, who].filter(Boolean).join(' ');
  return { short: [/^\d+$/.test(no) ? `#${no}` : no, who].filter(Boolean).join(' '), set, full: set ? `${card}, ${set}` : card };
}

// ---------- rows ----------
/** Draws a row for its count: the checkbox and, once ticked, the extras badge. */
function render(li) {
  li.querySelector('.own').checked = countOf(li) > 0;
  extras.render(li, countOf(li));
}

/** Sets a card's copies (0 = not owned), redraws it and saves it. */
function change(li, copies) {
  const before = countOf(li);
  if (copies === before) return;
  filter.changed(li); // under a filter, it stays shown (faded) until the filter is chosen again
  apply(li, copies);
  save(li, copies, before);
}
function apply(li, copies) {
  if (copies > 0) owned.set(li.dataset.cardId, copies);
  else owned.delete(li.dataset.cardId);
  render(li);
  filter.refresh();
  progress();
}

document.addEventListener('change', (e) => {
  const box = e.target;
  if (!(box instanceof HTMLInputElement) || !box.matches('.tracking .cards .own')) return;
  const li = box.closest('li');
  const before = countOf(li);
  change(li, box.checked ? 1 : 0);
  if (!box.checked && before > 1) {
    const n = before - 1;
    toast(`Unticked ${names(li).short} and its ${n} extra${n === 1 ? '' : 's'}.`, () => change(li, before));
  }
});

// Saves for one card run in order, so quick changes can't arrive at the API reversed.
const queues = new Map();
function save(li, copies, before) {
  const id = li.dataset.cardId;
  const run = (queues.get(id) ?? Promise.resolve())
    .then(() => (copies > 0 ? account.setCopies(id, copies) : account.setOwned(id, false)))
    .catch((err) => {
      if (err.signedOut) return sessionEnded();
      if (countOf(li) === copies) apply(li, before); // put it back, unless it has been changed again since
      say(`Couldn't save ${names(li).full}. ${account.sentence(err.message)}`, true);
    });
  queues.set(id, run);
  run.then(() => { if (queues.get(id) === run) queues.delete(id); });
}

// ---------- toast with Undo (unticking a card that had extras) ----------
const toastBox = document.createElement('div');
toastBox.className = 'toast';
toastBox.setAttribute('role', 'status');
toastBox.hidden = true;
const toastText = document.createElement('span');
const undoButton = document.createElement('button');
undoButton.type = 'button';
undoButton.className = 'link-button';
undoButton.textContent = 'Undo';
toastBox.append(toastText, undoButton);
document.body.append(toastBox);
let toastTimer;
let undo = null;
function toast(text, onUndo) {
  clearTimeout(toastTimer);
  toastText.textContent = text;
  undo = onUndo;
  toastBox.hidden = false;
  toastTimer = setTimeout(hideToast, TOAST_MS);
}
function hideToast() {
  clearTimeout(toastTimer);
  toastBox.hidden = true;
  undo = null;
}
undoButton.addEventListener('click', () => {
  const fn = undo;
  hideToast();
  fn?.();
});
// Kept while the pointer or keyboard focus is on it, so there's time to reach Undo.
for (const [type, keep] of [['pointerenter', true], ['focusin', true], ['pointerleave', false], ['focusout', false]]) {
  toastBox.addEventListener(type, () => {
    clearTimeout(toastTimer);
    if (!keep && !toastBox.hidden) toastTimer = setTimeout(hideToast, TOAST_MS);
  });
}

// ---------- on load: the header's check (made only if this browser has signed in before) ----------
if (account.maybeSignedIn()) showPill(true); // probably signed in: no "Sign in" flash while the check runs
header.ready.then(({ email, error }) => {
  if (email) return signedIn();
  showPill(false);
  if (error) say(`Couldn't check whether you're signed in. ${account.sentence(error.message)}`, true);
});
