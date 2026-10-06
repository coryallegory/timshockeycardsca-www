/* Official postal-area centres, shared by the account form and browser-only location lookup. */
import { fsaProblem } from './trade.js?v=4af6e76bf0';

let centresPromise;
export function loadAreas() {
  if (!centresPromise) centresPromise = fetch('/data/fsa-centres.json?v=e13c629b24').then((res) => {
    if (!res.ok) throw new Error('Could not load postal areas. Please try again.');
    return res.json();
  }).then((data) => data.centres).catch((err) => {
    centresPromise = null;
    throw err;
  });
  return centresPromise;
}
export function areaProblem(value, centres) {
  const problem = fsaProblem(value);
  if (problem) return problem;
  return Object.hasOwn(centres, value.trim().toUpperCase()) ? null : 'Not a Canadian postal area. Check the first 3 characters of your postal code.';
}
export const roundedDistance = (km) => Math.max(5, Math.ceil(km / 5) * 5);
export const distanceText = (km) => Number.isFinite(km) && km >= 0 ? `Within ${roundedDistance(km)} km` : '';
export function distanceKm(a, b) {
  const rad = (n) => n * Math.PI / 180;
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
/** Coordinates stay in this call's memory: only the returned postal area is used by a search. */
export function nearestArea(latitude, longitude, centres) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('Location unavailable. Enter a postal area instead.');
  let nearest = null;
  let best = Infinity;
  for (const [fsa, point] of Object.entries(centres)) {
    const km = distanceKm([latitude, longitude], point);
    if (km < best) { best = km; nearest = fsa; }
  }
  return nearest;
}
