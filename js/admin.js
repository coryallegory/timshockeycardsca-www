/* The owner's /admin metrics page (built only with API_URL; docs/DATABASE-AUTH-PLAN.md, Admin metrics). Shows the
   404 page's text unless the visitor is signed in as an admin: with no sign-in hint it asks nothing; otherwise it
   reuses the header's one /auth/me check (header-account.js `ready`) and makes one GET /admin/metrics through
   account.js, which answers 404 to anyone but an admin. The answer is live signup counts (aggregates only), drawn as
   tiles and two small SVG charts, as text only (never parsed as HTML); chart colours come from CSS classes in
   admin.css. */
import * as account from './account.js?v=3628ae002f';
import { ready } from './header-account.js?v=3628ae002f';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';

// ---------- formatting ----------
const atNoon = (date) => new Date(`${date}T12:00:00Z`);
const fmt = {
  n: (x) => x.toLocaleString('en-CA'),
  day: (date) => atNoon(date).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
  short: (date) => atNoon(date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
  dayNumber: (date) => String(Number(date.slice(8))),
  asOf: (iso) => `${new Date(iso).toLocaleString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto' })} ET`,
};

/** An element with text children: strings become text, nodes are appended as they are. */
function h(tag, className, ...children) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  e.append(...children);
  return e;
}

// ---------- charts: one series in the site's red, a recessive axis, a tooltip per mark ----------
function svgEl(name, attrs) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}
function svgText(attrs, text) {
  const t = svgEl('text', attrs);
  t.textContent = text;
  return t;
}

let tip;
/** Shows the tooltip (a bold title and a line) above (x, y) in `host`'s pixels, or hides it (null). */
function tooltip(host, content, x, y) {
  if (!tip) {
    tip = h('div', 'chart-tip');
    tip.setAttribute('aria-hidden', 'true');
    document.body.append(tip);
  }
  if (!content) {
    tip.hidden = true;
    return;
  }
  tip.replaceChildren(h('b', '', content.title), content.text);
  tip.hidden = false;
  const r = host.getBoundingClientRect();
  const left = Math.min(document.documentElement.clientWidth - tip.offsetWidth - 8, Math.max(8, r.left + x - tip.offsetWidth / 2));
  tip.style.left = `${left + scrollX}px`;
  tip.style.top = `${r.top + y - tip.offsetHeight - 10 + scrollY}px`;
}

/** A round axis top at or above `v`, with a whole-number midpoint (2, 4, 40, 70, 3,000...). */
function niceMax(v) {
  if (v <= 2) return 2;
  const step = 10 ** Math.floor(Math.log10(v));
  let max = Math.ceil(v / step) * step;
  if (max % 2) max += step;
  return max;
}

/**
 * Which x labels to show so they never collide: every day for up to 14 days when there's room, otherwise every
 * 7th day (or 14th, 21st...), counted back from the last day so today is always labelled.
 */
function labelStep(n, slot, minPx) {
  if (n <= 14) return Math.max(1, Math.ceil(minPx / slot));
  let step = 7;
  while (step * slot < minPx) step += 7;
  return step;
}

const SIZE = { H: 180, L: 40, R: 14, B: 24, T: 18 };

function frame(host, max, label, right) {
  const W = host.clientWidth || 600;
  const { H, L, B, T } = SIZE;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': label });
  for (const f of [0, 0.5, 1]) {
    const y = T + (H - T - B) * (1 - f);
    svg.append(svgEl('line', { x1: L, x2: W - right, y1: y, y2: y, class: f ? 'grid' : 'axis' }));
    svg.append(svgText({ x: L - 6, y: y + 4, class: 'tick', 'text-anchor': 'end' }, fmt.n(max * f)));
  }
  return { svg, W };
}

/** Bars, one per row: [{ date, value, tip: { title, text } }]. The last bar shows its value. */
function bars(host, rows, label) {
  const max = niceMax(Math.max(...rows.map((r) => r.value)));
  const { svg, W } = frame(host, max, label, 0);
  const { H, L, B, T } = SIZE;
  const slot = (W - L) / rows.length;
  const bw = Math.max(1, Math.min(56, slot - Math.min(4, slot * 0.25)));
  const short = rows.length > 14; // "Oct 9" when thinned, the day number when every day is labelled
  const step = labelStep(rows.length, slot, short ? 52 : 22);
  rows.forEach((r, i) => {
    const bh = ((H - T - B) * r.value) / max;
    const x = L + slot * i + (slot - bw) / 2;
    const y = H - B - bh;
    const g = svgEl('g', { class: 'mark' });
    g.append(svgEl('path', { d: topRounded(x, y, bw, bh, 4), class: 'bar' }));
    if (i === rows.length - 1) {
      const narrow = slot < 32;
      g.append(svgText({ x: narrow ? x + bw : x + bw / 2, y: y - 5, class: 'val', 'text-anchor': narrow ? 'end' : 'middle' }, fmt.n(r.value)));
    }
    if ((rows.length - 1 - i) % step === 0) {
      g.append(svgText({ x: x + bw / 2, y: H - 6, class: 'tick', 'text-anchor': 'middle' }, short ? fmt.short(r.date) : fmt.dayNumber(r.date)));
    }
    const hit = svgEl('rect', { x: L + slot * i, y: T, width: slot, height: H - T - B, class: 'hit' });
    hit.addEventListener('pointerenter', () => tooltip(host, r.tip, ((x + bw / 2) * host.clientWidth) / W, (y * host.clientHeight) / H));
    hit.addEventListener('pointerleave', () => tooltip(host, null));
    g.append(hit);
    svg.append(g);
  });
  host.replaceChildren(svg);
}

