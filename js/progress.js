/* The Collection dashboard's progress panel, loaded by collection.js (markup: apps/web/src/pages/collection.ts,
   progressSummary): "N of 234 collected", "M extra copies" (copies beyond the first, summed: the trade binder's size),
   the percentage, the progress bar and Base / Inserts / Short prints. Each part lists its subsets' card-id prefixes
   (ids are `2026-27-th-<subset>-...`, permanent), so an owned id is placed without the cards list. No API calls:
   collection.js hands it the collection (the set's cards only, set.js). */
import { extraCopies, tally } from './set.js?v=4af6e76bf0';

const $ = (id) => document.getElementById(id);
const count = $('coll-count');
const extrasShown = $('coll-extras');
const percent = $('coll-pct');
const bar = $('coll-bar');
const parts = [...document.querySelectorAll('#coll-split [data-part]')].map((el) => ({
  prefixes: el.dataset.prefixes.split(' '),
  shown: el.querySelector('[data-part-count]'),
}));

/** Draws the panel for `collection` (card id -> copies). */
export function drawProgress(collection) {
  const { collected, extras } = tally(collection);
  count.textContent = String(collected);
  extrasShown.textContent = extraCopies(extras);
  bar.value = collected;
  // Rounded down, so 100% means every card.
  percent.textContent = `${Math.floor((collected / bar.max) * 100)}%`;
  for (const p of parts) {
    let n = 0;
    for (const id of collection.keys()) if (p.prefixes.some((pre) => id.startsWith(pre))) n++;
    p.shown.textContent = `${n}/${p.shown.dataset.total}`;
  }
}
