/* Where signing in returns to: the `next` in /account?next=<path> (docs/DECISIONS.md, "Return after sign-in"). Only a
   path on this site is followed, so a link can't use the sign-in page to send someone elsewhere: it must start with a
   single "/" (not "//", which browsers read as another host) and hold no backslash, space or control character
   (browsers read "/\" as "//" and drop tabs and newlines). Anything else, or nothing, goes to the Collection page,
   where most sign-ins start. No DOM access, so tests import it. */

/** Where signing in goes when `next` is missing or not allowed. */
export const FALLBACK = '/collection';

/** The path to go to after signing in: `raw` (from ?next=) when it is a path on `origin`, else FALLBACK. */
export function safeNext(raw, origin) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || /[\\\s\u0000-\u001f\u007f]/.test(raw)) return FALLBACK;
  try {
    const url = new URL(raw, origin);
    return url.origin === new URL(origin).origin ? url.pathname + url.search + url.hash : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

/** /account?next=<path>, encoded as layout.ts's signInHref encodes it (slashes kept, for a readable address). */
export const signInHref = (path) => `/account?next=${encodeURIComponent(path).replace(/%2F/gi, '/')}`;
