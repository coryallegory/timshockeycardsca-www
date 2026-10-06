/* The header's account control on every page (loaded only when the site is built with API_URL; docs/DATABASE-AUTH-PLAN.md,
   Account UI). Signed out: the Sign in pill, linking to /account?next=<this page>. Signed in: a round button with the
   email's first letter, opening a small menu (native `popover`: Escape and outside clicks close it, and focus goes back
   to the button) with the email, "N of 234 collected · M extra copies" (the set's cards only: set.js), Account settings
   and Sign out (the Collection tab is the way to the collection). Also the tab row's safety net: on a screen too narrow
   for the tabs (or with large text), the row scrolls sideways and fades the edge that hides a tab.

   No request is made for a visitor who has never signed in on this browser: only with account.js's localStorage hint
   does the page ask the API who is signed in, once (`ready`, which page scripts share instead of asking again). The
   collection is fetched at most once per page (`collection()`), by the page (the Checklist, the Collection dashboard)
   or else when the menu first opens, and shared; a page that edits it gives the menu its live counts (countWith). All
   API calls go through account.js.

   For page scripts: `ready` (who is signed in, from that one check), `signedIn(email)` / `signedOut()` to update the
   header after the page signs in or out, `collection()` (the set's cards, fetched once), `countWith(fn)`,
   `collectionCounts()` (the menu's counts) and `onSignOut(fn)` (the menu's Sign out succeeded). */
import * as account from './account.js?v=d1788456b3';
import { signInHref } from './next.js?v=d1788456b3';
import { extraCopies, SET_TOTAL, setOnly, tally } from './set.js?v=d1788456b3';

const MSG_MS = 8000;

const $ = (id) => document.getElementById(id);
const box = $('acct');
const signInLink = $('acct-signin');
const button = $('acct-button');
const menu = $('acct-menu');
const emailShown = $('acct-email');
const countShown = $('acct-count');
const signOutButton = $('acct-signout');
const error = $('acct-error');
const status = $('acct-status');

// The Sign in pill returns to this page (on /account itself, it keeps the page's own ?next=; on /trading, the profile
// in ?u=).
signInLink.href = location.pathname === '/account'
  ? location.pathname + location.search
  : signInHref(location.pathname + (location.pathname === '/trading' ? location.search : ''));

let user = null; // the signed-in email, or null
let counter = null; // the page's live counts, () => ({ collected, extras }), when it has the collection
let fetched = null; // the set's cards from GET /collection (a promise of a Map), fetched once
const signOutHandlers = [];

/** "Signed out." for screen readers, since the control under focus changes. */
let statusTimer;
function announce(text) {
  clearTimeout(statusTimer);
  status.textContent = text;
  statusTimer = setTimeout(() => { status.textContent = ''; }, MSG_MS);
}
function showError(text) {
  error.textContent = text;
  error.hidden = !text;
}

/** Shows the pill (null) or the initial button for `email`; doesn't touch the hint. */
function display(email) {
  user = email;
  if (!email && menu.matches(':popover-open')) menu.hidePopover();
  signInLink.hidden = Boolean(email);
  button.hidden = !email;
  if (!email) return;
  button.textContent = [...email][0].toLocaleUpperCase();
  button.setAttribute('aria-label', `Account menu, signed in as ${email}`);
  emailShown.textContent = email;
  emailShown.title = email;
}

/** After the page signs in (or a reset signs this browser in): remembers it and shows the account. */
export function signedIn(email) {
  account.rememberSignedIn(true);
  fetched = null;
  display(email);
}
/** After signing out, deleting the account, or a 401: forgets the session and shows the Sign in pill. */
export function signedOut() {
  account.rememberSignedIn(false);
  counter = null;
  fetched = null;
  display(null);
}
/** The page has the collection and keeps it current: the menu counts from `fn` instead of fetching (null: no longer). */
export function countWith(fn) {
  counter = fn;
}
/** `fn()` runs after the menu's Sign out succeeds, for the page to drop what it shows signed in. */
export function onSignOut(fn) {
  signOutHandlers.push(fn);
}

