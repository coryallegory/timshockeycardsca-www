/* The rules the browser and the API share, written once. The API's checks (apps/api/src/trader.ts, store/store.ts) are
   the authority; the browser uses the same rules to say what's wrong before saving, and to build links only from
   usernames that pass. This file lives here because the browser can only load files from public/js; the API imports
   it from here and esbuild bundles it into the Lambda, so it must stay plain JavaScript with no imports, no DOM
   access and no other dependencies. Error wording is not shared: each side words its own messages. */

/** A trade id: 3 to 8 letters or digits (whether it is free, reserved or allowed is the API's to say). */
export const TRADE_ID = /^[A-Za-z0-9]{3,8}$/;

/** A forward sortation area: a Canadian postal code's first 3 characters. */
export const FSA = /^[ABCEGHJ-NPRSTVXY][0-9][ABCEGHJ-NPRSTV-Z]$/;

/** The most copies of one card a collection records (extras are the copies beyond the first). */
export const MAX_COPIES = 99;

/**
 * Contact usernames per platform. None allows `:` or `/`, so no URL fits. Facebook's is one person's profile (owner,
 * 2026-10-16: so a trader can add them as a friend and message them): the name or number after `facebook.com/` on a
 * personal profile, one path segment of letters, digits and dots, 5 to 50 long, and not the address itself or one of
 * Facebook's own sections (groups, pages, events...). A page's name looks like a person's, so a page can't be told
 * apart by its shape; the form says "your own profile".
 */
export const USERNAME = {
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  x: /^[A-Za-z0-9_]{1,15}$/,
  reddit: /^[A-Za-z0-9_-]{3,20}$/,
  facebook: /^(?!(?:groups|pages|events|marketplace|watch|gaming|people|public|share|sharer\.php|login|policies|stories|reels?|hashtag|search|settings|messages|friends|notifications|bookmarks|business|plugins|dialog|photos?|permalink\.php|story\.php|profile\.php|home\.php)$)(?!.*\.\.)(?!.*facebook\.com)[A-Za-z0-9.]{5,50}$/i,
};

/**
 * A username with one leading "@" dropped (people type it; the caller trims first).
 * @param {string} s
 * @returns {string}
 */
export const withoutAt = (s) => s.replace(/^@/, '');
