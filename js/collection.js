/* The Collection dashboard, /collection (built only with API_URL; docs/DATABASE-AUTH-PLAN.md, Collection UI). Signed
   out, the page shows the pitch. Signed in, it draws the collection (the set's cards only, set.js) without listing it:
   the progress panel (progress.js), a tile per set (n / total, what's missing, a bar; linking to the set on the
   Checklist, filtered to Missing until the set is complete), the Missing box and the trade binder (cards with extras,
   at most BINDER_ROWS rows, then "and N more" to the Checklist's Extras filter). The missing list and the trade binder
   print straight from here: the page holds a print-only copy of the set's card lists (pages/collection.ts printList),
   in which this file keeps the rows to print, adds the "+N" and gives the printout its title.
   Nothing is edited here, so the menu's count comes from the same fetch. No request is made for a visitor who has
   never signed in on this browser: who is signed in comes from the header's one check (`header.ready`), made only with
   account.js's localStorage hint, and the collection from the header's one fetch (`header.collection()`). */
import * as account from './account.js?v=157411f666';
import * as header from './header-account.js?v=157411f666';
import { drawProgress } from './progress.js?v=157411f666';
import { SET_TOTAL, tally } from './set.js?v=157411f666';

/** The trade binder box lists at most this many cards. */
const BINDER_ROWS = 10;

const $ = (id) => document.getElementById(id);
const out = $('coll-out');
const inside = $('coll-in');
const msg = $('account-msg');
const tiles = [...inside.querySelectorAll('.set-tile[data-prefix]')];
for (const t of tiles) t.dataset.hrefMissing = t.getAttribute('href');
const printList = $('print-list');
const printRows = [...printList.querySelectorAll('li[data-card-id]')];
const printMissing = inside.querySelector('[data-print="missing"]');

/** Card id -> copies, the set's cards only; empty while signed out. */
let owned = new Map();
const countOf = (id) => owned.get(id) ?? 0;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function say(text) {
  msg.textContent = text;
  msg.classList.toggle('is-error', Boolean(text));
}

/** Shows the dashboard ('in'), the pitch ('out'), or neither (null: until the check answers, or on an error). */
function showState(state) {
  out.hidden = state !== 'out';
  inside.hidden = state !== 'in';
}

// ---------- drawing ----------
function draw() {
  drawProgress(owned);
  const { collected, extras } = tally(owned);
  $('dash-lede').textContent = collected ? 'Your progress at a glance.' : 'Nothing ticked yet.';
  drawTiles();
  const missing = SET_TOTAL - collected;
  $('miss-count').textContent = String(missing);
  $('miss-unit').textContent = `${missing === 1 ? 'card' : 'cards'} to go`;
  printMissing.disabled = missing === 0;
  drawBinder(extras);
}

function drawTiles() {
  let complete = 0;
  for (const t of tiles) {
    const total = Number(t.dataset.total);
    let n = 0;
    for (const id of owned.keys()) if (id.startsWith(t.dataset.prefix)) n++;
    const done = total > 0 && n === total;
    if (done) complete++;
    t.querySelector('[data-tile-count]').textContent = `${n} / ${total}`;
    const left = t.querySelector('[data-tile-left]');
    left.textContent = done ? '✓ Complete' : `${total - n} missing`;
    left.classList.toggle('done', done);
    t.querySelector('.tile-bar').value = n;
    t.classList.toggle('is-done', done);
    t.classList.toggle('is-none', n === 0);
    t.href = done ? t.dataset.hrefDone : t.dataset.hrefMissing;
    t.setAttribute('aria-label', `${t.dataset.name}: ${n} of ${total}${done ? ', complete' : `, ${total - n} missing`}. Open on the Checklist`);
  }
  $('sets-done').textContent = `${complete} of ${tiles.length} complete`;
}

