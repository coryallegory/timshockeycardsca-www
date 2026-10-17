/* The /contact page (built only with API_URL): sends the message through account.js. Arriving from "Report this profile"
   (`?about=<trade id>`, a valid id only) selects the Report topic, names the profile and starts the message. The
   hidden `site` field is a spam trap: people never see it, so anything in it is sent along for the API to drop. */
import * as account from './account.js?v=3628ae002f';
import { TRADE_ID } from './trade.js?v=3628ae002f';

const $ = (id) => document.getElementById(id);
const form = $('contact-form');
const error = $('contact-error');
const topic = $('contact-topic');
const message = $('contact-message');
const reply = $('contact-reply');
const submit = $('contact-submit');

const asked = new URLSearchParams(location.search).get('about');
const about = asked && TRADE_ID.test(asked) ? asked : '';
if (about) {
  topic.value = 'report';
  $('contact-about-id').textContent = about;
  $('contact-about').hidden = false;
  message.value = 'What is wrong with this profile: ';
}
// Only a profile report names its profile: any other topic drops the line and the trade id.
const reporting = () => Boolean(about) && topic.value === 'report';
topic.addEventListener('change', () => { $('contact-about').hidden = !reporting(); });

function showError(text) {
  error.textContent = text;
  error.hidden = !text;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  if (!message.value.trim()) {
    showError('Write a message first.');
    message.focus();
    return;
  }
  submit.disabled = true;
  try {
    await account.sendContact({
      topic: topic.value,
      message: message.value,
      ...(reply.value.trim() ? { reply: reply.value } : {}),
      ...(reporting() ? { about } : {}),
      site: $('contact-site').value,
    });
    form.hidden = true;
    $('contact-sent').hidden = false;
    $('contact-sent-title').focus();
  } catch (err) {
    showError(account.sentence(err.message));
    submit.disabled = false;
  }
});
