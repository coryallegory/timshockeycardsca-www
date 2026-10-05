/* The account page's Trade profile section (markup: apps/web/src/pages/account.ts tradeProfile; docs/TRADING-PLAN.md).
   Loaded by account-page.js once someone is signed in: GET /profile fills the form, PUT /profile saves it whole. The
   public switch lists what becomes visible; the trade id is checked as you type (shape here, then GET /trade-ids after a
   pause); the area, 18+ and contact usernames are checked here by the API's rules (trade.js) before saving, and the
   API's own answer is shown if it still refuses. Save is named by what it does: Save, Save and go public, Save and
   unlist. All API calls go through account.js. */
import * as account from './account.js?v=1c5474a3c2';
import { copyLink } from './copy.js?v=1c5474a3c2';
import { cleanContact, CONTACTS, fsaProblem, profilePath, TRADE_ID, tradeIdProblem } from './trade.js?v=1c5474a3c2';

/** How long typing must pause before the trade id is checked with the API. */
const CHECK_MS = 450;

const $ = (id) => document.getElementById(id);
const section = $('trade-profile');
const form = $('tp-form');
const loading = $('tp-loading');
const done = $('tp-done');
const errors = $('tp-errors');
const pub = $('tp-public');
const idInput = $('tp-id');
const idMsg = $('tp-id-msg');
const fsaInput = $('tp-fsa');
const fsaMsg = $('tp-fsa-msg');
const adult = $('tp-adult');
const adultMsg = $('tp-adult-msg');
const ebayKind = $('tp-ebay-kind');
const save = $('tp-save');
const cancel = $('tp-cancel');
const contactKeys = CONTACTS.map((c) => c.key);
const FIELD_NAMES = { id: 'Trade id', fsa: 'Area', adult: '18 or older', instagram: 'Instagram', x: 'X', reddit: 'Reddit', ebay: 'eBay', facebook: 'Facebook' };
const ID_INFO = '3 to 8 letters or digits, not case sensitive. Changing it later breaks links you\'ve shared.';
const FSA_INFO = 'The first 3 characters of your postal code, never the whole thing.';

let saved = null; // the profile as saved (GET or PUT /profile's answer)
let onSessionEnded = () => {};
/** The trade id check: the id it is about and what the API said ({ available, reason? }), or null while unknown. */
let idCheck = null;
let checkTimer;

