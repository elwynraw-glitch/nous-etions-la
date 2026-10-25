import { h, clear, toast, announce, plural } from '../lib/dom.js';
import { go } from '../lib/router.js';
import { rpc, ApiError } from '../lib/api.js';
import * as store from '../lib/store.js';
import { MosaicGrid } from '../lib/grid.js';
import { onLive, toList, cellCount, getStatus, refreshNow } from '../lib/live.js';
import { artworkImg } from '../lib/artwork-image.js';

const STATUS_TEXT = {
  connecting: 'Connexion…',
  live: 'En direct',
  offline: 'Hors ligne : mise à jour toutes les 30 secondes',
};

export async function mosaicView({ main, route }) {
  const kiosk = route.kiosk;
  try { await store.loadConfig(); } catch { /* on garde les réglages déjà chargés */ }
  await store.refreshFromServer().catch(() => {});
  const cfg = store.getConfig();
  const size = cfg.grid_size, total = size * size;
  const palette = cfg.palette;
  let color = (palette.find((p) => /bleu électrique/i.test(p.name)) || palette[0]).hex;

  // ----- En-tête avec compteurs -----
  const nCount = h('b'), nFree = h('b');
  const status = h('span', { class: 'status', role: 'status' });
  const counters = h('p', { class: 'counter', style: 'margin:0' }, nCount, ' ', h('span', { class: 'lbl-n' }), ' · ', nFree, ' ', h('span', { class: 'lbl-f' }));
  const lblN = counters.querySelector('.lbl-n'), lblF = counters.querySelector('.lbl-f');
  const head = h('div', { class: 'mosaic-head' },
    h('h1', null, 'Mosaïque collective'),
    counters, status,
    kiosk ? h('a', { href: '#/mosaique', class: 'small' }, 'Quitter l’affichage plein écran') : null);

  function refreshCounters() {
    const n = cellCount(), free = total - n;
    nCount.textContent = String(n); nFree.textContent = String(free);
    lblN.textContent = plural(n, 'pixel posé', 'pixels posés');
    lblF.textContent = plural(free, 'case libre', 'cases libres');
  }
  function refreshStatus() { const s = getStatus(); status.dataset.s = s; status.textContent = STATUS_TEXT[s]; }

  // ----- Grille -----
  const wrap = h('div', { class: 'grid-wrap' });
  const grid = new MosaicGrid(wrap, {
    size,
    onTap: (x, y) => tap(x, y),
    onCursor: (x, y) => announce(`Colonne ${x + 1}, ligne ${y + 1}, ${grid.has(x, y) ? 'case occupée' : 'case libre'}`),
  });
  const tools = h('div', { class: 'grid-tools' },
    h('button', { class: 'btn', 'aria-label': 'Zoomer', onclick: () => grid.zoomBy(1.5) }, '+'),
    h('button', { class: 'btn', 'aria-label': 'Dézoomer', onclick: () => grid.zoomBy(1 / 1.5) }, '−'),
    h('button', { class: 'btn', 'aria-label': 'Voir toute la mosaïque', onclick: () => grid.fit() }, '▢'),
    h('button', { class: 'btn', 'aria-label': 'Plein écran', onclick: toggleFullscreen }, '⛶'));
  wrap.append(tools);
  grid.setCells(toList());
  const st0 = store.getState();
  if (st0.pixel) grid.setMine({ x: st0.pixel.x, y: st0.pixel.y });

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else (kiosk ? document.documentElement : wrap).requestFullscreen?.().catch(() => toast('Le plein écran n’est pas disponible sur cet appareil.', 'error'));
  }

  // ----- Panneau d'action -----
  const panel = h('section', { class: 'panel', 'aria-label': 'Contribution' });
  function mode() {
    const st = store.getState();
    if (st.pixel) return 'placed';
    if (!cfg.contributions_open) return 'closed';
    if (cellCount() >= total) return 'full';
    if (!store.canChoose()) return 'need-collection';
    if (!st.choice) return 'need-choice';
    return 'place';
  }

  function renderPanel() {
    if (kiosk) return;
    clear(panel);
    updateInfoFn = null;
    const m = mode(); shownMode = m;
    const link = (href, text, primary) => h('a', { class: 'btn small' + (primary ? ' primary' : ''), href }, text);
    if (m === 'placed') {
      panel.append(h('p', null, 'Votre pixel est posé (entouré en pointillés). Touchez un autre pixel pour découvrir le regard d’un autre visiteur.'),
        h('button', { class: 'btn small', onclick: () => { const p = store.getState().pixel; grid.focusCell(p.x, p.y); } }, 'Retrouver mon pixel'),
        ' ', h('a', { class: 'btn small', href: '#/mosaique/plein-ecran', onclick: () => setTimeout(() => document.documentElement.requestFullscreen?.().catch(() => {}), 50) }, 'Affichage plein écran'));
    } else if (m === 'closed') {
      panel.append(h('p', null, 'Les nouvelles contributions sont fermées pour le moment. Vous pouvez toujours explorer la mosaïque.'));
    } else if (m === 'full') {
      panel.append(h('p', null, 'La mosaïque est complète : toutes les cases sont occupées. Merci à toutes et à tous. Touchez un pixel pour découvrir un regard.'));
    } else if (m === 'need-collection') {
      const n = store.savedCount(), min = store.minCollection();
      panel.append(h('p', null, `Pour poser un pixel, collectez d’abord ${min} photographies différentes (${n} pour l’instant). En attendant, touchez un pixel pour découvrir le regard d’un autre visiteur.`),
        link('#/collection', 'Ma collection', true));
    } else if (m === 'need-choice') {
      panel.append(h('p', null, 'Presque ! Choisissez d’abord la photographie qui vous a le plus marqué.'), link('#/choix', 'Choisir ma photographie préférée', true));
    } else {
      renderPlacement();
    }
  }

  const sel = { x: null, y: null };
  let updateInfoFn = null;       // met à jour le texte du panneau sans le reconstruire (garde le focus clavier)
  let shownMode = null;
  function renderPlacement() {
    const free = total - cellCount();
    const picked = sel.x !== null;
    const swatches = palette.map((p) => h('label', { class: 'swatch', title: p.name },
      h('input', { type: 'radio', name: 'color', value: p.hex, 'aria-label': p.name, checked: p.hex === color, onchange: () => { color = p.hex; grid.setPreviewColor(color); updateInfo(); } }),
      h('span', { style: `background:${p.hex}` })));
    const info = h('p', { id: 'pick-info', 'aria-live': 'polite' });
    const confirm = h('button', { class: 'btn primary', id: 'confirm', disabled: !picked, onclick: confirmPixel }, 'Confirmer mon pixel');
    function updateInfo() {
      const name = palette.find((p) => p.hex === color)?.name || '';
      info.textContent = sel.x === null
        ? `Touchez une case libre pour y poser votre pixel. ${free} ${plural(free, 'case reste', 'cases restent')} libre${free > 1 ? 's' : ''}.`
        : `Case choisie : colonne ${sel.x + 1}, ligne ${sel.y + 1}, en ${name.toLowerCase()}. Vous ne pourrez plus la modifier.`;
      confirm.disabled = sel.x === null;
    }
    panel.append(info, h('fieldset', { class: 'palette' }, h('legend', { class: 'sr-only' }, 'Couleur du pixel'), swatches),
      h('div', { class: 'actions' }, confirm, sel.x !== null ? h('button', { class: 'btn', onclick: () => { clearSel(); } }, 'Changer de case') : null));
    updateInfo();
    updateInfoFn = updateInfo;
  }
  function clearSel() { sel.x = sel.y = null; grid.clearSelection(); renderPanel(); }

  async function confirmPixel() {
    if (sel.x === null) return;
    const btn = panel.querySelector('#confirm'); btn.disabled = true; btn.textContent = 'Enregistrement…';
    const { x, y } = sel;
    try {
      await store.placePixel(x, y, color);
      sel.x = sel.y = null; grid.clearSelection();
      grid.setCell(x, y, color); grid.setMine({ x, y }); grid.focusCell(x, y, Math.max(grid.scale, 14));
      refreshNow(); refreshCounters();
      renderPanel();
      announce('Votre pixel est posé.'); toast('Votre pixel est posé. Merci !');
    } catch (e) {
      if (e.code === 'cell_taken') {
        sel.x = sel.y = null; grid.clearSelection();   // avant la mise à jour, pour ne pas déclencher un second message
        await refreshNow();
      } else if (e.code === 'already_placed') {
        await store.refreshFromServer(); const p = store.getState().pixel; if (p) grid.setMine({ x: p.x, y: p.y });
      }
      toast(e instanceof ApiError ? e.message : 'Erreur inattendue.', 'error');
      announce(e instanceof ApiError ? e.message : 'Erreur inattendue.');
      renderPanel();
    }
  }

  function tap(x, y) {
    if (grid.has(x, y)) { showDetail(x, y); return; }
    const m = mode();
    if (m !== 'place') { toast(hint(m)); return; }
    sel.x = x; sel.y = y;
    grid.select(x, y, color);
    renderPanel();
    announce(`Case colonne ${x + 1}, ligne ${y + 1} choisie.`);
  }
  function hint(m) {
    return { placed: 'Vous avez déjà posé votre pixel.', closed: 'Les contributions sont fermées.', full: 'La mosaïque est complète.',
      'need-collection': 'Collectez d’abord des photographies pour pouvoir poser un pixel.', 'need-choice': 'Choisissez d’abord votre photographie préférée.' }[m] || '';
  }

  // ----- Regard d'un autre visiteur -----
  async function showDetail(x, y) {
    const dlg = h('dialog', { 'aria-labelledby': 'dlg-title' });
    const body = h('div', { class: 'sheet' }, h('p', { class: 'muted' }, 'Chargement…'));
    dlg.append(body); document.body.append(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); grid.canvas.focus({ preventScroll: true }); });
    dlg.showModal();
    const mine = store.getState().pixel && store.getState().pixel.x === x && store.getState().pixel.y === y;
    try {
      const d = await rpc('get_cell_detail', { p_x: x, p_y: y });
      clear(body);
      if (!d) { body.append(h('p', null, 'Cette case est libre.'), closeBtn(dlg)); return; }
      const swatch = h('span', { style: `display:inline-block;width:1.1em;height:1.1em;background:${d.color};border:1px solid var(--blanc-doux);vertical-align:-0.15em` });
      body.append(h('h2', { id: 'dlg-title' }, mine ? 'Votre regard' : 'Le regard d’un autre visiteur'));
      if (d.removed || !d.artwork) {
        body.append(h('p', null, swatch, ' Ce visiteur a demandé la suppression de ses données : sa photographie et son commentaire ne sont plus affichés.'));
      } else {
        const a = { ...d.artwork };
        body.append(
          h('p', { class: 'meta', style: 'margin:0' }, swatch, mine ? ' Voici la photographie que vous avez choisie.' : ' Voici la photographie qui l’a le plus marqué.'),
          h('div', { class: 'frame' }, artworkImg(a, { eager: true })),
          h('p', { style: 'margin:0' }, h('b', null, `n° ${a.id} — ${a.title}`), (a.taken_on || a.location) ? h('span', { class: 'meta' }, ` · ${[a.taken_on, a.location].filter(Boolean).join(', ')}`) : null),
          d.comment ? h('blockquote', { class: 'viewer-quote' }, d.comment) : h('p', { class: 'muted' }, 'Ce visiteur n’a pas publié de commentaire.'));
        if (d.comment && !mine) {
          const rep = h('button', { class: 'btn small', onclick: async () => {
            rep.disabled = true;
            try { await rpc('report_comment', { p_x: x, p_y: y }); toast('Merci, le signalement a été transmis.'); rep.textContent = 'Signalé'; }
            catch (e) { rep.disabled = false; toast(e.message, 'error'); }
          } }, 'Signaler ce commentaire');
          body.append(rep);
        }
      }
      body.append(h('p', { class: 'small muted', style: 'margin:0' }, 'Les contributions sont anonymes : rien ne permet d’identifier leur auteur.'), closeBtn(dlg));
    } catch (e) {
      clear(body); body.append(h('p', { class: 'note err' }, e instanceof ApiError ? e.message : 'Impossible de charger ce regard.'), closeBtn(dlg));
    }
  }
  const closeBtn = (dlg) => h('button', { class: 'btn', onclick: () => dlg.close(), autofocus: true }, 'Fermer');

  // ----- Assemblage et temps réel -----
  main.append(h('div', { class: 'mosaic-page' }, head, wrap, kiosk ? null : panel));
  refreshCounters(); refreshStatus(); renderPanel();
  grid.resize();

  const off = onLive((ev) => {
    if (ev.type === 'insert') {
      grid.setCell(ev.x, ev.y, ev.color, ev.live);
      if (sel.x === ev.x && sel.y === ev.y && !(store.getState().pixel && store.getState().pixel.x === ev.x && store.getState().pixel.y === ev.y)) {
        toast('Cette case vient d’être prise : choisissez-en une autre.', 'error'); clearSel();
      }
      refreshCounters();
      if (mode() !== shownMode) renderPanel(); else updateInfoFn?.();
    } else if (ev.type === 'delete') { grid.removeCell(ev.x, ev.y); refreshCounters(); }
    else if (ev.type === 'reset') { grid.setCells(toList()); refreshCounters(); }
    else if (ev.type === 'status') refreshStatus();
  });

  let wake = null;
  if (kiosk) navigator.wakeLock?.request('screen').then((w) => { wake = w; }).catch(() => {});

  return () => { off(); grid.destroy(); wake?.release?.().catch(() => {}); document.body.classList.remove('kiosk'); if (document.fullscreenElement) document.exitFullscreen?.(); };
}
