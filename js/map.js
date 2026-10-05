/* The live stock map on Home: one dot per Tim Hortons, coloured by hockey-card-pack status.
   Data: /data/locations.json (stores, hours; changes rarely) + status.json (pack status; rewritten after each pass) from
   the map element's data-status-url (the Lambda's file in S3 on the live site, /data/status.json locally), joined by
   store id. Everything else is computed here. Never calls Tim Hortons. */
import { displayStatus, formatPhone, isOpenAt, localWeekday, nextOpeningLabel, readableHours, storeSpans } from './store.js?v=1c5474a3c2';

const REFRESH_MS = 60_000;
const STATUS_URL = document.getElementById('map').dataset.statusUrl || '/data/status.json';
const CANADA = [[41.6, -141.0], [70.0, -52.6]];
const NEAR_ZOOM = 12; // a city and its suburbs
// Where the visitor was last located (rounded to about 1 km, kept only in their own browser), so the map can open there
// straight away instead of on all of Canada while the browser works out the current position.
const LAST_SPOT_KEY = 'map.lastSpot';
const css = getComputedStyle(document.documentElement);
const colour = (name) => css.getPropertyValue(`--${name}`).trim();

// Drawn bottom-to-top, so green sits on top where dots overlap.
const ORDER = ['untracked', 'problem', 'out-of-stock', 'available'];
const LABEL = { available: 'Available', 'out-of-stock': 'Out of stock', untracked: 'Untracked', problem: 'No data' };
const WHY = {
  unchecked: 'Not checked yet.',
  failing: 'Recent checks failed, so the status is unknown.',
};

// The mouse wheel zooms whenever the pointer is over the map (owner's choice over click-to-enable).
const map = L.map('map', { preferCanvas: true, zoomSnap: 0.5, minZoom: 3, zoomControl: false });
L.control.zoom({ position: 'bottomright' }).addTo(map);
const lastSpot = (() => {
  try {
    const ll = JSON.parse(localStorage.getItem(LAST_SPOT_KEY));
    return Array.isArray(ll) && ll.length === 2 && ll.every(Number.isFinite) ? ll : null;
  } catch {
    return null;
  }
})();
if (lastSpot) map.setView(lastSpot, NEAR_ZOOM);
else map.fitBounds(CANADA);
window.storeMap = map;
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const renderer = L.canvas({ padding: 0.5, tolerance: 4 });
// "You are here" gets its own pane above the stores. Clicks pass through it (map.css): a second canvas on top of the
// stores' canvas would otherwise swallow every click on a store.
map.createPane('you');
const youRenderer = L.canvas({ pane: 'you' });
const layers = Object.fromEntries(ORDER.map((k) => [k, L.layerGroup().addTo(map)]));
const markers = new Map(); // id -> { marker, store }
let youMarker = null;