const show = (el, text) => {
  el.textContent = text;
  el.hidden = !text;
};
const box = (field) => form.querySelector(`.fx[data-field="${field}"]`);
const markField = (field, state) => {
  box(field).classList.toggle('bad', state === 'bad');
  box(field).classList.toggle('good', state === 'good');
};
/** A field's message line: 'info' (grey), 'ok' (green, with a tick) or 'err' (red). */
function fieldMsg(el, kind, text) {
  el.className = `fmsg ${kind}`;
  el.textContent = text;
  el.hidden = !text;
}
const wasPublic = () => Boolean(saved?.public);
const origin = location.origin.replace(/^https?:\/\//, '');

/** The form's values as the API takes them, and what's wrong (field -> message) by the same rules. */
function read() {
  const problems = {};
  const tradeId = idInput.value.trim();
  const fsa = fsaInput.value.trim().toUpperCase();
  const goingPublic = pub.checked;
  if (tradeId || goingPublic) {
    const p = tradeIdProblem(tradeId);
    if (p) problems.id = goingPublic && !tradeId ? 'A public profile needs a trade id.' : p;
    else if (idCheck && idCheck.id === tradeId.toLowerCase() && !idCheck.available) problems.id = account.sentence(idCheck.reason);
  }
  if (fsa || goingPublic) {
    const p = fsaProblem(fsa);
    if (p) problems.fsa = goingPublic && !fsa ? 'A public profile needs your area: the first 3 characters of your postal code.' : p;
  }
  if (goingPublic && !adult.checked) problems.adult = 'Public profiles are for 18 and over. Tick the box, or keep your profile private.';
  const contacts = {};
  for (const key of contactKeys) {
    const c = cleanContact(key, $(`tp-${key}`).value);
    if (c.problem) problems[key] = c.problem;
    else if (c.value) contacts[key] = key === 'ebay' ? { name: c.value, kind: ebayKind.value } : c.value;
  }
  const body = { tradeId: tradeId || null, fsa: fsa || null, adult: adult.checked, public: goingPublic, contacts };
  return { body, problems };
}

/** The saved profile as the form's body, to tell whether anything changed. */
const savedBody = () => ({
  tradeId: saved.tradeId ?? null,
  fsa: saved.fsa ?? null,
  adult: Boolean(saved.adult),
  public: Boolean(saved.public),
  contacts: Object.fromEntries(contactKeys.filter((k) => saved.contacts?.[k]).map((k) => [k, saved.contacts[k]])),
});
const sameBody = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Everything that follows from the form's state: the switch's text and chips, the link, the button, the hints. */
function refresh() {
  const { body } = read();
  const on = pub.checked;
  $('tp-public-text').textContent = on
    ? 'Anyone with your link can see the items below. Your email is never shown.'
    : 'Off: nobody else can see your profile. You can still look at traders\' profiles and follow them.';
  for (const li of $('tp-visible').children) li.classList.toggle('no', !on);
  const fsaOk = body.fsa && !fsaProblem(body.fsa);
  $('tp-vis-area').textContent = fsaOk ? `${body.fsa} area` : 'Your area';
  $('tp-fsa-shown').hidden = !fsaOk;
  $('tp-fsa-shown').textContent = fsaOk ? `Shown as ${body.fsa} area` : '';
  // The link: the id as typed; Preview opens the saved one (the owner's preview works while private).
  const idOk = body.tradeId && TRADE_ID.test(body.tradeId);
  $('tp-link-url').textContent = `${origin}/trading?u=${idOk ? body.tradeId : '…'}`;
  $('tp-link').classList.toggle('off', !on);
  $('tp-link-label').textContent = on ? 'Your public link' : 'Your link (it says "This profile isn\'t available" while private)';
  $('tp-copy').disabled = !idOk;
  const preview = $('tp-preview');
  preview.hidden = !saved?.tradeId;
  if (saved?.tradeId) preview.href = profilePath(saved.tradeId);
  $('tp-ebay-hint').textContent = `Links to ebay.ca/${ebayKind.value}/${$('tp-ebay').value.trim().replace(/^@/, '') || 'your name'}`;
  const unlisting = !on && wasPublic();
  $('tp-unlist').hidden = !unlisting;
  save.textContent = unlisting ? 'Save and unlist' : on && !wasPublic() ? 'Save and go public' : 'Save';
  cancel.hidden = sameBody(body, savedBody());
}

// ---------- the trade id, checked as you type ----------
function idChanged() {
  clearTimeout(checkTimer);
  const id = idInput.value.trim();
  markField('id', null);
  if (!id) return fieldMsg(idMsg, 'info', ID_INFO);
  const problem = tradeIdProblem(id);
  if (problem) {
    markField('id', 'bad');
    return fieldMsg(idMsg, 'err', problem);
  }
  if (saved?.tradeId && saved.tradeId.toLowerCase() === id.toLowerCase()) {
    idCheck = { id: id.toLowerCase(), available: true };
    markField('id', 'good');
    return fieldMsg(idMsg, 'ok', '✓ Yours · 3 to 8 letters or digits, not case sensitive');
  }
  if (idCheck?.id === id.toLowerCase()) return showIdCheck();
  fieldMsg(idMsg, 'info', 'Checking…');
  checkTimer = setTimeout(() => checkId(id), CHECK_MS);
}
async function checkId(id) {
  try {
    const res = await account.checkTradeId(id);
    if (idInput.value.trim() !== id) return; // typed on since
    idCheck = { id: id.toLowerCase(), ...res };
    showIdCheck();
  } catch (err) {
    if (err.signedOut) return onSessionEnded();
    if (idInput.value.trim() === id) fieldMsg(idMsg, 'info', `Couldn't check it just now: ${account.sentence(err.message)} Saving will tell you.`);
  }
}
function showIdCheck() {
  markField('id', idCheck.available ? 'good' : 'bad');
  fieldMsg(idMsg, idCheck.available ? 'ok' : 'err', idCheck.available ? '✓ Available · 3 to 8 letters or digits, not case sensitive' : account.sentence(idCheck.reason));
}

function fsaChanged() {
  fsaInput.value = fsaInput.value.toUpperCase();
  const fsa = fsaInput.value.trim();
  const problem = fsa.length === 3 ? fsaProblem(fsa) : null;
  markField('fsa', problem ? 'bad' : fsa.length === 3 ? 'good' : null);
  fieldMsg(fsaMsg, problem ? 'err' : 'info', problem ?? FSA_INFO);
}

// ---------- filling, saving ----------
/** Puts the saved profile into the form and clears every message. */
function fill() {
  pub.checked = Boolean(saved.public);
  idInput.value = saved.tradeId ?? '';
  fsaInput.value = saved.fsa ?? '';
  adult.checked = Boolean(saved.adult);
  for (const key of contactKeys) {
    const v = saved.contacts?.[key];
    $(`tp-${key}`).value = (key === 'ebay' ? v?.name : v) ?? '';
  }
  ebayKind.value = saved.contacts?.ebay?.kind ?? 'usr';
  $('tp-chip-public').hidden = !saved.public;
  $('tp-chip-private').hidden = Boolean(saved.public);
  showProblems({});
  idCheck = null;
  idChanged();
  fsaChanged();
  refresh();
}

/** Marks the fields with problems and lists them above the form (an empty object clears them). */
function showProblems(problems, intro) {
  for (const key of ['id', 'fsa', ...contactKeys]) markField(key, problems[key] ? 'bad' : null);
  for (const key of contactKeys) show($(`tp-${key}-msg`), problems[key] ?? '');
  show(adultMsg, problems.adult ?? '');
  if (problems.id) fieldMsg(idMsg, 'err', problems.id);
  if (problems.fsa) fieldMsg(fsaMsg, 'err', problems.fsa);
  const keys = Object.keys(problems);
  errors.replaceChildren();
  errors.hidden = !keys.length;
  if (!keys.length) return;
  errors.append(intro ?? `Fix ${keys.length === 1 ? 'this' : `these ${keys.length} things`} before saving:`);
  const list = document.createElement('ul');
  for (const key of keys) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${key === 'id' ? 'tp-id' : `tp-${key}`}`;
    a.textContent = FIELD_NAMES[key];
    li.append(a);
    list.append(li);
  }
  errors.append(list);
  errors.focus();
}

/** The API refused (400 / 409 / 429): its message, on the field it is about when that's clear. */
function apiProblem(err) {
  const text = account.sentence(err.message);
  const field = err.status === 409 || /trade id/i.test(text) && !/public profile/i.test(text) ? 'id'
    : /^area/i.test(text) ? 'fsa'
      : /18 or older/i.test(text) ? 'adult'
        : contactKeys.find((k) => text.toLowerCase().startsWith(`${FIELD_NAMES[k].toLowerCase()}:`));
  if (field) showProblems({ [field]: text });
  else {
    showProblems({});
    errors.textContent = text;
    errors.hidden = false;
    errors.focus();
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  show(done, '');
  const { body, problems } = read();
  if (Object.keys(problems).length) return showProblems(problems, pub.checked ? `Fix ${Object.keys(problems).length === 1 ? 'this' : `these ${Object.keys(problems).length} things`} before your profile can go public:` : undefined);
  const going = body.public && !wasPublic();
  const unlisting = !body.public && wasPublic();
  save.disabled = true;
  try {
    saved = await account.saveProfile(body);
    fill();
    show(done, saved.public
      ? `Saved. ${going ? 'Your profile is public' : 'Your public profile is up to date'} at ${origin}${profilePath(saved.tradeId)}.`
      : unlisting ? 'Saved. Your profile is private: nobody else can see it.' : 'Saved.');
  } catch (err) {
    if (err.signedOut) return onSessionEnded();
    if (err.status === 409) idCheck = { id: body.tradeId.toLowerCase(), available: false, reason: err.message };
    apiProblem(err);
  } finally {
    save.disabled = false;
  }
});

idInput.addEventListener('input', () => {
  idChanged();
  refresh();
});
fsaInput.addEventListener('input', () => {
  fsaChanged();
  refresh();
});
for (const el of [pub, adult, ebayKind, ...contactKeys.map((k) => $(`tp-${k}`))]) el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', refresh);
pub.addEventListener('change', () => show(done, ''));
cancel.addEventListener('click', () => {
  fill();
  show(done, '');
  pub.focus();
});
$('tp-copy').addEventListener('click', () => {
  const id = idInput.value.trim();
  if (TRADE_ID.test(id)) copyLink(location.origin + profilePath(id));
});

/** Loads the profile into the section (signed in). `sessionEnded` runs on a 401. */
export async function load(sessionEnded) {
  onSessionEnded = sessionEnded;
  form.hidden = true;
  show(loading, 'Loading your trade profile…');
  try {
    saved = await account.getProfile();
  } catch (err) {
    if (err.signedOut) return onSessionEnded();
    show(loading, `Couldn't load your trade profile. ${account.sentence(err.message)}`);
    return;
  }
  show(loading, '');
  form.hidden = false;
  fill();
  if (location.hash === '#trade-profile') section.scrollIntoView();
}

/** Signed out: forgets the profile and empties the form. */
export function reset() {
  saved = null;
  clearTimeout(checkTimer);
  form.reset();
  form.hidden = true;
  show(done, '');
  showProblems({});
}