/** The card's set ("Sidekicks"), from the print list's heading. */
const setOf = (li) => li.closest('.subset').querySelector('h3').textContent;
/** "+2", the Checklist's badge number, as a non-interactive pill. */
function extrasPill(x) {
  const pill = document.createElement('span');
  pill.className = 'xn';
  pill.textContent = `+${x}`;
  pill.title = plural(x, 'extra copy', 'extra copies');
  return pill;
}

function drawBinder(extras) {
  const cards = printRows.filter((li) => countOf(li.dataset.cardId) > 1);
  $('binder-full').hidden = !cards.length;
  $('binder-empty').hidden = cards.length > 0;
  $('binder-count').textContent = cards.length ? `${plural(cards.length, 'card', 'cards')} · ${plural(extras, 'extra', 'extras')}` : '';
  $('binder-list').replaceChildren(...cards.slice(0, BINDER_ROWS).map((src) => {
    const li = document.createElement('li');
    const no = document.createElement('span');
    no.className = 'no';
    no.textContent = src.querySelector('.no')?.textContent ?? '';
    const who = document.createElement('span');
    who.className = 'who';
    const set = document.createElement('small');
    set.textContent = setOf(src);
    who.append(src.querySelector('.who').textContent, set);
    li.append(no, who, extrasPill(countOf(src.dataset.cardId) - 1));
    return li;
  }));
  const more = cards.length - BINDER_ROWS;
  $('binder-more').hidden = more <= 0;
  $('binder-more-link').textContent = more > 0 ? `and ${more} more on the Checklist` : '';
}

// ---------- printing straight from the dashboard: only the print-only list, under its own title ----------
const LISTS = {
  missing: { keep: (n) => n === 0, title: (k) => `Your missing cards (${k})` },
  binder: { keep: (n) => n > 1, title: (k, extras) => `Your trade binder (${plural(k, 'card', 'cards')}, ${plural(extras, 'extra', 'extras')})` },
};
let pageTitle = document.title;

function preparePrint(kind) {
  const list = LISTS[kind];
  let kept = 0;
  for (const li of printRows) {
    const copies = countOf(li.dataset.cardId);
    const keep = list.keep(copies);
    li.hidden = !keep;
    if (keep) kept++;
    li.querySelector('.xn')?.remove();
    if (keep && kind === 'binder') li.append(extrasPill(copies - 1));
  }
  // Sets and groups with nothing to list are left out.
  for (const s of printList.querySelectorAll('.subset')) {
    const n = s.querySelectorAll('li[data-card-id]:not([hidden])').length;
    s.hidden = n === 0;
    s.querySelector('.subset-count').textContent = String(n);
  }
  for (const g of printList.querySelectorAll('.group')) g.hidden = !g.querySelector('.subset:not([hidden])');
  const title = list.title(kept, tally(owned).extras);
  $('print-head').textContent = title;
  $('print-date').textContent = new Date().toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
  pageTitle = document.title;
  document.title = title; // browsers print it and name the PDF after it
  document.documentElement.classList.add('printing-list');
}
inside.addEventListener('click', (e) => {
  const button = e.target instanceof Element && e.target.closest('[data-print]');
  if (!button) return;
  preparePrint(button.dataset.print);
  print();
});
addEventListener('afterprint', () => {
  if (!document.documentElement.classList.contains('printing-list')) return;
  document.documentElement.classList.remove('printing-list');
  document.title = pageTitle;
});

// ---------- signed in and out ----------
async function signedIn() {
  try {
    owned = await header.collection();
    draw();
    showState('in');
  } catch (err) {
    if (err.signedOut) return showState('out'); // the header has signed out
    say(`Couldn't load your collection. ${account.sentence(err.message)} Reload the page to try again.`);
  }
}
header.onSignOut(() => {
  owned = new Map();
  showState('out');
});

// ---------- on load: the header's check (made only if this browser has signed in before) ----------
if (account.maybeSignedIn()) showState(null); // until the check answers, rather than a pitch that may be wrong
header.ready.then(({ email, error }) => {
  if (email) return signedIn();
  showState('out');
  if (error) say(`Couldn't check whether you're signed in. ${account.sentence(error.message)}`);
});
