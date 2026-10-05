/* The /reset-password page (built only with API_URL): the emailed link brings the reset token in `?token=`. It is read
   once and removed from the address bar straight away (history.replaceState), so it isn't left in the history entry, a
   bookmark or a copied URL; the page also sends no referrer. Submitting posts it with the new password through
   account.js; on success this browser is signed in (the header shows it), and the page links to Collection. */
import * as account from './account.js';
import * as header from './header-account.js';

const $ = (id) => document.getElementById(id);
const form = $('reset-form');
const error = $('reset-error');
const password = $('reset-password');
const confirm = $('reset-confirm');
const submit = $('reset-submit');
const done = $('reset-done');

const token = new URLSearchParams(location.search).get('token');
if (location.search) history.replaceState(null, '', location.pathname);

function showError(text) {
  error.textContent = text;
  error.hidden = !text;
}

if (!token) {
  showError('This page needs the link from your reset email. Open the link in the email again, or ask for a new one.');
  submit.disabled = true;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  if (password.value.length < 8 || password.value.length > 128) {
    showError('Your new password must be 8 to 128 characters.');
    password.focus();
    return;
  }
  if (confirm.value !== password.value) {
    showError("The two passwords don't match.");
    confirm.focus();
    return;
  }
  submit.disabled = true;
  try {
    const res = await account.resetPassword(token, password.value);
    header.signedIn(res.email);
    form.reset();
    form.hidden = true;
    $('reset-email').textContent = res.email;
    done.hidden = false;
    $('reset-done-title').focus();
  } catch (err) {
    showError(account.sentence(err.message));
    submit.disabled = false;
  }
});
