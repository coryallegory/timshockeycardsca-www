/* The /account page (built only with API_URL; docs/DATABASE-AUTH-PLAN.md, Account UI). Signed out, it shows one view
   at a time (data-view): sign in (which switches to create an account), forgot password and its confirmation; signing
   in goes back to the page in ?next= (next.js allows only paths on this site; otherwise the Checklist). Signed in, it
   shows the account's panels: the email, Change password (opening in place), the collection's count, progress and
   Base / Inserts / Hits split, and Sign out / Delete account. All API calls go through account.js; who is signed in
   comes from the header's one check (header.ready), and the header is told when that changes. */
import * as account from './account.js';
import * as header from './header-account.js';
import { safeNext } from './next.js';

const $ = (id) => document.getElementById(id);
const out = $('acct-out');
const inside = $('acct-in');
const outNote = $('out-note');
const views = [...out.querySelectorAll('[data-view]')];
// Sign in / create an account
const loginForm = $('account-form');
const loginTitle = $('account-title');
const loginNote = $('account-note');
const loginError = $('account-error');
const email = $('account-email');
const password = $('account-password');
const hint = $('account-password-hint');
const loginSubmit = $('account-submit');
const modeButton = $('account-mode');
const forgotButton = $('account-forgot');
// Forgot password
const forgotForm = $('forgot-form');
const forgotError = $('forgot-error');
const forgotEmail = $('forgot-email');
const forgotSubmit = $('forgot-submit');
// Signed in: sign-in details
const changeDone = $('change-done');
const changeOpen = $('change-open');
const changeForm = $('change-form');
const changeError = $('change-error');
const changeCurrent = $('change-current');
const changeNew = $('change-new');
const changeSubmit = $('change-submit');
// Signed in: collection
const collCount = $('coll-count');
const collExtras = $('coll-extras');
const collBar = $('coll-bar');
const collError = $('coll-error');
/** Base / Inserts / Hits: each lists its subsets' card-id prefixes (ids are `2026-27-th-<subset>-...`, permanent). */
const groups = [...document.querySelectorAll('#coll-split [data-group]')].map((el) => ({
  prefixes: el.dataset.prefixes.split(' '),
  shown: el.querySelector('[data-group-count]'),
}));
// Signed in: danger zone
const dangerError = $('danger-error');
const signOutButton = $('signout-button');
const deleteOpen = $('delete-open');
const deleteForm = $('delete-form');
const deleteError = $('delete-error');
const deletePassword = $('delete-password');
const deleteSubmit = $('delete-submit');

/** Where focus goes when a signed-out view opens (its heading when it has no field). */
const FOCUS = { login: email, forgot: forgotEmail };

let mode = 'login'; // or 'register'

/** Fills an error or note box, hiding it when empty. */
function show(box, text) {
  box.textContent = text;
  box.hidden = !text;
}

// ---------- signed out: the views ----------
/** Shows one view; `focus` moves focus into it (not on page load). */
function showView(name, focus = true) {
  for (const v of views) v.hidden = v.dataset.view !== name;
  if (focus) (FOCUS[name] ?? out.querySelector(`[data-view="${name}"] h1`)).focus();
}
for (const back of out.querySelectorAll('[data-show]')) back.addEventListener('click', () => showView(back.dataset.show));

function setMode(next) {
  mode = next;
  const register = mode === 'register';
  loginTitle.textContent = register ? 'Create an account' : 'Sign in';
  loginNote.textContent = register
    ? 'Free. Tick off the cards you have and keep count of your extras, on any device.'
    : 'Sign in to tick off the cards you have. Your collection is saved to your account.';
  loginSubmit.textContent = register ? 'Create account' : 'Sign in';
  modeButton.textContent = register ? 'I already have an account' : 'Create an account';
  password.autocomplete = register ? 'new-password' : 'current-password';
  if (register) {
    password.minLength = 8;
    password.setAttribute('aria-describedby', hint.id);
  } else {
    password.removeAttribute('minlength');
    password.removeAttribute('aria-describedby');
  }
  hint.hidden = !register;
  forgotButton.hidden = register;
  show(loginError, '');
}
modeButton.addEventListener('click', () => {
  setMode(mode === 'login' ? 'register' : 'login');
  email.focus();
});

/** The signed-out page, with an optional note at the top ("Signed out.", "Your account has been deleted."). */
function showSignedOut(text = '', isError = false) {
  inside.hidden = true;
  out.hidden = false;
  closeChange();
  closeDelete();
  setMode('login');
  showView('login', false);
  if (isError) {
    show(outNote, '');
    show(loginError, text);
  } else show(outNote, text);
  if (text) loginTitle.focus();
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  show(loginError, '');
  show(outNote, '');
  loginSubmit.disabled = true;
  try {
    const res = await (mode === 'register' ? account.register : account.login)(email.value, password.value);
    header.signedIn(res.email);
    location.assign(safeNext(new URLSearchParams(location.search).get('next'), location.origin));
  } catch (err) {
    show(loginError, account.sentence(err.message));
    loginSubmit.disabled = false;
  }
});

