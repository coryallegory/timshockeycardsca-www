/* Collection tracking on the Checklist, loaded only when the site is built with API_URL (docs/DATABASE-AUTH-PLAN.md,
   Collection UI). Signing in happens on /account (the prompt at the top links there and comes back) and signing out in
   the header's account menu (header-account.js); this file does what being signed in or out means for the page and
   keeps the collection: card id -> copies. Signed out, the page shows the sign-in prompt. Signed in, every card row gets
   a checkbox ("have it") and, once ticked, an extras badge (extras.js); the filter bar (filter.js) shows All / Collected
   / Missing / Extras. Every change saves at once, optimistically: a failed save puts the row back with a message. All
   API calls go through account.js.
   No request is made for a visitor who has never signed in on this browser: who is signed in comes from the header's
   one check (`header.ready`), made only with account.js's localStorage hint. The collection is fetched once here and
   handed to the header's menu for its count (header.countWith), so the menu doesn't fetch it again. */
import * as account from './account.js';
import * as extras from './extras.js';
import * as filter from './filter.js';
import * as header from './header-account.js';

const TOAST_MS = 8000;
const MSG_MS = 8000;

const page = document.querySelector('main.checklist');
const prompt = document.getElementById('signin-prompt');
const msg = document.getElementById('account-msg');
const rows = [...document.querySelectorAll('.cards li[data-card-id]')];
/** Card id -> copies (1 to 99) for the cards the user owns; empty while signed out. */
const owned = new Map();
const countOf = (li) => owned.get(li.dataset.cardId) ?? 0;
let tracking = false;

extras.init({ countOf, change, names });
filter.init({ rows, countOf });
header.onSignOut(() => {
  signedOut();
  say('Signed out.');
});

// ---------- messages ----------
let msgTimer;
/** A short note in the status line under the prompt and print buttons (signed out, save failures). */
function say(text, isError = false) {
  clearTimeout(msgTimer);
  msg.textContent = text;
  msg.classList.toggle('is-error', isError);
  if (text) msgTimer = setTimeout(() => say(''), MSG_MS);
}

// ---------- signed in and out ----------
/** The menu's "N of 278 collected · M extra copies", from the cards on this page. */
function counts() {
  let extras = 0;
  for (const copies of owned.values()) extras += copies - 1;
  return { collected: owned.size, extras };
}
async function signedIn() {
  prompt.hidden = true;
  try {
    const collection = await account.getCollection();
    owned.clear();
    for (const [id, copies] of collection) owned.set(id, copies);
    track(true);
    header.countWith(counts);
  } catch (err) {
    if (err.signedOut) {
      header.signedOut();
      prompt.hidden = false;
      return;
    }
    say(`Couldn't load your collection. ${account.sentence(err.message)} Reload the page to try again.`, true);
  }
}
/** Back to the signed-out page: the prompt, no checkboxes, badges or filter. */
function signedOut() {
  owned.clear();
  track(false);
  header.countWith(null);
  prompt.hidden = false;
}
/** The session is gone mid-visit (expired, or signed out elsewhere): signed out, with the prompt and a short note. */
function sessionEnded() {
  if (!tracking) return;
  signedOut();
  header.signedOut();
  say('Your session has ended. Sign in again to keep tracking your collection.', true);
}

/** Adds (signed in) or removes the row controls and the filter. */
function track(on) {
  tracking = on;
  page.classList.toggle('tracking', on);
  if (!on) {
    extras.close(false);
    hideToast();
  }
  for (const li of rows) {
    if (on) render(li);
    else {
      li.querySelector('.hit')?.remove();
      extras.render(li, 0);
    }
  }
  filter.show(on);
}

// ---------- names ----------
/** The card's subset ("Superstar Cards"): hits have no number and players appear in several sets. */
const setName = (li) => li.closest('.subset')?.querySelector('h3')?.firstChild?.textContent ?? '';
/** How the page names a card: `short` "#2 Evan Bouchard" or "SC-2 Erik Karlsson", `full` adds the set for screen readers. */
function names(li) {
  const no = li.querySelector('.no')?.textContent ?? '';
  const who = li.querySelector('.who')?.textContent ?? '';
  const set = setName(li);
  const card = [no, who].filter(Boolean).join(' ');
  return { short: [/^\d+$/.test(no) ? `#${no}` : no, who].filter(Boolean).join(' '), set, full: set ? `${card}, ${set}` : card };
}

// ---------- rows ----------
/** Draws a row's controls for its count: the checkbox (in a 32px label) and the extras badge once ticked. */
function render(li) {
  let box = li.querySelector('.own');
  if (!box) {
    const hit = document.createElement('label');
    hit.className = 'hit';
    box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'own';
    box.setAttribute('aria-label', names(li).full);
    hit.append(box);
    li.prepend(hit);
  }
  box.checked = countOf(li) > 0;
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
}

document.addEventListener('change', (e) => {
  const box = e.target;
  if (!(box instanceof HTMLInputElement) || !box.matches('.cards .own')) return;
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
if (account.maybeSignedIn()) prompt.hidden = true; // until the check answers, rather than a prompt that may be wrong
header.ready.then(({ email, error }) => {
  if (email) return signedIn();
  prompt.hidden = false;
  if (error) say(`Couldn't check whether you're signed in. ${account.sentence(error.message)}`, true);
});
