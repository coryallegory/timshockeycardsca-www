/* The account page's Trade profile and External links panels (markup: apps/web/src/pages/account.ts tradeProfile and
   externalLinks; docs/TRADING-PLAN.md). Loaded by account-page.js once someone is signed in.

   GET /profile fills both panels; a user without a trade id is given one first (POST /profile/trade-id), since every
   user has one (owner, 2026-10-05). The id shows as the profile link, with Copy, a pencil that opens an inline editor
   (checked as you type: shape here, then GET /trade-ids after a pause) and Preview. Each panel saves on its own with
   PUT /profile, which replaces the whole profile: the body is the saved profile with that panel's fields changed, so
   saving one panel never loses (or saves) the other's edits. The area is optional; going public needs only 18+. The
   checks mirror the API's (trade.js); its own answer is shown if it still refuses. All API calls go through account.js. */
import * as account from './account.js?v=d1788456b3';
import { copyLink } from './copy.js?v=d1788456b3';
import { cleanContact, CONTACTS, fsaProblem, profilePath, tradeIdProblem } from './trade.js?v=d1788456b3';

/** How long typing must pause before the trade id is checked with the API. */
const CHECK_MS = 450;

const $ = (id) => document.getElementById(id);
const section = $('trade-profile');
const body = $('tp-body');
const loading = $('tp-loading');
const form = $('tp-form');
const done = $('tp-done');
const errors = $('tp-errors');
const pub = $('tp-public');
const fsaInput = $('tp-fsa');
const fsaMsg = $('tp-fsa-msg');
const adult = $('tp-adult');
const adultMsg = $('tp-adult-msg');
const save = $('tp-save');
const cancel = $('tp-cancel');
// the profile link and its editor
const editButton = $('tp-id-edit');
const editor = $('tp-id-editor');
const idInput = $('tp-id');
const idMsg = $('tp-id-msg');
const idSave = $('tp-id-save');
// External links
const linksForm = $('xl-form');
const linksDone = $('xl-done');
const linksErrors = $('xl-errors');
const linksSave = $('xl-save');
const linksCancel = $('xl-cancel');
const ebayKind = $('tp-ebay-kind');
const contactKeys = CONTACTS.map((c) => c.key);
const FIELD_NAMES = { fsa: 'Area', adult: '18 or older', instagram: 'Instagram', x: 'X', reddit: 'Reddit', ebay: 'eBay', facebook: 'Facebook' };
const ID_INFO = '3 to 8 letters or digits, not case sensitive. Changing it breaks links you\'ve shared.';
const FSA_INFO = 'Nearby, coming later, will list only profiles with an area. The first 3 characters of your postal code, never the whole thing.';
const origin = location.origin.replace(/^https?:\/\//, '');

let saved = null; // the profile as saved (GET, POST or PUT /profile's answer)
let onSessionEnded = () => {};
/** The trade id check: the id it is about and what the API said ({ available, reason? }), or null while unknown. */
let idCheck = null;
let checkTimer;

const show = (el, text) => {
  el.textContent = text;
  el.hidden = !text;
};
const box = (field) => document.querySelector(`.fx[data-field="${field}"]`);
const markField = (field, state) => {
  box(field).classList.toggle('bad', state === 'bad');
  box(field).classList.toggle('good', state === 'good');
};
/** A field's message line: 'info' (grey), 'ok' (green) or 'err' (red). */
function fieldMsg(el, kind, text) {
  el.className = `fmsg ${kind}`;
  el.textContent = text;
  el.hidden = !text;
}
const wasPublic = () => Boolean(saved?.public);

// ---------- the bodies PUT /profile takes ----------
const savedContacts = () => Object.fromEntries(contactKeys.filter((k) => saved.contacts?.[k]).map((k) => [k, saved.contacts[k]]));
/** The saved profile as a body, with `changes`. */
const bodyWith = (changes) => ({
  tradeId: saved.tradeId ?? null,
  fsa: saved.fsa ?? null,
  adult: Boolean(saved.adult),
  public: Boolean(saved.public),
  contacts: savedContacts(),
  ...changes,
});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The Trade profile panel's fields and what's wrong with them (field -> message). */
function readTrade() {
  const problems = {};
  const fsa = fsaInput.value.trim().toUpperCase();
  const p = fsa ? fsaProblem(fsa) : null;
  if (p) problems.fsa = p;
  if (pub.checked && !adult.checked) problems.adult = 'Public profiles are for 18 and over. Tick the box, or keep your profile private.';
  return { changes: { fsa: fsa || null, adult: adult.checked, public: pub.checked }, problems };
}
/** The External links panel's usernames and what's wrong with them. */
function readLinks() {
  const problems = {};
  const contacts = {};
  for (const key of contactKeys) {
    const c = cleanContact(key, $(`tp-${key}`).value);
    if (c.problem) problems[key] = c.problem;
    else if (c.value) contacts[key] = key === 'ebay' ? { name: c.value, kind: ebayKind.value } : c.value;
  }
  return { changes: { contacts }, problems };
}

// ---------- drawing ----------
/** The status chip, the link, Preview: what follows from the saved profile. */
function drawSaved() {
  $('tp-chip-public').hidden = !saved.public;
  $('tp-chip-private').hidden = Boolean(saved.public);
  const id = saved.tradeId;
  $('tp-link-url').textContent = `${origin}/trading?u=${id ?? '…'}`;
  $('tp-copy').disabled = !id;
  editButton.disabled = !id;
  $('tp-preview').hidden = !id;
  if (id) $('tp-preview').href = profilePath(id);
}

/** What follows from the Trade profile panel's state: the switch's text and chips, the link's look, the button. */
function refreshTrade() {
  // The switch needs 18+ first (owner decision): disabled and greyed until the box is ticked; unticking turns it off.
  pub.disabled = !adult.checked;
  if (!adult.checked) pub.checked = false;
  $('tp-switch-row').classList.toggle('locked', !adult.checked);
  const { changes } = readTrade();
  const on = pub.checked;
  $('tp-public-text').textContent = !adult.checked
    ? 'Tick "I\'m 18 or older" above to turn this on. Until then nobody else can see your profile.'
    : on
      ? 'Anyone with your link can see the items below. Your email is never shown.'
      : 'Off: nobody else can see your profile. You can still look at traders\' profiles and follow them.';
  const fsaOk = changes.fsa && !fsaProblem(changes.fsa);
  const visible = [...$('tp-visible').children];
  for (const li of visible) li.classList.toggle('no', !on);
  $('tp-vis-area').hidden = !fsaOk;
  $('tp-vis-area').textContent = fsaOk ? `${changes.fsa} area` : '';
  $('tp-fsa-shown').hidden = !fsaOk;
  $('tp-fsa-shown').textContent = fsaOk ? `Shown as ${changes.fsa} area` : '';
  $('tp-link').classList.toggle('off', !on);
  $('tp-link-label').textContent = on ? 'Your public profile link' : 'Your profile link (it says "This profile isn\'t available" while private)';
  const unlisting = !on && wasPublic();
  $('tp-unlist').hidden = !unlisting;
  save.textContent = unlisting ? 'Save and unlist' : on && !wasPublic() ? 'Save and go public' : 'Save';
  cancel.hidden = same(bodyWith(changes), bodyWith({}));
}
function refreshLinks() {
  const { changes } = readLinks();
  $('tp-ebay-hint').textContent = `Links to ebay.ca/${ebayKind.value}/${$('tp-ebay').value.trim().replace(/^@/, '') || 'your name'}`;
  linksCancel.hidden = same(bodyWith(changes), bodyWith({}));
}

function fsaChanged() {
  fsaInput.value = fsaInput.value.toUpperCase();
  const fsa = fsaInput.value.trim();
  const problem = fsa.length === 3 ? fsaProblem(fsa) : null;
  markField('fsa', problem ? 'bad' : fsa.length === 3 ? 'good' : null);
  fieldMsg(fsaMsg, problem ? 'err' : 'info', problem ?? FSA_INFO);
}

/** Puts the saved profile into the Trade profile panel. */
function fillTrade() {
  pub.checked = Boolean(saved.public);
  fsaInput.value = saved.fsa ?? '';
  adult.checked = Boolean(saved.adult);
  showProblems(errors, {}, ['fsa']);
  show(adultMsg, '');
  fsaChanged();
  refreshTrade();
}
/** Puts the saved usernames into the External links panel. */
function fillLinks() {
  for (const key of contactKeys) {
    const v = saved.contacts?.[key];
    $(`tp-${key}`).value = (key === 'ebay' ? v?.name : v) ?? '';
  }
  ebayKind.value = saved.contacts?.ebay?.kind ?? 'usr';
  showProblems(linksErrors, {}, contactKeys);
  refreshLinks();
}

/**
 * Marks the fields with problems and lists them in the panel's summary (an empty object clears them). `fields` are the
 * panel's marked fields.
 */
function showProblems(summary, problems, fields, intro) {
  for (const key of fields) {
    markField(key, problems[key] ? 'bad' : null);
    if (key !== 'fsa') show($(`tp-${key}-msg`), problems[key] ?? '');
  }
  if (problems.fsa) fieldMsg(fsaMsg, 'err', problems.fsa);
  if (summary === errors) show(adultMsg, problems.adult ?? '');
  const keys = Object.keys(problems);
  summary.replaceChildren();
  summary.hidden = !keys.length;
  if (!keys.length) return;
  summary.append(intro ?? `Fix ${keys.length === 1 ? 'this' : `these ${keys.length} things`} before saving:`);
  const list = document.createElement('ul');
  for (const key of keys) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#tp-${key}`;
    a.textContent = FIELD_NAMES[key] ?? key;
    li.append(a);
    list.append(li);
  }
  summary.append(list);
  summary.focus();
}
/** An API refusal shown in a panel's summary, on the field it names when that's clear. */
function apiProblem(summary, fields, err) {
  const text = account.sentence(err.message);
  const field = /^area/i.test(text) ? 'fsa' : /18 or older/i.test(text) ? 'adult' : contactKeys.find((k) => text.toLowerCase().startsWith(`${FIELD_NAMES[k].toLowerCase()}:`));
  if (field && (fields.includes(field) || field === 'adult')) return showProblems(summary, { [field]: text }, fields);
  showProblems(summary, {}, fields);
  summary.textContent = text;
  summary.hidden = false;
  summary.focus();
}

