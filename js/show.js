/* The Checklist's filter in its address: /checklist?show=all|collected|missing|extras, plus a #<set id> to land on
   (the Collection dashboard's links use both). filter.js writes the filter back with history.replaceState, so a reload,
   Back or a shared link keeps it; All drops it. Only applied when signed in (ticking.js). No DOM access, so tests
   import it. */

export const FILTERS = ['all', 'collected', 'missing', 'extras'];

/** The filter a query string asks for (`?show=missing`); anything else, or none, is All. */
export function showFrom(search) {
  const value = new URLSearchParams(search).get('show');
  return FILTERS.includes(value) ? value : 'all';
}

/** The same address (path, query, hash) with `?show=` set to `filter`, or removed for All; other parameters are kept. */
export function withShow(address, filter) {
  const url = new URL(address, 'https://x.invalid');
  if (filter === 'all' || !FILTERS.includes(filter)) url.searchParams.delete('show');
  else url.searchParams.set('show', filter);
  return url.pathname + url.search + url.hash;
}
