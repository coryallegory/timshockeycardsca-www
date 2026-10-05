/* The Collection page, /collection (built only with API_URL; docs/DATABASE-AUTH-PLAN.md, Collection UI). Signing in
   happens on /account (the pitch's buttons link there and come back) and signing out in the header's account menu
   (header-account.js); this file does what being signed in or out means for the page and keeps the collection: card
   id -> copies. Signed out, the page shows the pitch. Signed in, it shows the progress summary (progress.js), every card
   with its checkbox ("have it") and, once ticked, an extras badge (extras.js), each set's progress, and the filter bar
   with Print (filter.js). Every change saves at once, optimistically: a failed save puts the row back with a message.
   All API calls go through account.js.
   No request is made for a visitor who has never signed in on this browser: who is signed in comes from the header's
   one check (`header.ready`), made only with account.js's localStorage hint. The collection is fetched once here and
   handed to the header's menu for its count (header.countWith), so the menu doesn't fetch it again. */
import * as account from './account.js';
import * as extras from './extras.js';
import * as filter from './filter.js';
import * as header from './header-account.js';
import { drawProgress } from './progress.js';

const TOAST_MS = 8000;
const MSG_MS = 8000;

const $ = (id) => document.getElementById(id);
const out = $('coll-out');
const inside = $('coll-in');
const msg = $('account-msg');
const rows = [...inside.querySelectorAll('.cards li[data-card-id]')];
/** Each set's "4 / 18" and each group's "30 of 120", with the rows they count. */
const tallies = [...inside.querySelectorAll('[data-progress]')].map((el) => ({
  el,
  rows: [...el.closest('.subset, .group').querySelectorAll('.cards li[data-card-id]')],
  total: Number(el.dataset.total),
}));
/** Card id -> copies (1 to 99) for the cards the user owns; empty while signed out. */
const owned = new Map();
const countOf = (li) => owned.get(li.dataset.cardId) ?? 0;
let tracking = false;
let counts = { collected: 0, extras: 0 }; // for the header menu

extras.init({ countOf, change, names });
filter.init({ rows, countOf });
header.onSignOut(() => {
  signedOut();
  say('Signed out.');
});

// ---------- messages ----------
let msgTimer;
/** A short note in the status line under the title (signed out, save failures). */
function say(text, isError = false) {
  clearTimeout(msgTimer);
  msg.textContent = text;
  msg.classList.toggle('is-error', isError);
  if (text) msgTimer = setTimeout(() => say(''), MSG_MS);
}

// ---------- signed in and out ----------
/** Shows the signed-in page ('in'), the pitch ('out'), or neither (null: until the check answers, or on an error). */
function showState(state) {
  out.hidden = state !== 'out';
  inside.hidden = state !== 'in';
}
async function signedIn() {
  try {
    const collection = await account.getCollection();
    owned.clear();
    for (const [id, copies] of collection) owned.set(id, copies);
    track(true);
    showState('in');
    header.countWith(() => counts);
  } catch (err) {
    if (err.signedOut) {
      header.signedOut();
      showState('out');
      return;
    }
    say(`Couldn't load your collection. ${account.sentence(err.message)} Reload the page to try again.`, true);
  }
}
/** Back to the signed-out page: the pitch. */
function signedOut() {
  owned.clear();
  track(false);
  header.countWith(null);
  showState('out');
}
/** The session is gone mid-visit (expired, or signed out elsewhere): signed out, with a short note. */
function sessionEnded() {
  if (!tracking) return;
  signedOut();
  header.signedOut();
  say('Your session has ended. Sign in again to keep tracking your collection.', true);
}

/** Draws every row, the filter and the progress for the collection (signed in), or clears them (signed out). */
function track(on) {
  tracking = on;
  if (!on) {
    extras.close(false);
    hideToast();
  }
  for (const li of rows) render(li);
  filter.reset();
  progress();
}

/** The summary, each set's and group's count, and the header menu's numbers. */
function progress() {
  counts = drawProgress(owned);
  for (const t of tallies) {
    const n = t.rows.reduce((sum, li) => sum + (countOf(li) > 0 ? 1 : 0), 0);
    const set = t.el.classList.contains('subset-count');
    const done = set && n === t.total;
    t.el.textContent = done ? '✓ Complete' : set ? `${n} / ${t.total}` : `${n} of ${t.total}`;
    t.el.classList.toggle('done', done);
  }
}

// ---------- names ----------
/** The card's subset ("Superstar Cards"): hits have no number and players appear in several sets. */
const setName = (li) => li.closest('.subset')?.querySelector('h3')?.firstChild?.textContent ?? '';
/** How the page names a card: `short` "#2 Evan Bouchard" or "SC-2 Erik Karlsson", `full` adds the set for screen readers
    (collection.ts labels the checkboxes the same way). */
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
  if (!(box instanceof HTMLInputElement) || !box.matches('#coll-in .cards .own')) return;
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
if (account.maybeSignedIn()) showState(null); // until the check answers, rather than a pitch that may be wrong
header.ready.then(({ email, error }) => {
  if (email) return signedIn();
  showState('out');
  if (error) say(`Couldn't check whether you're signed in. ${account.sentence(error.message)}`, true);
});
