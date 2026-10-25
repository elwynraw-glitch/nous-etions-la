import { h, toast } from '../lib/dom.js';
import { go } from '../lib/router.js';
import { ApiError } from '../lib/api.js';
import { isValidCode, normalizeCode, formatCode } from '../lib/code.js';
import * as store from '../lib/store.js';

export async function restoreView({ main }) {
  const input = h('input', { type: 'text', class: 'code', id: 'code', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', inputmode: 'text', maxlength: '24', 'aria-describedby': 'code-help', placeholder: 'XXXX-XXXX-XXXX-XXXX' });
  const err = h('p', { class: 'note err', role: 'alert', hidden: true });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Retrouver ma collection');
  input.addEventListener('input', () => { const n = normalizeCode(input.value).slice(0, 16); input.value = formatCode(n); err.hidden = true; });

  const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    if (!isValidCode(input.value)) { err.hidden = false; err.textContent = 'Le code compte 16 caractères (lettres et chiffres), par exemple ABCD-EFGH-2345-6789.'; return; }
    btn.disabled = true; btn.textContent = 'Recherche…';
    try {
      await store.restoreFromCode(input.value);
      toast('Collection retrouvée.');
      go('/collection');
    } catch (er) {
      btn.disabled = false; btn.textContent = 'Retrouver ma collection';
      err.hidden = false; err.textContent = er instanceof ApiError ? er.message : 'Erreur inattendue.';
    }
  } },
    h('label', { class: 'field', for: 'code' }, 'Code de récupération'),
    h('p', { class: 'small muted', id: 'code-help', style: 'margin:0' }, 'Les majuscules, minuscules, espaces et tirets n’ont pas d’importance.'),
    input, err, h('div', { class: 'actions' }, btn, h('a', { class: 'btn', href: '#/collection' }, 'Commencer à zéro')));

  main.append(h('div', { class: 'stack' },
    h('h1', null, 'Reprendre mon parcours'),
    h('p', { class: 'lead' }, 'Saisissez le code de récupération que vous avez noté pour retrouver votre collection sur cet appareil.'),
    form,
    h('p', { class: 'small muted' }, 'Code perdu ? Il ne peut pas être retrouvé : il n’est lié à aucun nom ni adresse e-mail. Vous pouvez recommencer une collection ; la photographie déjà posée dans la mosaïque restera, mais vous ne pourrez plus la modifier.')));
  input.focus();
}
