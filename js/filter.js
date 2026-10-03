/* The collection filter on the Checklist (docs/DATABASE-AUTH-PLAN.md, Collection UI), loaded by collection.js only when
   the site is built with API_URL and shown only while signed in: All / Collected / Missing / Extras (2+ copies), with
   live counts. Rows that don't match get the class `is-filtered` (hidden, on screen and in print); a subset with none
   left collapses to a one-line note. It works alongside checklist.js's search, which hides rows with the `hidden`
   attribute: a row shows only if it passes both, and each keeps its own marker so neither undoes the other.
   A card changed while a filter is on stays shown, faded (`is-leaving`), until a filter is chosen again, so it doesn't
   vanish under the finger. Printing re-applies the filter, so the printout is exactly the chosen list. */

const TESTS = {
  all: () => true,
  collected: (n) => n > 0,
  missing: (n) => n === 0,
  extras: (n) => n > 1,
};
const NOTES = { collected: 'Showing the cards you have.', missing: 'Showing the cards you still need.', extras: 'Showing the cards you have extras of: your trade binder.' };

const bar = document.getElementById('filter-bar');
const buttons = [...bar.querySelectorAll('[data-filter]')];
const numbers = Object.fromEntries([...bar.querySelectorAll('[data-count]')].map((b) => [b.dataset.count, b]));
const note = document.getElementById('filter-note');
const search = document.getElementById('q');
const subsets = [...document.querySelectorAll('.subset')].filter((s) => s.querySelector('.cards li[data-card-id]'));

let rows = [];
let countOf = () => 0;
let active = 'all';
let on = false;
/** Rows changed under the current filter: shown, faded, until a filter is chosen again. */
const leaving = new Set();

export function init(o) {
  ({ rows, countOf } = o);
}

/** Shows the bar (signed in) or takes the filter off entirely (signed out). */
export function show(visible) {
  on = visible;
  bar.hidden = !visible;
  choose('all');
}

/** Call before redrawing a row whose count changed. */
export function changed(li) {
  if (active !== 'all') leaving.add(li);
}

function choose(name) {
  active = name;
  leaving.clear();
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
  refresh();
}

/** Counts, row visibility and collapsed subsets, from the current counts, filter and search. */
export function refresh() {
  const n = { all: rows.length, collected: 0, missing: 0, extras: 0 };
  const test = TESTS[on ? active : 'all'];
  for (const li of rows) {
    const copies = countOf(li);
    if (copies > 0) n.collected++;
    if (copies > 1) n.extras++;
    const out = !test(copies);
    li.classList.toggle('is-filtered', out && !leaving.has(li));
    li.classList.toggle('is-leaving', out && leaving.has(li));
  }
  n.missing = n.all - n.collected;
  for (const [name, el] of Object.entries(numbers)) el.textContent = String(n[name]);

  const searching = Boolean(search?.value.trim());
  for (const s of subsets) {
    // Rows the search left (checklist.js hides a subset with none); is anything left after the filter too?
    const empty = on && active !== 'all' && !s.querySelector('.cards li:not([hidden]):not(.is-filtered)');
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
    none.textContent = { collected: 'None collected', missing: searching ? 'None missing' : 'All collected', extras: 'No extras' }[active];
  }
}

for (const b of buttons) b.addEventListener('click', () => choose(b.dataset.filter));
// checklist.js's listener runs first (its script loads before this module), so the search's `hidden` marks are current.
search?.addEventListener('input', refresh);
// The printout is the chosen list: rows kept faded since the filter was chosen drop out.
addEventListener('beforeprint', () => { if (on && leaving.size) choose(active); });

// A shadow under the bar once it sticks to the top of the window.
addEventListener('scroll', () => {
  if (on) bar.classList.toggle('is-stuck', bar.getBoundingClientRect().top <= 0 && scrollY > 0);
}, { passive: true });
