/* The collection filter on the Checklist, signed in (docs/DATABASE-AUTH-PLAN.md, Checklist UI), loaded by ticking.js:
   All / Collected / Missing / Extras (2+ copies), with live counts of the set's cards, and the action row's Print
   button, whose label follows it ("Print checklist", "Print missing (149)", "Print extras (6)") and the printout's
   title. Rows that don't match get the class `is-filtered` (hidden, on screen and in print); a set with none left
   collapses to a one-line note. The chosen filter goes on <main> as data-show, so under Collected / Missing / Extras
   the reference sections (hits and prizes, which aren't tracked) are hidden too (checklist.css), and into the address
   (?show=, show.js), so a reload, Back or a shared link keeps it. It works alongside checklist.js's search, which
   hides rows with the `hidden` attribute: a row shows only if it passes both, and each keeps its own marker so neither
   undoes the other.
   A card changed while a filter is on stays shown, faded (`is-leaving`), until a filter is chosen again, so it doesn't
   vanish under the finger. Printing re-applies the filter, so the printout is exactly the chosen list. */
import { withShow } from './show.js?v=4af6e76bf0';

const TESTS = {
  all: () => true,
  collected: (n) => n > 0,
  missing: (n) => n === 0,
  extras: (n) => n > 1,
};
const NOTES = { collected: 'Showing the cards you have.', missing: 'Showing the cards you still need.', extras: 'Showing the cards you have extras of: your trade binder.' };
/** The printout's title under each filter. */
const TITLES = { collected: 'Your collected cards', missing: 'Your missing cards', extras: 'Your trade binder' };

const $ = (id) => document.getElementById(id);
const main = document.querySelector('main.checklist');
const bar = $('filter-bar');
const buttons = [...bar.querySelectorAll('[data-filter]')];
const numbers = Object.fromEntries([...bar.querySelectorAll('[data-count]')].map((b) => [b.dataset.count, b]));
const note = $('filter-note');
const search = $('q');
const noResults = $('noresults');
const printLabel = $('print-label');
const printTitle = $('print-title');
const setName = main.querySelector('h1').textContent;
const subsets = [...main.querySelectorAll('.subset')].filter((s) => s.querySelector('.cards li[data-card-id]'));
/** Every row the search can show, hits included (they print under All). */
const allRows = [...main.querySelectorAll('.cards li[data-q]')];

let rows = [];
let countOf = () => 0;
let active = 'all';
/** Rows changed under the current filter: shown, faded, until a filter is chosen again. */
const leaving = new Set();

export function init(o) {
  ({ rows, countOf } = o);
}

/** Chooses `name` (signing in: the address's filter; signing out: All). */
export function reset(name = 'all') {
  choose(TESTS[name] ? name : 'all');
}

/** Call before redrawing a row whose count changed. */
export function changed(li) {
  if (active !== 'all') leaving.add(li);
}

function choose(name) {
  active = name;
  leaving.clear();
  main.dataset.show = name;
  for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.filter === name));
  note.replaceChildren();
  if (name !== 'all') {
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'link-button';
    all.textContent = 'Show all';
    all.addEventListener('click', () => {
      choose('all');
      buttons[0].focus();
    });
    note.append(`${NOTES[name]} `, all);
  }
  const address = withShow(location.pathname + location.search + location.hash, name);
  if (address !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', address);
  refresh();
}

/** Counts, row visibility, collapsed sets, "No cards match" and the Print button, from the current counts, filter and search. */
export function refresh() {
  const n = { all: rows.length, collected: 0, missing: 0, extras: 0 };
  const test = TESTS[active];
  let printed = 0; // rows the printout will have: passing the filter and the search
  for (const li of rows) {
    const copies = countOf(li);
    if (copies > 0) n.collected++;
    if (copies > 1) n.extras++;
    const out = !test(copies);
    li.classList.toggle('is-filtered', out && !leaving.has(li));
    li.classList.toggle('is-leaving', out && leaving.has(li));
    if (!out && !li.hidden) printed++;
  }
  n.missing = n.all - n.collected;
  for (const [name, el] of Object.entries(numbers)) el.textContent = String(n[name]);

  const term = search?.value.trim() ?? '';
  // Under All the whole page prints (hits too); under a filter, only the set's matching rows.
  if (active === 'all') printed = allRows.filter((li) => !li.hidden).length;
  noResults.hidden = !term || printed > 0;
  for (const s of subsets) {
    // Rows the search left (checklist.js hides a set with none); is anything left after the filter too?
    const empty = active !== 'all' && !s.querySelector('.cards li:not([hidden]):not(.is-filtered)');
    s.classList.toggle('is-empty', empty);
    let none = s.querySelector('.filter-none');
    if (!empty) {
      none?.remove();
      continue;
    }
    if (!none) {
      none = document.createElement('p');
      none.className = 'filter-none';
      s.querySelector('header').append(none);
    }
    none.textContent = { collected: 'None collected', missing: term ? 'None missing' : 'All collected', extras: 'No extras' }[active];
  }

  // "Print checklist", "Print missing (149)"; while searching, "Print matches (3)" or "Print missing (2)".
  const what = active === 'all' ? (term ? 'matches' : '') : active;
  printLabel.textContent = what ? `Print ${what} (${printed})` : 'Print checklist';
  // "Your missing cards (149) · <set>"; while searching, "… matching “crosby” (2) · <set>".
  const matching = term ? ` matching “${term}”` : '';
  printTitle.textContent = active === 'all'
    ? term ? `Cards${matching} (${printed}) · ${setName}` : setName
    : `${TITLES[active]}${matching} (${printed}) · ${setName}`;
}

for (const b of buttons) b.addEventListener('click', () => choose(b.dataset.filter));
// checklist.js's listener runs first (its script loads before this module), so the search's `hidden` marks are current.
search?.addEventListener('input', () => { if (main.classList.contains('tracking')) refresh(); });

// ---------- printing (checklist.js's Print button opens the dialog): the chosen list, under its own title (also the
// document's, which browsers print and use as the file name) ----------
let pageTitle = document.title;
addEventListener('beforeprint', () => {
  if (!main.classList.contains('tracking')) return;
  if (leaving.size) choose(active); // rows kept faded since the filter was chosen drop out
  pageTitle = document.title;
  document.title = printTitle.textContent;
});
addEventListener('afterprint', () => { document.title = pageTitle; });

// A shadow under the bar once it sticks to the top of the window.
addEventListener('scroll', () => {
  bar.classList.toggle('is-stuck', bar.getBoundingClientRect().top <= 0 && scrollY > 0);
}, { passive: true });
