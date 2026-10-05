/* The Checklist's link to the Collection page (loaded only when the site is built with API_URL): "Track your
   collection" as rendered, or "Your collection 42 of 278" when this browser is signed in. Who is signed in comes from
   the header's one check (header.ready, made only with account.js's hint), so a visitor who never signed in makes no
   request. The count needs the collection: one GET /collection, which the header's menu then reuses
   (header.collectionCounts). If it fails, the link keeps working without a count. */
import * as header from './header-account.js';

const $ = (id) => document.getElementById(id);
const text = $('track-text');
const count = $('track-count');

/** Signed in with counts { collected }, or back to the signed-out wording (null). */
function show(counts) {
  text.textContent = counts ? 'Your collection' : 'Track your collection';
  count.textContent = counts ? `${counts.collected} of ${count.dataset.total}` : '';
  count.hidden = !counts;
}

header.ready.then(async ({ email }) => {
  if (!email) return;
  try {
    show(await header.collectionCounts());
  } catch {
    // Signed out meanwhile (the header shows Sign in) or unreachable: the link still leads to the Collection page.
  }
});
header.onSignOut(() => show(null));