function topRounded(x, y, w, h, r) {
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** A line with a crosshair: [{ date, value, tip }]. The last point shows its value. */
function line(host, pts, label) {
  const max = niceMax(Math.max(...pts.map((p) => p.value)));
  const { svg, W } = frame(host, max, label, SIZE.R);
  const { H, L, R, B, T } = SIZE;
  const span = W - L - R - 16;
  const X = (i) => L + 8 + (pts.length > 1 ? (span * i) / (pts.length - 1) : span);
  const Y = (v) => T + (H - T - B) * (1 - v / max);
  svg.append(svgEl('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${X(i)},${Y(p.value)}`).join(''), class: 'line' }));
  const step = labelStep(pts.length, pts.length > 1 ? span / (pts.length - 1) : span, 52);
  pts.forEach((p, i) => {
    if ((pts.length - 1 - i) % step === 0) svg.append(svgText({ x: X(i), y: H - 6, class: 'tick', 'text-anchor': 'middle' }, fmt.short(p.date)));
  });
  const last = pts.length - 1;
  svg.append(svgEl('circle', { cx: X(last), cy: Y(pts[last].value), r: 4, class: 'dot' }));
  svg.append(svgText({ x: X(last) - 8, y: Y(pts[last].value) - 8, class: 'val', 'text-anchor': 'end' }, fmt.n(pts[last].value)));
  const cross = svgEl('line', { y1: T, y2: H - B, class: 'cross', visibility: 'hidden' });
  const hot = svgEl('circle', { r: 5, class: 'dot', visibility: 'hidden' });
  svg.append(cross, hot);
  const hit = svgEl('rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'hit' });
  const hide = () => {
    cross.setAttribute('visibility', 'hidden');
    hot.setAttribute('visibility', 'hidden');
    tooltip(host, null);
  };
  hit.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) * W) / r.width;
    const i = pts.length > 1 ? Math.max(0, Math.min(last, Math.round(((px - L - 8) * last) / span))) : 0;
    for (const [k, v] of [['x1', X(i)], ['x2', X(i)], ['cx', X(i)], ['cy', Y(pts[i].value)]]) (k.startsWith('c') ? hot : cross).setAttribute(k, String(v));
    cross.setAttribute('visibility', 'visible');
    hot.setAttribute('visibility', 'visible');
    tooltip(host, pts[i].tip, (X(i) * r.width) / W, (Y(pts[i].value) * r.height) / H);
  });
  hit.addEventListener('pointerleave', hide);
  svg.append(hit);
  host.replaceChildren(svg);
}

// ---------- the page ----------
const sum = (days, key) => days.reduce((s, x) => s + x[key], 0);
const oneDecimal = (x) => x.toLocaleString('en-CA', { maximumFractionDigits: 1 });

/** `m`: { accounts, since, days: [{ date, signups, deletions }] }, the last day being today (America/Toronto). */
function render(m, loadedAt) {
  const d = m.days;
  const week = d.slice(-7);
  const weekSignups = sum(week, 'signups');
  const weekDeleted = sum(week, 'deletions');
  const perDay = oneDecimal(weekSignups / (week.length || 1));
  $('as-of').textContent = `Live · ${fmt.asOf(loadedAt)}`;
  $('k-accounts').textContent = fmt.n(m.accounts);
  $('k-accounts-sub').textContent = m.since ? `since ${fmt.short(m.since)}` : 'No signups yet';
  $('k-today').textContent = fmt.n(d.length ? d[d.length - 1].signups : 0);
  $('k-today-sub').textContent = 'so far';
  $('k-week').textContent = fmt.n(weekSignups);
  $('k-week-sub').textContent = weekDeleted ? `${fmt.n(weekDeleted)} deleted` : `per day avg ${perDay}`;
  $('k-avg').textContent = perDay;
  $('k-avg-sub').textContent = 'last 7 days';
  if (!d.length) return showEmpty('No signups yet.');

  let total = 0;
  const series = d.map((x) => ({ ...x, total: (total += x.signups - x.deletions) }));
  const tipFor = (x, text) => ({ title: fmt.day(x.date), text });
  $('admin-charts').hidden = false;
  let width = 0;
  const draw = () => {
    if (document.body.clientWidth === width) return;
    width = document.body.clientWidth;
    bars($('c-signups'), series.map((x) => ({ date: x.date, value: x.signups, tip: tipFor(x, `${fmt.n(x.signups)} signups${x.deletions ? `, ${fmt.n(x.deletions)} deleted` : ''}`) })), 'Signups per day');
    line($('c-total'), series.map((x) => ({ date: x.date, value: x.total, tip: tipFor(x, `${fmt.n(x.total)} accounts`) })), 'Total accounts');
  };
  draw();
  addEventListener('resize', draw);
}

function showEmpty(text) {
  $('admin-empty').textContent = text;
  $('admin-empty').hidden = false;
}

function notFound() {
  $('nf').hidden = false;
}

async function start() {
  const { email } = await ready;
  if (!email) return notFound();
  let metrics;
  try {
    metrics = await account.getMetrics();
  } catch (err) {
    if (err.status === 404 || err.signedOut) return notFound();
    $('admin').hidden = false;
    return showEmpty(`Couldn't load metrics. ${account.sentence(err.message)}`);
  }
  document.title = document.title.replace(/^Not found/, 'Site metrics');
  $('admin').hidden = false;
  render(metrics, new Date().toISOString());
}

start();
