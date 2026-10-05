/* The extras badge on each ticked card and the small panel it opens, on the Checklist signed in
   (docs/DATABASE-AUTH-PLAN.md, Checklist UI), loaded by ticking.js only when the site is built with API_URL. Extras are
   copies beyond the first: the trade binder.
   A ticked card with none shows a faint "+" badge, one with extras a solid "+N"; the badge opens the panel (native
   `popover`: Escape and outside clicks close it) with large − / + buttons. ticking.js owns the counts and the saves:
   init() gives this file `countOf(li)`, `change(li, copies)` and `names(li)`, and ticking.js calls render() after
   every change. */

const MAX_COPIES = 99;
/**
 * A tap on the open card's badge should close the panel, but light dismiss has already closed it on pointerdown by the
 * time the click arrives: a click on that badge this soon after a pointer light dismiss doesn't reopen it.
 */
const REOPEN_MS = 400;

const $ = (id) => document.getElementById(id);
const pop = $('extras-popover');
const cardTitle = $('extras-card');
const setTitle = $('extras-set');
const less = $('extras-less');
const more = $('extras-more');
const count = $('extras-count');
const total = $('extras-total');
const done = $('extras-done');

let hooks = { countOf: () => 0, change: () => {}, names: () => ({ short: '', set: '', full: '' }) };
let openRow = null; // the row whose panel is open
let lastClosed = { row: null, at: 0 }; // the last pointer light dismiss
let lastPress = { target: null, at: 0 };
document.addEventListener('pointerdown', (e) => { lastPress = { target: e.target, at: performance.now() }; }, true);

export function init(h) {
  hooks = h;
}

const badgeOf = (li) => li?.querySelector('.xbadge');

/** Adds, updates or (at 0 copies) removes a row's badge; refreshes the panel if it is open on that row. */
export function render(li, copies) {
  let badge = badgeOf(li);
  if (!copies) {
    if (openRow === li) close(false);
    badge?.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'xbadge';
    badge.setAttribute('aria-haspopup', 'dialog');
    badge.setAttribute('aria-controls', pop.id);
    badge.setAttribute('aria-expanded', 'false');
    li.append(badge);
  }
  const x = copies - 1;
  badge.classList.toggle('has', x > 0);
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

/** Fills the panel in for the open row's count. */
function draw() {
  const copies = hooks.countOf(openRow);
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

function open(li) {
  const badge = badgeOf(li);
  openRow = li;
  const { short, set } = hooks.names(li);
  cardTitle.textContent = short;
  setTitle.textContent = set ? `, ${set}` : '';
  draw();
  badge.classList.add('is-open');
  badge.setAttribute('aria-expanded', 'true');
  try { pop.showPopover({ source: badge }); } catch { pop.showPopover(); }
  more.focus();
}

/** Closes the panel; focus goes back to the badge unless something else took it (`refocus` false: never). */
export function close(refocus = true) {
  refocusOnClose = refocus;
  closingHere = true;
  if (pop.matches(':popover-open')) pop.hidePopover(); // beforetoggle runs closed() at once
  else closed();
}
let refocusOnClose = true;
let closingHere = false; // closed by close(), not by light dismiss or Escape
/** Bookkeeping for every way the panel closes: Done, Escape, an outside click, a badge, signing out. */
function closed() {
  const refocus = refocusOnClose;
  const pressedBadge = lastPress.target instanceof Node && badgeOf(openRow)?.contains(lastPress.target);
  const lightDismiss = !closingHere && pressedBadge && performance.now() - lastPress.at < REOPEN_MS;
  refocusOnClose = true;
  closingHere = false;
  if (!openRow) return;
  const badge = badgeOf(openRow);
  lastClosed = lightDismiss ? { row: openRow, at: performance.now() } : { row: null, at: 0 };
  openRow = null;
  if (!badge) return;
  badge.classList.remove('is-open');
  badge.setAttribute('aria-expanded', 'false');
  const focused = document.activeElement;
  if (refocus && (!focused || focused === document.body || pop.contains(focused))) badge.focus({ preventScroll: true });
}
// beforetoggle (unlike toggle) fires synchronously, so a panel reopened for another card at once isn't closed again.
pop.addEventListener('beforetoggle', (e) => { if (e.newState === 'closed') closed(); });

document.addEventListener('click', (e) => {
  const badge = e.target instanceof Element && e.target.closest('.cards .xbadge');
  if (!badge) return;
  const li = badge.closest('li');
  if (openRow === li) return close();
  const justClosed = lastClosed.row === li && performance.now() - lastClosed.at < REOPEN_MS;
  if (openRow) close(false);
  if (!justClosed) open(li);
});

function step(by) {
  if (!openRow) return;
  const copies = Math.min(MAX_COPIES, Math.max(1, hooks.countOf(openRow) + by));
  hooks.change(openRow, copies);
}
less.addEventListener('click', () => step(-1));
more.addEventListener('click', () => step(1));
done.addEventListener('click', () => close());