/** Saves `bodyWith(changes)`; answers whether it saved (errors shown by the caller's `fail`). */
async function put(changes, button, fail) {
  button.disabled = true;
  try {
    saved = await account.saveProfile(bodyWith(changes));
    drawSaved();
    return true;
  } catch (err) {
    if (err.signedOut) onSessionEnded();
    else fail(err);
    return false;
  } finally {
    button.disabled = false;
  }
}

// ---------- the Trade profile panel ----------
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  show(done, '');
  const { changes, problems } = readTrade();
  if (Object.keys(problems).length) {
    return showProblems(errors, problems, ['fsa'], pub.checked ? 'Fix this before your profile can go public:' : undefined);
  }
  const going = changes.public && !wasPublic();
  const unlisting = !changes.public && wasPublic();
  if (!(await put(changes, save, (err) => apiProblem(errors, ['fsa'], err)))) return;
  fillTrade();
  show(done, saved.public
    ? `Saved. ${going ? 'Your profile is public' : 'Your public profile is up to date'} at ${origin}${profilePath(saved.tradeId)}.`
    : unlisting ? 'Saved. Your profile is private: nobody else can see it.' : 'Saved.');
});
fsaInput.addEventListener('input', () => {
  fsaChanged();
  refreshTrade();
});
for (const el of [pub, adult]) el.addEventListener('change', refreshTrade);
pub.addEventListener('change', () => show(done, ''));
cancel.addEventListener('click', () => {
  fillTrade();
  show(done, '');
  pub.focus();
});
$('tp-copy').addEventListener('click', () => {
  if (saved?.tradeId) copyLink(location.origin + profilePath(saved.tradeId));
});

