/* The Track collection button and its popover on the Checklist (docs/DATABASE-AUTH-PLAN.md, Collection UI), loaded by
   collection.js only when the site is built with API_URL. The popover shows one view at a time, each an element with
   data-view: sign in (which switches to create an account), forgot password, its confirmation, signed in, change
   password, and delete account. Switching views labels the dialog with the view's heading and moves focus into it. All API calls go
   through account.js; what signing in and out does to the page (the checkboxes) is collection.js's, through the hooks
   given to init(). */
import * as account from './account.js';

const MSG_MS = 8000;

const $ = (id) => document.getElementById(id);
const button = $('account-button');
const label = $('account-label');
const popover = $('account-popover');
const views = [...popover.querySelectorAll('[data-view]')];
const msg = $('account-msg');
// Sign in / create an account
const loginForm = $('account-form');
const loginTitle = $('account-title');
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
// Signed in
const emailShown = $('account-email-shown');
const signedInStatus = $('signed-in-status');
const logoutButton = $('account-logout');
const changeButton = $('account-change');
const deleteButton = $('account-delete');
// Change password
const changeForm = $('change-form');
const changeError = $('change-error');
const changeCurrent = $('change-current');
const changeNew = $('change-new');
const changeSubmit = $('change-submit');
// Delete account
const deleteForm = $('delete-form');
const deleteError = $('delete-error');
const deletePassword = $('delete-password');
const deleteSubmit = $('delete-submit');

/** Where focus goes when a view opens (its heading when it has no field). */
const FOCUS = { login: email, forgot: forgotEmail, 'signed-in': logoutButton, change: changeCurrent, delete: deletePassword };

let user = null; // the signed-in email, or null
let mode = 'login'; // or 'register'
let view = 'login';
let hooks = { signedIn: async () => {}, signedOut: () => {}, sessionEnded: () => {} };

/**
 * `signedIn(email)` after signing in, `signedOut()` after signing out, `sessionEnded()` when the API says the session
 * is gone (collection.js updates the checkboxes and calls back into showSignedIn, showSignedOut, askToSignInAgain).
 */
export function init(h) {
  hooks = h;
}

export const signedIn = () => user !== null;

// ---------- messages ----------
let msgTimer;
/** A short note in the status line under the buttons (signed in or out, save failures). */
export function say(text, isError = false) {
  clearTimeout(msgTimer);
  msg.textContent = text;
  msg.classList.toggle('is-error', isError);
  if (text) msgTimer = setTimeout(() => say(''), MSG_MS);
}
function showError(box, text) {
  box.textContent = text;
  box.hidden = !text;
}

// ---------- views ----------
const isOpen = () => popover.matches(':popover-open');
const homeView = () => (user ? 'signed-in' : 'login');

/** Shows one view and labels the dialog with its heading; with the popover open, focus moves into the view. */
function showView(name) {
  view = name;
  let heading;
  for (const v of views) {
    v.hidden = v.dataset.view !== name;
    if (!v.hidden) heading = v.querySelector('.popover-title');
  }
  popover.setAttribute('aria-labelledby', heading.id);
  if (isOpen()) (FOCUS[name] ?? heading).focus();
}
for (const back of popover.querySelectorAll('[data-show]')) back.addEventListener('click', () => showView(back.dataset.show));

popover.addEventListener('toggle', (e) => {
  const open = e.newState === 'open';
  button.setAttribute('aria-expanded', String(open));
  if (open) {
    (FOCUS[view] ?? popover.querySelector(`[data-view="${view}"] .popover-title`)).focus();
    return;
  }
  // Closed: next time it opens on the main view, without old messages or half-typed passwords.
  showError(forgotError, '');
  showError(changeError, '');
  showError(deleteError, '');
  signedInStatus.textContent = '';
  changeForm.reset();
  deleteForm.reset();
  showView(homeView());
});
function openPopover() {
  if (isOpen()) return;
  try { popover.showPopover({ source: button }); } catch { popover.showPopover(); }
}
const closePopover = () => isOpen() && popover.hidePopover();

