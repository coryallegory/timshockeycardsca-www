/* The only browser code that calls the Stage 2 API (shapes: docs/DATABASE-AUTH-PLAN.md, Endpoints). The API's base URL
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
/** The card ids the user owns, sorted. */
export const getCollection = async () => (await call('GET', '/collection')).cards;
/** Marks (owned) or unmarks a card; both are idempotent. */
export const setOwned = (cardId, owned) => call(owned ? 'PUT' : 'DELETE', `/collection/cards/${encodeURIComponent(cardId)}`);
/** Asks for a reset link by email. Always succeeds the same way, whether or not the address has an account. */
export const forgotPassword = (email) => call('POST', '/auth/forgot-password', { email });
/** Sets a new password with the emailed token; ends every session and signs this browser in: { email }. */
export const resetPassword = (token, password) => call('POST', '/auth/reset-password', { token, password });
/** Changes the password (signed in); other sessions end, this browser stays signed in (with a new cookie). */
export const changePassword = (currentPassword, newPassword) => call('POST', '/auth/change-password', { currentPassword, newPassword });
/** Deletes the account and its collection for good (needs the password); the API also ends the session. */
export const deleteAccount = (password) => call('DELETE', '/account', { password });

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
