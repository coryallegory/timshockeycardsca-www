/* Checklist search: filters cards by player, number or team as you type. */
(() => {
  'use strict';
  const print = document.getElementById('print-checklist');
  print?.addEventListener('click', () => window.print());

  const q = document.getElementById('q');
  if (!q) return;
  const items = [...document.querySelectorAll('.cards li[data-q]')];
  const subsets = [...document.querySelectorAll('.subset')];
  const groups = [...document.querySelectorAll('.group')];
  const none = document.getElementById('noresults');

  function apply() {
    const terms = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    for (const li of items) li.hidden = terms.length > 0 && !terms.every((t) => li.dataset.q.includes(t));
    for (const s of subsets) s.hidden = terms.length > 0 && !s.querySelector('.cards li:not([hidden])');
    for (const g of groups) g.hidden = terms.length > 0 && !g.querySelector('.subset:not([hidden])');
    none.hidden = !terms.length || items.some((li) => !li.hidden);
  }
  q.addEventListener('input', apply);
})();
