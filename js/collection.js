/* Collection tracking on the Checklist, loaded only when the site is built with API_URL (docs/DATABASE-AUTH-PLAN.md,
   Collection UI). account-panel.js runs the Track collection button and its popover (sign in, create an account, reset
   or change the password); this file does what signing in and out means for the page: signed in, every card row gets
   a checkbox that saves at once, optimistically, putting the box back with a message if the save fails. All API calls
   go through account.js.
   No request is made for a visitor who has never signed in on this browser: the page only asks the API who is signed in
   when account.js's non-secret localStorage hint says a sign-in happened here before. */
import * as account from './account.js';
import * as panel from './account-panel.js';

const rows = [...document.querySelectorAll('.cards li[data-card-id]')];

panel.init({ signedIn, signedOut, sessionEnded });

// ---------- signed in and out ----------
async function signedIn(address) {
  panel.showSignedIn(address);
  try {
    addCheckboxes(new Set(await account.getCollection()));
  } catch (err) {
    if (err.signedOut) return sessionEnded();
    panel.say(`Couldn't load your collection. ${account.sentence(err.message)} Reload the page to try again.`, true);
  }
}
function signedOut() {
  panel.showSignedOut();
  for (const box of document.querySelectorAll('.cards .own')) box.remove();
}
/** The session is gone mid-visit (expired, or signed out elsewhere): back to signed out, with the sign-in popover. */
function sessionEnded() {
  if (!panel.signedIn()) return;
  signedOut();
  panel.askToSignInAgain();
}

// ---------- checkboxes ----------
/** "SC-2 Evan Bouchard, Superstar Cards" for screen readers (hits have no number; players appear in several sets). */
function cardName(li) {
  const set = li.closest('.subset')?.querySelector('h3')?.firstChild?.textContent;
  const card = [li.querySelector('.no')?.textContent, li.querySelector('.who')?.textContent].filter(Boolean).join(' ');
  return set ? `${card}, ${set}` : card;
}

function addCheckboxes(owned) {
  for (const li of rows) {
    if (li.querySelector('.own')) continue;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'own';
    box.checked = owned.has(li.dataset.cardId);
    box.setAttribute('aria-label', cardName(li));
    li.prepend(box);
  }
}

// Saves for one card run in order, so a quick check-uncheck can't arrive at the API reversed.
const queues = new Map();
document.addEventListener('change', (e) => {
  const box = e.target;
  if (!(box instanceof HTMLInputElement) || !box.matches('.cards .own')) return;
  const id = box.closest('li').dataset.cardId;
  const owned = box.checked;
  const run = (queues.get(id) ?? Promise.resolve())
    .then(() => account.setOwned(id, owned))
    .catch((err) => {
      if (err.signedOut) return sessionEnded();
      if (box.checked === owned) box.checked = !owned; // put it back, unless it has been changed again since
      panel.say(`Couldn't save ${box.getAttribute('aria-label')}. ${account.sentence(err.message)}`, true);
    });
  queues.set(id, run);
  run.then(() => { if (queues.get(id) === run) queues.delete(id); });
});

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
