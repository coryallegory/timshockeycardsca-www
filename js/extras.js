/* The card popover on the Checklist, and each ticked card's extras badge (docs/DATABASE-AUTH-PLAN.md, Checklist UI),
   loaded by ticking.js only when the site is built with API_URL. Extras are copies beyond the first: the trade binder.
   A set card's name, number or badge opens the popover (native `popover`: Escape and outside clicks close it): the card's
   photo (set only when it opens, so nothing is fetched for a card nobody looks at), then, signed in and ticked, the
   extras counter with large − / + buttons; signed in and not ticked, "Mark as collected"; signed out, a sign-in line.
   A ticked card with no extras shows a faint "+" badge, one with extras a solid "+N". ticking.js owns the counts and
   the saves: init() gives this file `countOf(li)`, `change(li, copies)`, `names(li)`, `photoOf(li)`, `isTracking()` and
   `signInHref()`, and ticking.js calls render() after every change. */

import { MAX_COPIES } from './rules.js?v=594b093624';
/**
 * A tap on the open card's trigger should close the panel, but light dismiss has already closed it on pointerdown by the
 * time the click arrives: a click on that row's trigger this soon after a pointer light dismiss doesn't reopen it.
 */
const REOPEN_MS = 400;
/** What opens a row's popover (the checkbox's tap area is not one). */
const TRIGGERS = '.xbadge, .no, .who';

const $ = (id) => document.getElementById(id);
const pop = $('extras-popover');
const cardTitle = $('extras-card');
const setTitle = $('extras-set');
const pic = $('card-pic');
const img = $('card-img');
const ownedRow = $('extras-owned');
const unownedRow = $('extras-unowned');
const outRow = $('extras-out');
const ownButton = $('extras-own');
const signIn = $('extras-signin');
const less = $('extras-less');
const more = $('extras-more');
const count = $('extras-count');
const total = $('extras-total');
const done = $('extras-done');

let hooks = {
  countOf: () => 0,
  change: () => {},
  names: () => ({ short: '', set: '', full: '' }),
  photoOf: () => null,
  isTracking: () => false,
  signInHref: () => '/account',
};
let openRow = null; // the row whose panel is open
let openTrigger = null; // what opened it (the name button, a number or name, or the badge)
let lastClosed = { row: null, at: 0 }; // the last pointer light dismiss
let lastPress = { target: null, at: 0 };
let failedPhoto = ''; // an address that failed to load: not shown again
document.addEventListener('pointerdown', (e) => { lastPress = { target: e.target, at: performance.now() }; }, true);

export function init(h) {
  hooks = { ...hooks, ...h };
}

const badgeOf = (li) => li?.querySelector('.xbadge');
const nameButtonOf = (li) => li?.querySelector('.card-open');

/** Adds, updates or (at 0 copies) removes a row's badge; refreshes the panel if it is open on that row. */
export function render(li, copies) {
  let badge = badgeOf(li);
  if (!copies) {
    badge?.remove();
    if (openRow === li) draw();
    return;
  }
  if (!badge) {
    badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'xbadge';
    badge.setAttribute('aria-haspopup', 'dialog');
    badge.setAttribute('aria-controls', pop.id);
    badge.setAttribute('aria-expanded', openRow === li ? 'true' : 'false');
    li.append(badge);
  }
  const x = copies - 1;
  badge.classList.toggle('has', x > 0);
  badge.classList.toggle('is-open', openRow === li);
  if (x) badge.textContent = `+${x}`;
  else badge.replaceChildren(plusIcon());
  badge.setAttribute('aria-label', `Extras for ${hooks.names(li).full}: ${x}`);
  badge.title = x ? `${x} extra${x === 1 ? '' : 's'}` : 'Add extras';
  if (openRow === li) draw();
}

function plusIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M8 3v10M3 8h10');
  svg.append(path);
  return svg;
}

/** The card's photo, if it has one and it has not failed to load; the address is set only now, when the panel opens. */
function showPhoto(li) {
  const photo = hooks.photoOf(li);
  if (!photo || photo.url === failedPhoto) {
    pic.hidden = true;
    return;
  }
  pic.hidden = false;
  img.alt = photo.alt;
  if (img.getAttribute('src') !== photo.url) img.src = photo.url;
}
img.addEventListener('error', () => {
  failedPhoto = img.getAttribute('src') ?? '';
  pic.hidden = true;
});