/**
 * Who is signed in, asked once per page: { email } (null when signed out), or { email: null, error } when the API
 * couldn't be reached (the hint stays, so the next page asks again). Never rejects. No request without the hint.
 */
export const ready = account.maybeSignedIn() ? whoIsSignedIn() : Promise.resolve({ email: null });
function whoIsSignedIn() {
  signInLink.hidden = true; // neither control until the API answers, rather than a Sign in pill that may be wrong
  return account.me().then(
    (res) => {
      display(res.email);
      return { email: res.email };
    },
    (err) => {
      if (err.signedOut) signedOut();
      else display(null);
      return { email: null, error: err.signedOut ? undefined : err };
    },
  );
}

// ---------- the menu ----------
/** "42 of 234 collected · 7 extra copies": copies beyond the first, summed (the filter's Extras counts cards instead). */
const countsText = ({ collected, extras }) => `${collected} of ${SET_TOTAL} collected · ${extraCopies(extras)}`;

/**
 * The signed-in user's collection, the set's cards only (card id -> copies; saved ticks for other cards are ignored):
 * one GET /collection, kept for the page's life and shared by the page and the menu. Each call gets its own copy of
 * the Map. Rejects with the ApiError when that fails (the next call asks again; a 401 also signs the header out).
 */
export function collection() {
  if (!fetched) {
    const asked = account.getCollection().then(setOnly);
    fetched = asked;
    asked.catch((err) => {
      if (fetched === asked) fetched = null;
      if (err.signedOut) signedOut();
    });
  }
  return fetched.then((c) => new Map(c));
}

/** The menu's { collected, extras }: the page's live counts when it edits the collection (countWith), otherwise from collection(). */
export function collectionCounts() {
  return counter ? Promise.resolve(counter()) : collection().then(tally);
}

async function showCount() {
  if (!counter && !fetched) countShown.textContent = 'Loading your collection…';
  try {
    countShown.textContent = countsText(await collectionCounts());
  } catch (err) {
    if (!err.signedOut) countShown.textContent = "Couldn't load your collection.";
  }
}

menu.addEventListener('toggle', (e) => {
  const open = e.newState === 'open';
  button.setAttribute('aria-expanded', String(open));
  if (open && user) showCount();
  if (!open) showError('');
});

signOutButton.addEventListener('click', async () => {
  showError('');
  signOutButton.disabled = true;
  try {
    await account.logout();
    signedOut(); // closes the menu
    signInLink.focus();
    announce('Signed out.');
    for (const fn of signOutHandlers) fn();
  } catch (err) {
    showError(`Couldn't sign out. ${account.sentence(err.message)}`);
  } finally {
    signOutButton.disabled = false;
  }
});

// ---------- the tab row's safety net ----------
// The tabs fit down to 320 px (one step smaller below 390 px and another below 360, header-account.css); if they ever don't, the row scrolls
// sideways (never the page), starts scrolled to the current tab, and fades the edge that hides one.
const tabs = document.querySelector('.site-header .tabs');
function fadeTabs() {
  const over = tabs.scrollWidth > tabs.clientWidth + 1;
  tabs.classList.toggle('fade-start', over && tabs.scrollLeft > 2);
  tabs.classList.toggle('fade-end', over && tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 2);
}
const current = tabs.querySelector('[aria-current="page"]');
const hiddenBy = current ? current.getBoundingClientRect().right - tabs.getBoundingClientRect().right : 0;
if (hiddenBy > 0) tabs.scrollLeft = hiddenBy + 12;
tabs.addEventListener('scroll', fadeTabs, { passive: true });
addEventListener('resize', fadeTabs);
document.fonts?.ready.then(fadeTabs);
fadeTabs();
