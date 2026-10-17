/* Trading rules in the browser (docs/TRADING-PLAN.md): the account form says what's wrong before saving, and a profile
   page only ever builds links from usernames that pass the rules. The rules themselves (patterns and limits) are
   shared with the API in rules.js, written once; the wording of the messages is this file's. Also the two-way match, a
   profile grid's cells and the Following list's sort orders. No DOM access and no API calls, so tests import it. */
import { FSA, TRADE_ID, USERNAME, withoutAt } from './rules.js?v=3628ae002f';

export { FSA, TRADE_ID };

/** The contact platforms in display order: the username pattern (the API's), how it is shown, and the link built. */
const seg = encodeURIComponent;
export const CONTACTS = [
  { key: 'instagram', name: 'Instagram', pattern: USERNAME.instagram, show: (u) => `@${u}`, href: (u) => `https://www.instagram.com/${seg(u)}` },
  { key: 'x', name: 'X', pattern: USERNAME.x, show: (u) => `@${u}`, href: (u) => `https://x.com/${seg(u)}` },
  { key: 'reddit', name: 'Reddit', pattern: USERNAME.reddit, show: (u) => `u/${u}`, href: (u) => `https://www.reddit.com/user/${seg(u)}` },
  { key: 'facebook', name: 'Facebook', pattern: USERNAME.facebook, show: (u) => u, href: (u) => `https://www.facebook.com/${u.split('/').map(seg).join('/')}` },
];
const BY_KEY = Object.fromEntries(CONTACTS.map((c) => [c.key, c]));

/**
 * A profile's contact links, built only from usernames that pass the rules (anything else is left out, so a stored
 * value can never become another link): [{ key, name, label, href }] in display order. `contacts` is the API's
 * `{ instagram?, x?, reddit?, facebook? }`.
 */
export function contactLinks(contacts) {
  const links = [];
  for (const c of CONTACTS) {
    const name = contacts?.[c.key];
    if (typeof name !== 'string' || !c.pattern.test(name)) continue;
    links.push({ key: c.key, name: c.name, label: c.show(name), href: c.href(name) });
  }
  return links;
}

/**
 * A contact field as typed, cleaned the way the API cleans it (trimmed, one leading "@" dropped; for Facebook a pasted
 * facebook.com address is cut down to the profile's name or number, and a group or page address is refused):
 * { value } to send (blank = none), or { problem } to show.
 */
