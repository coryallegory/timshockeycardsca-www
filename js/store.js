/* Store logic the map runs in the browser: map category from status.json, opening hours, phone format.
   Plain ES module, no build step. Tested from apps/web/test/store.test.ts. */

// ---------- map category ----------

/**
 * The map's four categories: available (green), out-of-stock (red), untracked (grey), problem (orange: no data).
 * Available and out-of-stock are the latest successful check, however old (the popup says when it was).
 * `entry` is the store's record in status.json (may be missing). Untracked: not a mobile-ordering store, or the worker
 * found the app has no menu for it (reason 'untracked'). Opening hours play no part.
 * @returns {{ s: 'available' | 'out-of-stock' | 'untracked' | 'problem', why: 'unchecked' | 'failing' | null }}
 */
export function displayStatus(tracked, entry) {
  if (!tracked || entry?.reason === 'untracked') return { s: 'untracked', why: null };
  if (!entry || entry.status === 'unknown') return { s: 'problem', why: entry?.reason === 'failing' ? 'failing' : 'unchecked' };
  return { s: entry.status, why: null };
}

// ---------- phone ----------

/** "15195338303" / "5195338303" -> "(519) 533-8303"; anything else is returned as given. */
export function formatPhone(raw) {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  return ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : raw.trim() || null;
}

// ---------- opening hours ----------
// `hours` is a location's {diningRoom, driveThru}, each {mon: {open: "06:00", close: "22:00"}, ...} or null.
// A store is open if either is open. "00:00-23:59" means 24 hours; a close at or before the open time means
// the store closes after midnight (e.g. 06:00-02:00).

const DAY_KEYS = ['mon', 'tue', 'wed', 'thr', 'fri', 'sat', 'sun']; // CMS spelling ('thr')
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_MIN = 1440;

function toMinutes(v) {
  const m = typeof v === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(v.trim()) : null;
  if (!m || Number(m[1]) > 24 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Seven days, Monday first: {open, close} in minutes (close may be 1440), or null when closed. */
function parseWeek(sched) {
  if (!sched || typeof sched !== 'object') return null;
  const week = DAY_KEYS.map((d) => {
    const open = toMinutes(sched[d]?.open);
    const close = toMinutes(sched[d]?.close);
    if (open === null || close === null) return null;
    return { open, close: close >= DAY_MIN - 1 ? DAY_MIN : close }; // 23:59 means "until midnight"
  });
  return week.some(Boolean) ? week : null;
}

const is24h = (d) => d.open === d.close || (d.open === 0 && d.close === DAY_MIN);

/** Open intervals [from, to) per calendar day, Monday first; a late close spills into the next day. null = no usable hours. */
export function storeSpans(hours) {
  const weeks = [parseWeek(hours?.diningRoom), parseWeek(hours?.driveThru)];
  if (!weeks.some(Boolean)) return null;
  const spans = DAY_KEYS.map(() => []);
  for (const week of weeks) {
    week?.forEach((d, i) => {
      if (!d) return;
      if (is24h(d)) spans[i].push([0, DAY_MIN]);
      else if (d.close > d.open) spans[i].push([d.open, d.close]);
      else {
        spans[i].push([d.open, DAY_MIN]); // closes after midnight
        if (d.close > 0) spans[(i + 1) % 7].push([0, d.close]);
      }
    });
  }
  return spans;
}

/** Local weekday (Mon = 0) and minute of the day, or null for a bad time zone. */
function localTime(date, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(date);
    const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
    const day = DAY_NAMES.indexOf(get('weekday').slice(0, 3));
    const minute = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
    return day < 0 || Number.isNaN(minute) ? null : { day, minute };
  } catch {
    return null;
  }
}

/** The store's local weekday, Mon = 0 (for highlighting today's hours). */
export function localWeekday(timezone, date) {
  return timezone ? (localTime(date, timezone)?.day ?? null) : null;
}

/** true/false = open/closed per published hours; null = unknown (no hours or bad time zone). */
export function isOpenAt(spans, timezone, date) {
  const t = spans && timezone ? localTime(date, timezone) : null;
  if (!spans || !t) return null;
  return spans[t.day].some(([from, to]) => t.minute >= from && t.minute < to);
}

/** Next opening as "5:30 a.m.", "tomorrow 6 a.m." or "Sat 7 a.m.". null if unknown or never open. */
export function nextOpeningLabel(spans, timezone, date) {
  const t = spans && timezone ? localTime(date, timezone) : null;
  if (!spans || !t) return null;
  for (let offset = 0; offset <= 7; offset++) {
    const day = (t.day + offset) % 7;
    const endedLastNight = spans[(day + 6) % 7].some(([, to]) => to === DAY_MIN);
    const opening = spans[day]
      .map(([from]) => from)
      .filter((from) => (offset > 0 || from > t.minute) && !(from === 0 && endedLastNight)) // 00:00 after a late night isn't an opening
      .sort((a, b) => a - b)[0];
    if (opening === undefined) continue;
    const time = minuteLabel(opening);
    return offset === 0 ? time : offset === 1 ? `tomorrow ${time}` : `${DAY_NAMES[day]} ${time}`;
  }
  return null;
}

/** "6 a.m.", "10:30 p.m." from minutes since midnight (1440 = midnight). */
export function minuteLabel(min) {
  const h = Math.floor((min % DAY_MIN) / 60);
  const mm = min % 60;
  return `${((h + 11) % 12) + 1}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h < 12 ? 'a.m.' : 'p.m.'}`;
}

/** Weekly hours for the popup: {diningRoom: [{day: 'Mon', text: '6 a.m. – 10 p.m.'}, ...], driveThru}. null without hours. */
export function readableHours(hours) {
  const dining = parseWeek(hours?.diningRoom);
  const drive = parseWeek(hours?.driveThru);
  if (!dining && !drive) return null;
  const readable = (week) =>
    week?.map((d, i) => ({ day: DAY_NAMES[i], text: !d ? 'Closed' : is24h(d) ? 'Open 24 hours' : `${minuteLabel(d.open)} – ${minuteLabel(d.close)}` })) ?? null;
  return { diningRoom: readable(dining), driveThru: readable(drive) };
}