// ---------- the trade id, edited in place ----------
function openEditor(open) {
  editor.hidden = !open;
  editButton.setAttribute('aria-expanded', String(open));
  clearTimeout(checkTimer);
  if (!open) return;
  idInput.value = saved.tradeId ?? '';
  idCheck = null;
  idChanged();
  idInput.focus();
  idInput.select();
}
function idChanged() {
  clearTimeout(checkTimer);
  const id = idInput.value.trim();
  markField('id', null);
  idSave.disabled = false;
  if (!id) return fieldMsg(idMsg, 'info', ID_INFO);
  const problem = tradeIdProblem(id);
  if (problem) {
    markField('id', 'bad');
    return fieldMsg(idMsg, 'err', problem);
  }
  if (saved?.tradeId && saved.tradeId.toLowerCase() === id.toLowerCase()) {
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
async function saveId() {
  const id = idInput.value.trim();
  const problem = tradeIdProblem(id) ?? (idCheck?.id === id.toLowerCase() && !idCheck.available ? account.sentence(idCheck.reason) : null);
  if (problem) {
    markField('id', 'bad');
    fieldMsg(idMsg, 'err', problem);
    return idInput.focus();
  }
  if (id === saved.tradeId) return openEditor(false);
  show(done, '');
  const ok = await put({ tradeId: id }, idSave, (err) => {
    if (err.status === 409) idCheck = { id: id.toLowerCase(), available: false, reason: err.message };
    markField('id', 'bad');
    fieldMsg(idMsg, 'err', account.sentence(err.message));
  });
  if (!ok) return;
  openEditor(false);
  editButton.focus();
  show(done, `Saved. Your profile link is now ${origin}${profilePath(saved.tradeId)}.`);
}
editButton.addEventListener('click', () => openEditor(editor.hidden));
$('tp-id-cancel').addEventListener('click', () => {
  openEditor(false);
  editButton.focus();
});
idSave.addEventListener('click', saveId);
idInput.addEventListener('input', idChanged);
idInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveId();
  } else if (e.key === 'Escape') {
    openEditor(false);
    editButton.focus();
  }
});

