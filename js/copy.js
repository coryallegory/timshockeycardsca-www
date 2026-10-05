/* Copying a link, with a short "Link copied" toast (the page's #toast; .toast in components.css). Used by the Trading
   page and the account page's Trade profile. No API calls. */

const toast = document.getElementById('toast');
const SHOW_MS = 1800;
let timer;

/** Shows `text` briefly at the bottom of the screen (also announced: the toast is a status line). */
export function showToast(text) {
  toast.textContent = text;
  toast.classList.add('on');
  clearTimeout(timer);
  timer = setTimeout(() => toast.classList.remove('on'), SHOW_MS);
}

/** Copies `url` to the clipboard and says so (or says to copy it by hand where the clipboard is refused). */
export async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    showToast('Link copied');
  } catch {
    showToast(`Couldn't copy. The link is ${url}`);
  }
}
