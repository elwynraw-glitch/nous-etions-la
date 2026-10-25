import { h, clear, toast } from '../../lib/dom.js';
import { rpc } from '../../lib/api.js';
import { adminRpc, getSettings } from '../../lib/admin-client.js';
import { download } from '../../lib/qr-links.js';

async function loadMosaic() {
  const [cfg, cells] = await Promise.all([rpc('public_config'), rpc('get_cells', { p_after_id: 0 })]);
  return { size: cfg.grid_size, palette: cfg.palette, cells: cells.cells };
}

function render(canvas, size, cells, px, emptyColor) {
  canvas.width = canvas.height = size * px;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = emptyColor || '#0D0D0D';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const [, x, y, color] of cells) { ctx.fillStyle = color; ctx.fillRect(x * px, y * px, px, px); }
}

export async function mosaicAdminPanel(box, ctx) {
  const settings = await getSettings();
  let open = settings.contributions_open === true;
  const m = await loadMosaic();
  const total = m.size * m.size;

  // Aperçu
  const preview = h('canvas', { class: 'adm-preview', role: 'img', 'aria-label': `Aperçu de la mosaïque : ${m.cells.length} pixels sur ${total}` });
  render(preview, m.size, m.cells, 10, '#262626');
  preview.style.width = '100%'; preview.style.maxWidth = '30rem'; preview.style.aspectRatio = '1';

  // Ouverture / fermeture des contributions
  const stateEl = h('p', { class: 'note', role: 'status' });
  const toggle = h('button', { class: 'btn', onclick: async () => {
    toggle.disabled = true;
    try {
      await adminRpc('admin_set_setting', { p_key: 'contributions_open', p_value: !open });
      open = !open; paintState(); toast(open ? 'Contributions ouvertes.' : 'Contributions fermées.');
    } catch (e) { toast(e.message, 'error'); }
    toggle.disabled = false;
  } });
  function paintState() {
    stateEl.className = 'note ' + (open ? 'ok' : 'warn');
    stateEl.textContent = open ? 'Les visiteurs peuvent poser leur pixel.' : 'Les contributions sont FERMÉES : les visiteurs voient la mosaïque mais ne peuvent plus poser de pixel.';
    toggle.textContent = open ? 'Fermer les contributions' : 'Rouvrir les contributions';
    toggle.className = 'btn' + (open ? '' : ' primary');
  }
  paintState();

  // Export HD
  const sizeSel = h('select', { id: 'exp-size' }, h('option', { value: '50' }, `${m.size * 50} × ${m.size * 50} px (aperçu)`), h('option', { value: '100', selected: true }, `${m.size * 100} × ${m.size * 100} px (impression)`), h('option', { value: '200' }, `${m.size * 200} × ${m.size * 200} px (très grand format)`));
  const emptySel = h('select', { id: 'exp-empty' }, h('option', { value: '#0D0D0D' }, 'Noir'), h('option', { value: '#262626' }, 'Gris sombre'), h('option', { value: '#F0EDE6' }, 'Blanc cassé'));
  const expBtn = h('button', { class: 'btn primary', onclick: async () => {
    expBtn.disabled = true;
    try {
      const fresh = await loadMosaic();   // toujours l'état le plus récent
      const c = document.createElement('canvas');
      render(c, fresh.size, fresh.cells, Number(sizeSel.value), emptySel.value);
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      if (!blob) throw new Error('Image trop grande pour ce navigateur : choisissez une taille plus petite.');
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      download(`mosaique-nous-etions-la-${stamp}.png`, blob);
      toast(`Mosaïque exportée (${fresh.cells.length} pixels).`);
    } catch (e) { toast(e.message || 'Export impossible.', 'error'); }
    expBtn.disabled = false;
  } }, 'Exporter la mosaïque en PNG');

  box.append(h('div', { class: 'stack' },
    h('h2', null, 'Mosaïque'),
    h('p', { class: 'counter', style: 'margin:0' }, h('b', null, String(m.cells.length)), ` pixels posés sur ${total} (${Math.round((m.cells.length / total) * 1000) / 10} %)`),
    preview,
    h('h3', null, 'Contributions'), stateEl, h('div', { class: 'actions' }, toggle),
    h('h3', null, 'Affichage à la médiathèque'),
    h('p', { class: 'small muted', style: 'margin:0' }, 'Ouvre la mosaïque seule, en grand, sans menu, avec les pixels qui apparaissent en direct.'),
    h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/mosaique/plein-ecran', target: '_blank', rel: 'noopener' }, 'Ouvrir l’affichage plein écran')),
    h('h3', null, 'Image haute résolution'),
    h('div', null, h('label', { class: 'field', for: 'exp-size' }, 'Taille'), sizeSel),
    h('div', null, h('label', { class: 'field', for: 'exp-empty' }, 'Couleur des cases encore vides'), emptySel),
    h('div', { class: 'actions' }, expBtn)));
}