// ---------- sign in and create an account ----------
function setMode(next) {
  mode = next;
  const register = mode === 'register';
  loginTitle.textContent = register ? 'Create an account' : 'Sign in';
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
  showError(loginError, '');
}
modeButton.addEventListener('click', () => {
  setMode(mode === 'login' ? 'register' : 'login');
  email.focus();
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError(loginError, '');
  loginSubmit.disabled = true;
  try {
    const res = await (mode === 'register' ? account.register : account.login)(email.value, password.value);
    loginForm.reset();
    setMode('login');
    closePopover();
    await hooks.signedIn(res.email);
    say('Signed in. Tick the cards you have.');
  } catch (err) {
    showError(loginError, account.sentence(err.message));
  } finally {
    loginSubmit.disabled = false;
  }
});

// ---------- forgot password ----------
forgotButton.addEventListener('click', () => {
  forgotEmail.value = email.value;
  showError(forgotError, '');
  showView('forgot');
});

forgotForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError(forgotError, '');
  forgotSubmit.disabled = true;
  try {
    await account.forgotPassword(forgotEmail.value);
    showView('forgot-sent');
  } catch (err) {
    showError(forgotError, account.sentence(err.message));
  } finally {
    forgotSubmit.disabled = false;
  }
});

// ---------- signed in: sign out, change password ----------
/** The button and popover show the account. */
export function showSignedIn(address) {
  user = address;
  account.rememberSignedIn(true);
  label.textContent = address;
  button.setAttribute('aria-label', `Your collection, signed in as ${address}`);
  emailShown.textContent = address;
  showView('signed-in');
}
/** Back to the Track collection button and the sign-in view. */
export function showSignedOut() {
  user = null;
  account.rememberSignedIn(false);
  label.textContent = 'Track collection';
  button.removeAttribute('aria-label');
  setMode('login');
  showView('login');
}
/** After showSignedOut when the session ended mid-visit: the sign-in popover, saying why. */
export function askToSignInAgain() {
  openPopover();
  showView('login');
  showError(loginError, 'Your session has ended. Sign in again to keep tracking your collection.');
}

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    await account.logout();
    closePopover();
    hooks.signedOut();
    say('Signed out.');
  } catch (err) {
    say(`Couldn't sign out. ${account.sentence(err.message)}`, true);
  } finally {
    logoutButton.disabled = false;
  }
});

changeButton.addEventListener('click', () => {
  changeForm.reset();
  showError(changeError, '');
  signedInStatus.textContent = '';
  showView('change');
});

changeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError(changeError, '');
  changeSubmit.disabled = true;
  try {
    await account.changePassword(changeCurrent.value, changeNew.value);
    changeForm.reset();
    showView('signed-in');
    $('signed-in-title').focus();
    signedInStatus.textContent = 'Password changed. Other browsers and devices have been signed out.';
  } catch (err) {
    if (err.signedOut) hooks.sessionEnded();
    else showError(changeError, account.sentence(err.message));
  } finally {
    changeSubmit.disabled = false;
  }
});

// ---------- delete account ----------
deleteButton.addEventListener('click', () => {
  deleteForm.reset();
  showError(deleteError, '');
  signedInStatus.textContent = '';
  showView('delete');
});

deleteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError(deleteError, '');
  deleteSubmit.disabled = true;
  try {
    await account.deleteAccount(deletePassword.value);
    deleteForm.reset();
    closePopover();
    hooks.signedOut(); // signed-out state: hint cleared, checkboxes removed
    say('Your account has been deleted.');
  } catch (err) {
    if (err.signedOut) hooks.sessionEnded();
    else showError(deleteError, account.sentence(err.message));
  } finally {
    deleteSubmit.disabled = false;
  }
});
