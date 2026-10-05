/* The only browser code that calls the API (shapes: docs/DATABASE-AUTH-PLAN.md, Endpoints and Trading endpoints). The API's base URL
   comes from the page's data-api-url attribute (the API_URL build setting). Every call sends the session cookie
   (credentials: 'include'); every state-changing call sends Content-Type: application/json, which the API requires even
   without a body. Failures throw an ApiError carrying the API's { error } message; status 401 means signed out.
   Nothing here runs until a function is called: importing it makes no request.
   Also here, for every page with account features: the "signed in on this browser" hint and message formatting. */

const BASE = (document.querySelector('[data-api-url]')?.dataset.apiUrl ?? '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
  /** No valid session (never signed in, signed out elsewhere, or expired). */
  get signedOut() {
    return this.status === 401;
  }
}

async function call(method, path, body) {
  const init = { method, credentials: 'include', headers: {} };
  if (method !== 'GET') init.headers['Content-Type'] = 'application/json';
  if (body !== undefined) init.body = JSON.stringify(body);
  let res;
  try {
    res = await fetch(BASE + path, init);
  } catch {
    throw new ApiError(0, "Couldn't reach the server. Check your connection and try again.");
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Something went wrong (${res.status}).`);
  return data;
}

/** { email } of the signed-in user; ApiError 401 when signed out. */
export const me = () => call('GET', '/auth/me');
/** Signs in: { email }. */
export const login = (email, password) => call('POST', '/auth/login', { email, password });
/** Creates the account and signs in: { email }. */
export const register = (email, password) => call('POST', '/auth/register', { email, password });
/** Ends this session (succeeds when already signed out too). */
export const logout = () => call('POST', '/auth/logout');
/**
 * The user's collection as a Map of card id -> copies (1 to 99). The API lists every owned id in `cards` and only the
 * counts above 1 in `copies`; a card without one (or an API without copy counts) has 1.
 */
export async function getCollection() {
  const { cards, copies = {} } = await call('GET', '/collection');
  return new Map(cards.map((id) => [id, copies[id] ?? 1]));
}
const cardPath = (cardId) => `/collection/cards/${encodeURIComponent(cardId)}`;
/** Marks (owned, keeping any copy count) or unmarks a card (all its copies); both are idempotent. */
export const setOwned = (cardId, owned) => call(owned ? 'PUT' : 'DELETE', cardPath(cardId));
/** Marks a card owned with `copies` copies in all (1 to 99; extras are the copies beyond the first). Idempotent. */
export const setCopies = (cardId, copies) => call('PUT', cardPath(cardId), { copies });
/** Asks for a reset link by email. Always succeeds the same way, whether or not the address has an account. */
export const forgotPassword = (email) => call('POST', '/auth/forgot-password', { email });
/** Sets a new password with the emailed token; ends every session and signs this browser in: { email }. */
export const resetPassword = (token, password) => call('POST', '/auth/reset-password', { token, password });
/** Changes the password (signed in); other sessions end, this browser stays signed in (with a new cookie). */
export const changePassword = (currentPassword, newPassword) => call('POST', '/auth/change-password', { currentPassword, newPassword });
/** Deletes the account and its collection for good (needs the password); the API also ends the session. */
export const deleteAccount = (password) => call('DELETE', '/account', { password });

// Trading (docs/DATABASE-AUTH-PLAN.md, "Trading endpoints").
const tradePath = (base, tradeId) => `${base}/${encodeURIComponent(tradeId)}`;
/** The signed-in user's trade profile: { tradeId?, fsa?, adult?, public, contacts, updatedAt? }. */
export const getProfile = () => call('GET', '/profile');
/** Replaces the trade profile (anything left out is cleared); answers the saved profile. */
export const saveProfile = (profile) => call('PUT', '/profile', profile);
/** Whether a trade id is free for the signed-in user: { available, reason? }. */
export const checkTradeId = (tradeId) => call('GET', tradePath('/trade-ids', tradeId));
/**
 * A public trade profile (or the viewer's own, private or not): { tradeId, fsa, contacts, owner, public, cards, copies,
 * following? } (`following` only for a signed-in visitor who isn't the owner); 404 otherwise.
 */
export const getTrader = (tradeId) => call('GET', tradePath('/traders', tradeId));
/** The public traders the signed-in user follows, with their set cards: [{ tradeId, fsa, contacts, cards, copies }]. */
export const getFollowing = () => call('GET', '/following').then((res) => res.traders);
/** Follows a public trader (idempotent). */
export const follow = (tradeId) => call('PUT', tradePath('/following', tradeId));
/** Unfollows (idempotent). */
export const unfollow = (tradeId) => call('DELETE', tradePath('/following', tradeId));

/* The session cookie is HttpOnly, so scripts can't see it. This non-secret localStorage hint records that a sign-in
   happened on this browser; only with it does a page ask the API who is signed in. Storage may be unavailable (private
   mode, blocked storage): then there is no hint. */
const HINT_KEY = 'tims.signedIn';
export function maybeSignedIn() {
  try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return false; }
}
export function rememberSignedIn(on) {
  try { on ? localStorage.setItem(HINT_KEY, '1') : localStorage.removeItem(HINT_KEY); } catch { /* storage unavailable */ }
}

/** An API message ('email or password is wrong') as a sentence for the page. */
export function sentence(text) {
  const s = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(s) ? s : `${s}.`;
}
