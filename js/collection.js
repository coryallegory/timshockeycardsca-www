/* Collection tracking on the Checklist, loaded only when the site is built with API_URL (docs/DATABASE-AUTH-PLAN.md,
   Collection UI). account-panel.js runs the Track collection button and its popover (sign in, create an account, reset
   or change the password); this file does what signing in and out means for the page and keeps the collection: card id
   -> copies. Signed in, every card row gets a checkbox ("have it") and, once ticked, an extras badge (extras.js); the
   filter bar (filter.js) shows All / Collected / Missing / Extras. Every change saves at once, optimistically: a failed
   save puts the row back with a message. All API calls go through account.js.
   No request is made for a visitor who has never signed in on this browser: the page only asks the API who is signed in
   when account.js's non-secret localStorage hint says a sign-in happened here before. */
import * as account from './account.js';
import * as panel from './account-panel.js';
import * as extras from './extras.js';
import * as filter from './filter.js';

const TOAST_MS = 8000;

const page = document.querySelector('main.checklist');
const rows = [...document.querySelectorAll('.cards li[data-card-id]')];
/** Card id -> copies (1 to 99) for the cards the user owns; empty while signed out. */
const owned = new Map();
const countOf = (li) => owned.get(li.dataset.cardId) ?? 0;

panel.init({ signedIn, signedOut, sessionEnded });
extras.init({ countOf, change, names });
filter.init({ rows, countOf });

// ---------- signed in and out ----------
async function signedIn(address) {
  panel.showSignedIn(address);
  try {
    const collection = await account.getCollection();
    owned.clear();
    for (const [id, copies] of collection) owned.set(id, copies);
    track(true);
  } catch (err) {
    if (err.signedOut) return sessionEnded();
    panel.say(`Couldn't load your collection. ${account.sentence(err.message)} Reload the page to try again.`, true);
  }
}
function signedOut() {
  panel.showSignedOut();
  owned.clear();
  track(false);
}
/** The session is gone mid-visit (expired, or signed out elsewhere): back to signed out, with the sign-in popover. */
function sessionEnded() {
  if (!panel.signedIn()) return;
  signedOut();
  panel.askToSignInAgain();
}

/** Adds (signed in) or removes the row controls and the filter. */
function track(on) {
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
      panel.say(`Couldn't save ${names(li).full}. ${account.sentence(err.message)}`, true);
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

// ---------- on load: only if this browser has signed in before ----------
if (account.maybeSignedIn()) {
  account.me().then(
    (res) => signedIn(res.email),
    (err) => {
      if (err.signedOut) account.rememberSignedIn(false);
      else panel.say(`Couldn't check whether you're signed in. ${account.sentence(err.message)}`, true);
    },
  );
}
