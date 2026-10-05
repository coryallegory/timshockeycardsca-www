/* "The set" in the browser (docs/DECISIONS.md: the official binder checklist's cards; apps/web/src/cards.ts theSet
   decides it at build time). Only set cards are tracked and counted: a collection's saved ticks for other cards (hits)
   are ignored here, never deleted. The header's account control, on every page with accounts, carries the set's size
   (data-total) and its subsets' card-id prefixes (data-set-prefixes; ids are permanently `2026-27-th-<subset>-...`).
   No API calls. */

const box = document.getElementById('acct');

/** Cards in the set (234). */
export const SET_TOTAL = Number(box.dataset.total);
const PREFIXES = box.dataset.setPrefixes.split(' ').filter(Boolean);

/** Whether a card id is one of the set's. */
export const inSet = (id) => PREFIXES.some((p) => id.startsWith(p));

/** A collection (card id -> copies) with only the set's cards. */
export const setOnly = (collection) => new Map([...collection].filter(([id]) => inSet(id)));

/** { collected, extras } of a set-only collection: cards owned, and copies beyond the first, summed (the trade binder's size). */
export function tally(collection) {
  let extras = 0;
  for (const copies of collection.values()) extras += copies - 1;
  return { collected: collection.size, extras };
}

/** "7 extra copies", "1 extra copy". */
export const extraCopies = (n) => `${n} extra ${n === 1 ? 'copy' : 'copies'}`;