forgotButton.addEventListener('click', () => {
  forgotEmail.value = email.value;
  show(forgotError, '');
  showView('forgot');
});

forgotForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  show(forgotError, '');
  forgotSubmit.disabled = true;
  try {
    await account.forgotPassword(forgotEmail.value);
    showView('forgot-sent');
  } catch (err) {
    show(forgotError, account.sentence(err.message));
  } finally {
    forgotSubmit.disabled = false;
  }
});

// ---------- signed in ----------
async function showSignedIn(address) {
  out.hidden = true;
  inside.hidden = false;
  $('acct-in-email').textContent = address;
  $('details-email').textContent = address;
  try {
    const collection = await account.getCollection();
    let extras = 0;
    for (const copies of collection.values()) extras += copies - 1;
    collCount.textContent = String(collection.size);
    collExtras.textContent = `${extras} extra ${extras === 1 ? 'copy' : 'copies'}`; // copies beyond the first, summed
    collBar.value = collection.size;
    for (const g of groups) {
      let n = 0;
      for (const id of collection.keys()) if (g.prefixes.some((p) => id.startsWith(p))) n++;
      g.shown.textContent = `${n}/${g.shown.dataset.total}`;
    }
    header.countWith(() => ({ collected: collection.size, extras }));
  } catch (err) {
    if (err.signedOut) sessionEnded();
    else show(collError, `Couldn't load your collection. ${account.sentence(err.message)} Reload the page to try again.`);
  }
}

/** The API says the session is gone (expired, or signed out elsewhere): the sign-in view, saying why. */
function sessionEnded() {
  header.signedOut();
  showSignedOut('Your session has ended. Sign in again.', true);
}

// Change password, opening in place under its button
function openChange() {
  changeForm.reset();
  show(changeError, '');
  show(changeDone, '');
  changeForm.hidden = false;
  changeOpen.hidden = true;
  changeOpen.setAttribute('aria-expanded', 'true');
  changeCurrent.focus();
}
function closeChange() {
  changeForm.reset();
  changeForm.hidden = true;
  changeOpen.hidden = false;
  changeOpen.setAttribute('aria-expanded', 'false');
}
changeOpen.addEventListener('click', openChange);
$('change-cancel').addEventListener('click', () => {
  closeChange();
  changeOpen.focus();
});

changeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  show(changeError, '');
  changeSubmit.disabled = true;
  try {
    await account.changePassword(changeCurrent.value, changeNew.value);
    closeChange();
    changeOpen.focus();
    show(changeDone, 'Password changed. Other browsers and devices have been signed out.');
  } catch (err) {
    if (err.signedOut) sessionEnded();
    else show(changeError, account.sentence(err.message));
  } finally {
    changeSubmit.disabled = false;
  }
});

// Sign out
signOutButton.addEventListener('click', async () => {
  show(dangerError, '');
  signOutButton.disabled = true;
  try {
    await account.logout();
    header.signedOut();
    showSignedOut('Signed out.');
  } catch (err) {
    show(dangerError, `Couldn't sign out. ${account.sentence(err.message)}`);
  } finally {
    signOutButton.disabled = false;
  }
});
header.onSignOut(() => showSignedOut('Signed out.'));

// Delete account, opening in place under its button
function openDelete() {
  deleteForm.reset();
  show(deleteError, '');
  deleteForm.hidden = false;
  deleteOpen.hidden = true;
  deleteOpen.setAttribute('aria-expanded', 'true');
  deletePassword.focus();
}
function closeDelete() {
  deleteForm.reset();
  deleteForm.hidden = true;
  deleteOpen.hidden = false;
  deleteOpen.setAttribute('aria-expanded', 'false');
}
deleteOpen.addEventListener('click', openDelete);
$('delete-cancel').addEventListener('click', () => {
  closeDelete();
  deleteOpen.focus();
});

deleteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  show(deleteError, '');
  deleteSubmit.disabled = true;
  try {
    await account.deleteAccount(deletePassword.value);
    header.signedOut();
    showSignedOut('Your account has been deleted.');
  } catch (err) {
    if (err.signedOut) sessionEnded();
    else show(deleteError, account.sentence(err.message));
  } finally {
    deleteSubmit.disabled = false;
  }
});

// ---------- on load: the header's check (made only if this browser has signed in before) ----------
if (account.maybeSignedIn()) out.hidden = true; // neither until the check answers
header.ready.then(({ email: address, error }) => {
  if (address) return showSignedIn(address);
  showSignedOut();
  if (error) show(loginError, `Couldn't check whether you're signed in. ${account.sentence(error.message)}`);
});