// ---------- External links ----------
linksForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  show(linksDone, '');
  const { changes, problems } = readLinks();
  if (Object.keys(problems).length) return showProblems(linksErrors, problems, contactKeys);
  if (!(await put(changes, linksSave, (err) => apiProblem(linksErrors, contactKeys, err)))) return;
  fillLinks();
  show(linksDone, saved.public ? 'Saved. Your links show on your public profile.' : 'Saved. Your links will show once your profile is public.');
});
for (const el of [ebayKind, ...contactKeys.map((k) => $(`tp-${k}`))]) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', refreshLinks);
linksCancel.addEventListener('click', () => {
  fillLinks();
  show(linksDone, '');
});

// ---------- loading ----------
/** Loads the profile into both panels (signed in), giving the user a trade id first if they have none. */
export async function load(sessionEnded) {
  onSessionEnded = sessionEnded;
  body.hidden = true;
  linksForm.hidden = true;
  show(loading, 'Loading your trade profile…');
  try {
    saved = await account.getProfile();
    if (!saved.tradeId) saved = await account.assignTradeId();
  } catch (err) {
    if (err.signedOut) return onSessionEnded();
    if (!saved) return show(loading, `Couldn't load your trade profile. ${account.sentence(err.message)}`);
    show(loading, `Couldn't give you a trade id just now. ${account.sentence(err.message)} Reload the page to try again.`);
  }
  if (saved.tradeId) show(loading, '');
  body.hidden = false;
  linksForm.hidden = false;
  drawSaved();
  openEditor(false);
  fillTrade();
  fillLinks();
  if (location.hash === '#trade-profile') section.scrollIntoView();
  if (location.hash === '#external-links') $('external-links').scrollIntoView();
}

/** Signed out: forgets the profile and empties the panels. */
export function reset() {
  saved = null;
  clearTimeout(checkTimer);
  form.reset();
  linksForm.reset();
  body.hidden = true;
  linksForm.hidden = true;
  editor.hidden = true;
  show(done, '');
  show(linksDone, '');
  errors.hidden = true;
  linksErrors.hidden = true;
}
