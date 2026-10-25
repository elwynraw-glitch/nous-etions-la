import { h, plural } from '../lib/dom.js';
import { go } from '../lib/router.js';
import * as store from '../lib/store.js';
import { onLive, getCells, cellCount, getStatus } from '../lib/live.js';

function drawPreview(canvas, size) {
  const px = canvas.clientWidth || 300;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.height = Math.round(px * dpr);
  const ctx = canvas.getContext('2d');
  const s = canvas.width / size;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    ctx.fillStyle = '#1d1d1d'; ctx.fillRect(x * s, y * s, s - 0.6 * dpr, s - 0.6 * dpr);
  }
  for (const c of getCells().values()) { ctx.fillStyle = c.color; ctx.fillRect(c.x * s, c.y * s, s - 0.6 * dpr, s - 0.6 * dpr); }
}

export async function homeView({ main }) {
  const cfg = store.getConfig();
  const size = cfg.grid_size, total = size * size;
  const count = h('b', null, String(cellCount()));
  const counter = h('p', { class: 'counter' }, count, ' ', h('span', { class: 'cnt-label' }), h('span', { class: 'muted' }, ` sur ${total}`));
  const label = counter.querySelector('.cnt-label');
  const refreshCount = () => { const n = cellCount(); count.textContent = String(n); label.textContent = plural(n, 'pixel posé', 'pixels posés'); };
  refreshCount();

  const canvas = h('canvas', { role: 'img', 'aria-label': 'Aperçu de la mosaïque collective' });
  const mosaicLink = h('a', { class: 'hero-mosaic', href: '#/mosaique', 'aria-label': 'Voir la mosaïque collective' }, canvas);

  const s = store.getState();
  const hasStarted = store.hasSession() && (store.savedCount() + store.pendingCount()) > 0;

  main.append(
    h('section', { class: 'hero' },
      h('div', { class: 'stack' },
        h('h1', { class: 'title-xl' }, 'NOUS', h('br'), 'ÉTIONS', h('br'), 'LÀ'),
        h('p', { class: 'lead' }, 'Exposition photographique documentaire sur les manifestations d’octobre 2026.')),
      h('div', { class: 'stack' }, mosaicLink, counter)),
    h('section', { class: 'stack', style: 'margin-top:2rem' },
      h('p', null, 'Sous chaque photographie, un QR code : scannez-le pour la garder dans votre collection. Après trois photographies, choisissez celle qui vous a le plus marqué, dites pourquoi si vous le souhaitez, puis posez un pixel dans la mosaïque commune. En touchant les pixels des autres, vous découvrez leurs regards.'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onclick: () => go('/collection') }, hasStarted ? `Ma collection (${store.savedCount() + store.pendingCount()})` : 'Commencer ma collection'),
        h('a', { class: 'btn', href: '#/scanner' }, 'Scanner un QR code'),
        h('button', { class: 'btn', onclick: () => go(store.hasSession() ? '/collection' : '/reprendre') }, 'Reprendre mon parcours'),
        h('a', { class: 'btn', href: '#/mosaique' }, 'Voir la mosaïque collective')),
      store.hasSession() ? null : h('p', { class: 'small muted' }, 'Pas de compte, pas d’adresse e-mail. Votre collection est gardée sur ce téléphone ; un code de récupération permet de la retrouver ailleurs.')));

  requestAnimationFrame(() => drawPreview(canvas, size));
  const off = onLive((ev) => {
    if (ev.type === 'insert' || ev.type === 'delete' || ev.type === 'reset') { refreshCount(); drawPreview(canvas, size); }
  });
  const onResize = () => drawPreview(canvas, size);
  window.addEventListener('resize', onResize);
  return () => { off(); window.removeEventListener('resize', onResize); };
}