/** Fills the panel in for the open row: the extras counter, "Mark as collected" or the sign-in line. */
function draw() {
  const copies = hooks.countOf(openRow);
  const tracking = hooks.isTracking();
  ownedRow.hidden = !(tracking && copies > 0);
  unownedRow.hidden = !(tracking && copies === 0);
  outRow.hidden = tracking;
  if (ownedRow.hidden) {
    total.textContent = '';
    return;
  }
  const x = copies - 1;
  if (count.value !== String(x)) count.value = String(x);
  less.disabled = x <= 0;
  more.disabled = copies >= MAX_COPIES;
  total.textContent = `${copies} ${copies === 1 ? 'copy' : 'copies'} in all`;
  // A button that just became disabled can't keep focus: move to the other one.
  if (document.activeElement === document.body || (document.activeElement?.disabled && pop.contains(document.activeElement))) {
    (less.disabled ? more : less).focus();
  }
}

/** Focus goes to the first thing you can do: the extras "+", "Mark as collected", or Done when signed out. */
function focusFirst() {
  if (!ownedRow.hidden) more.focus();
  else if (!unownedRow.hidden) ownButton.focus();
  else done.focus();
}

function setOpenState(li, on) {
  li.classList.toggle('is-open', on);
  for (const el of li.querySelectorAll('.xbadge, .card-open')) {
    el.classList.toggle('is-open', on);
    el.setAttribute('aria-expanded', String(on));
  }
}

function open(li, trigger) {
  openRow = li;
  openTrigger = trigger;
  const { short, set } = hooks.names(li);
  cardTitle.textContent = short;
  setTitle.textContent = set ? `, ${set}` : '';
  signIn.href = hooks.signInHref();
  showPhoto(li);
  draw();
  setOpenState(li, true);
  try { pop.showPopover({ source: trigger }); } catch { pop.showPopover(); }
  focusFirst();
}

/** Closes the panel; focus goes back to the name button unless something else took it (`refocus` false: never). */
export function close(refocus = true) {
  refocusOnClose = refocus;
  closingHere = true;
  if (pop.matches(':popover-open')) pop.hidePopover(); // beforetoggle runs closed() at once
  else closed();
}
let refocusOnClose = true;
let closingHere = false; // closed by close(), not by light dismiss or Escape
/** Bookkeeping for every way the panel closes: Done, Escape, an outside click, a trigger, signing out. */
function closed() {
  const refocus = refocusOnClose;
  const li = openRow;
  const pressedTrigger = li && lastPress.target instanceof Element && li.contains(lastPress.target) && lastPress.target.closest(TRIGGERS);
  const lightDismiss = !closingHere && !!pressedTrigger && performance.now() - lastPress.at < REOPEN_MS;
  const trigger = openTrigger;
  refocusOnClose = true;
  closingHere = false;
  if (!li) return;
  lastClosed = lightDismiss ? { row: li, at: performance.now() } : { row: null, at: 0 };
  openRow = null;
  openTrigger = null;
  setOpenState(li, false);
  const focused = document.activeElement;
  // The name button or the badge take focus back; a click on a plain number or name has nothing to refocus but the button.
  const target = trigger?.isConnected && trigger.matches('button') ? trigger : (nameButtonOf(li) ?? badgeOf(li));
  if (refocus && target && (!focused || focused === document.body || pop.contains(focused))) target.focus({ preventScroll: true });
}
// beforetoggle (unlike toggle) fires synchronously, so a panel reopened for another card at once isn't closed again.
pop.addEventListener('beforetoggle', (e) => { if (e.newState === 'closed') closed(); });

document.addEventListener('click', (e) => {
  const hit = e.target instanceof Element ? e.target.closest('.cards li[data-card-id] :is(.xbadge, .no, .who)') : null;
  if (!hit) return;
  const li = hit.closest('li');
  if (openRow === li) return close();
  const justClosed = lastClosed.row === li && performance.now() - lastClosed.at < REOPEN_MS;
  if (openRow) close(false);
  if (!justClosed) open(li, hit);
});

function step(by) {
  if (!openRow) return;
  const copies = Math.min(MAX_COPIES, Math.max(1, hooks.countOf(openRow) + by));
  hooks.change(openRow, copies);
}
less.addEventListener('click', () => step(-1));
more.addEventListener('click', () => step(1));
ownButton.addEventListener('click', () => {
  if (!openRow) return;
  hooks.change(openRow, 1); // ticking.js redraws the row and calls render(), which redraws this panel
  if (!ownedRow.hidden) more.focus();
});
done.addEventListener('click', () => close());
