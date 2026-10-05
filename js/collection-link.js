/* The Checklist's Your collection button (loaded only when the site is built with API_URL): it adds the count,
   "42 of 278", when this browser is signed in. Who is signed in comes from the header's one check (header.ready, made
   only with account.js's hint), so a visitor who never signed in makes no request. The count needs the collection: one
   GET /collection, which the header's menu then reuses (header.collectionCounts). If it fails, the button keeps
   working without a count. */
import * as header from './header-account.js?v=2dc98f880f';

const count = document.getElementById('coll-link-count');

/** Signed in with counts { collected }, or no count (null). */
function show(counts) {
  count.textContent = counts ? `${counts.collected} of ${count.dataset.total}` : '';
  count.hidden = !counts;
}

header.ready.then(async ({ email }) => {
  if (!email) return;
  try {
    show(await header.collectionCounts());
  } catch {
    // Signed out meanwhile (the header shows Sign in) or unreachable: the button still leads to the Collection page.
  }
});
header.onSignOut(() => show(null));