export function cleanContact(key, typed) {
  let v = String(typed ?? '').trim();
  if (!v) return { value: '' };
  if (key === 'facebook') {
    const fb = /^(?:https?:\/\/)?(?:(?:www|m|web)\.)?facebook\.com\/?(.*)$/i.exec(v);
    if (fb) v = fb[1].replace(/^\/+/, '');
    else if (/:\/\/|^[^/]+\.(?:com|ca|ly|net|org|io|co|me|gg|app)(?:\/|$)/i.test(v)) return { problem: 'Only facebook.com addresses: enter your own profile name.' };
    if (!v) return { problem: 'Enter your own profile name or number: what comes after facebook.com/ on your profile, like your.name.' };
    // A profile without a name is facebook.com/profile.php?id=<number> or facebook.com/people/<name>/<number>: keep the number.
    const id = /^profile\.php\?(?:[^#]*&)?id=(\d+)/i.exec(v) ?? /^people\/[^/?#]+\/(\d+)/i.exec(v);
    v = id ? id[1] : v.split(/[?#]/)[0].replace(/\/+$/, '');
    if (v.includes('/')) return { problem: "That's a group or page address. Use your own profile's, so people can add you as a friend (facebook.com/your.name)." };
    return BY_KEY.facebook.pattern.test(v) ? { value: v } : { problem: 'Your own profile name or number: letters, digits and dots, 5 to 50, not a group or page.' };
  }
  v = withoutAt(v);
  if (/^u\//i.test(v) && key === 'reddit') return { problem: 'Just the username, without u/ (we add it).' };
  if (/[/:]|\.com\b/i.test(v)) return { problem: 'Just the username, not a link: the site builds the link.' };
  if (BY_KEY[key].pattern.test(v)) return { value: v };
  return {
    problem: {
      instagram: 'Letters, digits, dots and underscores, up to 30.',
      x: 'Letters, digits and underscores, up to 15.',
      reddit: '3 to 20 letters, digits, dashes and underscores.',
    }[key],
  };
}

/** What's wrong with a trade id's shape, or null (taken, reserved and blocked ids are the API's answer). */
export function tradeIdProblem(typed) {
  const id = String(typed ?? '').trim();
  if (!id) return 'Choose a trade id: 3 to 8 letters or digits.';
  if (!/^[A-Za-z0-9]+$/.test(id)) return 'Letters and digits only (no spaces, dots or symbols).';
  if (!TRADE_ID.test(id)) return `3 to 8 letters or digits (this one has ${id.length}).`;
  if (id.toLowerCase() === 'nearby') return 'That trade id is reserved.';
  return null;
}

/** What's wrong with an area, or null. `typed` is upper-cased first, as the API does. */
export function fsaProblem(typed) {
  const f = String(typed ?? '').trim().toUpperCase();
  if (!f) return 'Enter the first 3 characters of your postal code.';
  if (!/^[A-Z][0-9][A-Z]$/.test(f)) return 'Letter, digit, letter, like M5V.';
  // The first letter is checked by asking the shared rule about a code that starts with it and is otherwise fine.
  if (!FSA.test(`${f[0]}0A`)) return `Canadian postal codes don't start with ${f[0]}.`;
  if (!FSA.test(f)) return `${f} isn't a Canadian postal area (no D, F, I, O, Q or U).`;
  return null;
}

/**
 * A collection from the API (`{ cards: [id...], copies: { id: n } }`) as a Map of card id -> copies.
 * @param {{ cards?: string[], copies?: Record<string, number> }} collection
 */
export const collectionMap = ({ cards = [], copies = {} } = {}) => new Map(cards.map((id) => [id, copies[id] ?? 1]));

/**
 * The two-way match between the viewer (`mine`) and a trader (`theirs`), both Maps of card id -> copies, counting only
 * cards for which `inSet(id)` is true: `has` = the trader's extras the viewer doesn't own (has N you need), `needs` =
 * cards the trader doesn't own that the viewer has extras of (needs M you have). Arrays of card ids.
 */
export function match(mine, theirs, inSet) {
  const has = [];
  const needs = [];
  for (const [id, n] of theirs) if (n > 1 && !mine.has(id) && inSet(id)) has.push(id);
  for (const [id, n] of mine) if (n > 1 && !theirs.has(id) && inSet(id)) needs.push(id);
  return { has, needs };
}

/**
 * One cell of a profile's card grid: what the profile owner (`theirs`, card id -> copies) has of card `id`, and, when a
 * signed-in visitor who isn't the owner is looking (`mine`, their collection; null otherwise), how it matches theirs.
 * { state: 'want' | 'have' | 'spare', spare: copies beyond the first, get: their spare that you're missing (the red
 * disc), give: missing from theirs and you have a spare (the red ring) }. Agrees with match().
 * @param {string} id
 * @param {Map<string, number>} theirs
 * @param {Map<string, number> | null} [mine]
 */
export function cellState(id, theirs, mine = null) {
  const copies = theirs.get(id) ?? 0;
  const state = copies === 0 ? 'want' : copies === 1 ? 'have' : 'spare';
  return {
    state,
    spare: Math.max(copies - 1, 0),
    get: Boolean(mine) && state === 'spare' && !mine.has(id),
    give: Boolean(mine) && state === 'want' && (mine.get(id) ?? 0) > 1,
  };
}

/**
 * What a cell says (its popover, and its accessible label): "#7 Brady Tkachuk — has 2 spare". `own` = the owner looking
 * at their own profile ("you"); otherwise the trader is "they".
 */
export function cellText(number, player, cell, own = false) {
  const words = {
    want: own ? 'you need it' : 'needs it',
    have: own ? 'you have it' : 'has it',
    spare: `${own ? 'you have' : 'has'} ${cell.spare} spare`,
  }[cell.state];
  const says = cell.give ? 'they need it, and you have a spare' : cell.get ? `${words}, and you need it` : words;
  return `#${number} ${player} — ${says}`;
}

/**
 * The Following list's orders, comparing { tradeId, has, needs } (the match counts). Best match: trades that work both
 * ways first (the smaller of the two counts, then their sum); ties by trade id.
 */
export const SORTS = {
  best: (a, b) => Math.min(b.has, b.needs) - Math.min(a.has, a.needs) || b.has + b.needs - (a.has + a.needs),
  has: (a, b) => b.has - a.has || b.needs - a.needs,
  needs: (a, b) => b.needs - a.needs || b.has - a.has,
  near: (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
};
export function sortTraders(list, order) {
  const by = SORTS[order] ?? SORTS.best;
  return [...list].sort((a, b) => by(a, b) || a.tradeId.toLowerCase().localeCompare(b.tradeId.toLowerCase()));
}

/** A profile's address on this site, `/trading?u=<id>`. */
export const profilePath = (tradeId) => `/trading?u=${encodeURIComponent(tradeId)}`;
/** The link of "Report this profile": the Contact page, with the trade id so the topic and the profile are filled in. */
export const reportHref = (tradeId) => `/contact?about=${encodeURIComponent(tradeId)}`;