// ---------- helpers ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function ago(iso) {
  if (!iso) return null;
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** A time in the viewer's own time zone: "8:21 p.m. CDT", with the date when it isn't today ("Sep 29, 8:21 p.m. CDT"). */
function localStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = d.toDateString() === new Date().toDateString();
  return d.toLocaleString([], { ...(today ? {} : { month: 'short', day: 'numeric' }), hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

const radiusForZoom = (z) => (z <= 4 ? 2.5 : z <= 6 ? 3.5 : z <= 9 ? 5 : z <= 12 ? 7 : 8);
const style = (s) => ({
  renderer,
  radius: radiusForZoom(map.getZoom()),
  color: colour('marker-outline'),
  weight: map.getZoom() >= 8 ? 1.5 : 0.75,
  fillColor: colour(s.s),
  fillOpacity: 0.95,
  opacity: 0.95,
});

const title = (s) => s.address || s.name || `Store ${s.id}`;
const place = (s) => [s.city, s.province].filter(Boolean).join(', ');

function statusLine(s) {
  const lines = [];
  if (s.s === 'available' || s.s === 'out-of-stock') {
    if (s.checkedAt) lines.push(`Checked ${esc(ago(s.checkedAt))} (${esc(localStamp(s.checkedAt))})${s.since ? ` · ${s.s === 'available' ? 'available' : 'out of stock'} since ${esc(ago(s.since))}` : ''}`);
  } else if (s.s === 'untracked') {
    lines.push('We can\'t track this location: the Tims app has no menu for it (often an airport, campus, hospital or gas station). Packs may still be sold at the counter.');
  } else {
    lines.push(esc(WHY[s.why] || WHY.failing));
    if (s.checkedAt) lines.push(`Last good check ${esc(ago(s.checkedAt))}.`);
  }
  return lines.map((l) => `<p class="pop-meta">${l}</p>`).join('');
}

/** "Open now" / "Closed · opens 5 a.m." from the store's hours: information only, not part of the status. */
function openLine(s) {
  const spans = storeSpans(s.hours);
  const now = new Date();
  const open = isOpenAt(spans, s.timezone, now);
  if (open === true) return '<span class="open-now">Open now</span>';
  if (open === false) {
    const opens = nextOpeningLabel(spans, s.timezone, now);
    return `<span class="closed-now">Closed</span>${opens ? ` · opens ${esc(opens)}` : ''}`;
  }
  return '';
}

function hoursTable(s) {
  const h = readableHours(s.hours);
  if (!h) return '';
  const today = localWeekday(s.timezone, new Date());
  const cols = [['Dining room', h.diningRoom], ['Drive-thru', h.driveThru]].filter(([, d]) => d);
  const rows = cols[0][1]
    .map((d, i) => `<tr${i === today ? ' class="today"' : ''}><th>${esc(d.day)}</th>${cols.map(([, c]) => `<td>${esc(c[i].text)}</td>`).join('')}</tr>`)
    .join('');
  const head = cols.length > 1 ? `<thead><tr><th></th>${cols.map(([n]) => `<th>${n}</th>`).join('')}</tr></thead>` : '';
  const caption = cols.length === 1 ? `<caption>${cols[0][0]} hours (local time)</caption>` : '<caption>Hours (local time)</caption>';
  return `<details class="hours"${window.innerHeight > 700 ? ' open' : ''}><summary>Hours</summary><table>${caption}${head}<tbody>${rows}</tbody></table></details>`;
}

function popupHtml(s) {
  const price = s.s === 'available' && s.price ? ` <span class="price">$${(s.price / 100).toFixed(2)} in the app</span>` : '';
  const phone = formatPhone(s.phone);
  const tel = phone ? `<a href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">${esc(phone)}</a>` : '';
  const directions = encodeURIComponent([s.address, s.city, s.province, s.postalCode].filter(Boolean).join(', ') || `${s.lat},${s.lng}`);
  return `<div class="pop">
    <div class="pop-status ${esc(s.s)}"><span class="dot ${esc(s.s)}"></span>${esc(LABEL[s.s])}${price}</div>
    <h3>${esc(title(s))}</h3>
    <p class="pop-addr">${esc(place(s))}${s.postalCode ? ` ${esc(s.postalCode)}` : ''}</p>
    ${statusLine(s)}
    <div class="pop-contact">${[openLine(s), tel].filter(Boolean).join(' · ')}</div>
    ${hoursTable(s)}
    <div class="pop-foot"><a href="https://www.google.com/maps/dir/?api=1&destination=${directions}" target="_blank" rel="noopener">Directions</a><span>Store #${esc(s.id)}</span></div>
  </div>`;
}

// ---------- legend ----------
const legend = document.getElementById('legend');
legend.addEventListener('change', (e) => {
  const li = e.target.closest('li[data-s]');
  if (!li) return;
  const layer = layers[li.dataset.s];
  if (e.target.checked) layer.addTo(map);
  else map.removeLayer(layer);
  li.classList.toggle('off', !e.target.checked);
});

// ---------- data ----------
const updated = document.getElementById('updated');
let locations = null;

async function getJson(url, cache) {
  const res = await fetch(url, { cache });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function load() {
  try {
    // Locations change rarely: the browser cache handles them. Status is revalidated every time (a cheap 304 when unchanged).
    if (!locations) locations = (await getJson('/data/locations.json', 'default'))?.locations ?? [];
    const status = await getJson(STATUS_URL, 'no-cache');
    const counts = Object.fromEntries(ORDER.map((k) => [k, 0]));
    for (const loc of locations) {
      const entry = status?.stores[loc.id];
      const s = { ...loc, ...entry, ...displayStatus(loc.tracked, entry) };
      counts[s.s]++;
      const e = markers.get(s.id);
      if (e) {
        if (e.store.s !== s.s) {
          layers[e.store.s].removeLayer(e.marker);
          layers[s.s].addLayer(e.marker);
        }
        e.store = s;
        e.marker.setStyle(style(s));
      } else {
        const marker = L.circleMarker([s.lat, s.lng], style(s));
        const rec = { marker, store: s };
        marker.bindPopup(() => popupHtml(rec.store), { maxWidth: 320, minWidth: 240, autoPanPadding: [16, 16] });
        marker.on('popupopen', () => marker.getTooltip()?.setOpacity(0)); // the popup already names the store
        marker.on('popupclose', () => marker.getTooltip()?.setOpacity(0.9));
        marker.bindTooltip(() => esc(`${title(rec.store)}${place(rec.store) ? `, ${place(rec.store)}` : ''}`), { direction: 'top', offset: [0, -4] });
        layers[s.s].addLayer(marker);
        markers.set(s.id, rec);
      }
    }
    for (const li of legend.querySelectorAll('li[data-s]')) {
      const n = counts[li.dataset.s] ?? 0;
      li.querySelector('b').textContent = n.toLocaleString();
      if (li.dataset.s === 'problem') li.hidden = n === 0; // "No data" only shows when there is some
    }
    const when = status ? `last updated ${localStamp(status.generatedAt)}` : 'no stock checks yet';
    updated.textContent = `${locations.length.toLocaleString()} locations · ${when}.`;
  } catch (err) {
    updated.textContent = `Couldn't load stores: ${err.message}`;
  }
}

map.on('zoomend', () => {
  for (const { marker, store } of markers.values()) marker.setStyle(style(store));
});

// ---------- my location: a crosshair button above the zoom buttons ----------
// Its centre fills in while the map is centred on you, and empties as soon as the map is moved or zoomed by hand.
const LOCATE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="ring" cx="12" cy="12" r="7"/><path class="ticks" d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/><circle class="centre" cx="12" cy="12" r="3"/></svg>';
const locateMsg = document.getElementById('locate-msg');
let locateBtn = null;
const LocateControl = L.Control.extend({
  onAdd() {
    const bar = L.DomUtil.create('div', 'leaflet-bar locate-control');
    locateBtn = L.DomUtil.create('a', '', bar);
    Object.assign(locateBtn, { href: '#', role: 'button', title: 'Show my location', innerHTML: LOCATE_ICON });
    locateBtn.setAttribute('aria-label', 'Show my location');
    locateBtn.setAttribute('aria-pressed', 'false');
    L.DomEvent.disableClickPropagation(bar);
    L.DomEvent.on(locateBtn, 'click', (e) => {
      L.DomEvent.preventDefault(e);
      locate(true);
    });
    return bar;
  },
});
new LocateControl({ position: 'bottomright' }).addTo(map); // bottom corners stack upwards, so this sits above the zoom buttons

function centredOnYou(on) {
  locateBtn.classList.toggle('active', on);
  locateBtn.setAttribute('aria-pressed', String(on));
}
let movedByHand = false;
map.on('movestart', () => {
  centredOnYou(false);
  movedByHand = true;
});

/** `explicit`: the crosshair was clicked. The automatic locate on load doesn't pull the map away once the visitor has moved it. */
function locate(explicit) {
  locateMsg.textContent = '';
  if (!navigator.geolocation) {
    if (explicit) locateMsg.textContent = 'This browser can\'t share your location.';
    return;
  }
  locateBtn.classList.add('busy');
  navigator.geolocation.getCurrentPosition(
    (p) => {
      locateBtn.classList.remove('busy');
      const ll = [p.coords.latitude, p.coords.longitude];
      if (youMarker) youMarker.setLatLng(ll);
      else {
        youMarker = L.circleMarker(ll, { renderer: youRenderer, radius: 7, color: colour('marker-outline'), weight: 2.5, fillColor: colour('you'), fillOpacity: 1, interactive: false }).addTo(map);
      }
      try {
        localStorage.setItem(LAST_SPOT_KEY, JSON.stringify(ll.map((v) => Math.round(v * 100) / 100)));
      } catch {}
      if (!explicit && movedByHand) return;
      map.once('moveend', () => centredOnYou(true)); // registered first: setView to the current view fires moveend at once
      map.setView(ll, Math.max(map.getZoom(), NEAR_ZOOM), { animate: explicit });
    },
    () => {
      locateBtn.classList.remove('busy');
      if (explicit) locateMsg.textContent = 'Couldn\'t get your location. Check that location is allowed for this site and turned on in your device settings.';
    },
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
  );
}

load();
locate(false); // asks once on load; if refused the map stays where it opened (the last spot, or Canada)
setInterval(() => {
  if (!document.hidden) load();
}, REFRESH_MS);
