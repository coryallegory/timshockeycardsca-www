/* The Collection page's progress panel, loaded by collection.js (markup: apps/web/src/pages/collection.ts,
   progressSummary): "N of 278 collected", "M extra copies" (copies beyond the first, summed: the trade binder's size;
   the filter's Extras counts cards instead), the percentage, the progress bar and Base / Inserts / Hits. Each group
   lists its subsets' card-id prefixes (ids are `2026-27-th-<subset>-...`, permanent), so an owned id is placed without
   the cards list. No API calls: collection.js hands it the collection. */

const $ = (id) => document.getElementById(id);
const count = $('coll-count');
const extrasShown = $('coll-extras');
const percent = $('coll-pct');
const bar = $('coll-bar');
const groups = [...document.querySelectorAll('#coll-split [data-group]')].map((el) => ({
  prefixes: el.dataset.prefixes.split(' '),
  shown: el.querySelector('[data-group-count]'),
}));

/** Draws the summary for `collection` (card id -> copies) and returns the header menu's counts, { collected, extras }. */
export function drawProgress(collection) {
  let extras = 0;
  for (const copies of collection.values()) extras += copies - 1;
  count.textContent = String(collection.size);
  extrasShown.textContent = `${extras} extra ${extras === 1 ? 'copy' : 'copies'}`;
  bar.value = collection.size;
  // Rounded down, so 100% means every card.
  percent.textContent = `${Math.floor((collection.size / bar.max) * 100)}%`;
  for (const g of groups) {
    let n = 0;
    for (const id of collection.keys()) if (g.prefixes.some((p) => id.startsWith(p))) n++;
    g.shown.textContent = `${n}/${g.shown.dataset.total}`;
  }
  return { collected: collection.size, extras };
}
