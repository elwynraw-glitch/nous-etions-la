import { h, clear, toast } from '../../lib/dom.js';
import { listAllArtworks } from '../../lib/admin-client.js';
import { artworkLink, homeLink, baseWarning, siteBase, download } from '../../lib/qr-links.js';

export async function qrPanel(box) {
  const { default: QRCode } = await import('qrcode');
  const opts = { errorCorrectionLevel: 'Q', margin: 4, color: { dark: '#000000', light: '#FFFFFF' } };   // noir sur blanc : lecture la plus fiable
  let artworks = [];
  try { artworks = (await listAllArtworks()).filter((a) => a.active); } catch (e) { toast(e.message, 'error'); }

  const items = [{ key: 'accueil', label: 'ACCUEIL', title: 'Accueil de l’exposition', link: homeLink() },
    ...artworks.map((a) => ({ key: `oeuvre-${a.id}`, label: `n° ${a.id}`, title: a.title, link: artworkLink(a.id), demo: a.is_demo }))];

  const sheet = h('div', { class: 'qr-sheet' });
  for (const it of items) {
    const svg = await QRCode.toString(it.link, { ...opts, type: 'svg' });
    const holder = h('div', { class: 'qr-holder small-qr', role: 'img', 'aria-label': `QR code ${it.label}` });
    holder.innerHTML = svg;   // SVG fabriqué localement par la bibliothèque
    sheet.append(h('figure', { class: 'qr-card' }, holder,
      h('figcaption', null, h('b', null, it.label), h('br'), it.title, it.demo ? h('br') : null, it.demo ? h('i', null, '(démonstration)') : null),
      h('div', { class: 'no-print qr-dl' },
        h('button', { class: 'btn small', onclick: async () => download(`${it.key}.png`, await QRCode.toDataURL(it.link, { ...opts, width: 1200 })) }, 'PNG'),
        h('button', { class: 'btn small', onclick: () => download(`${it.key}.svg`, new Blob([svg], { type: 'image/svg+xml' })) }, 'SVG'))));
  }

  const warn = baseWarning();
  const print = () => {
    document.body.classList.add('print-qr');
    window.addEventListener('afterprint', () => document.body.classList.remove('print-qr'), { once: true });
    window.print();
  };

  box.append(h('div', { class: 'stack' },
    h('h2', { class: 'no-print' }, 'QR codes'),
    h('p', { class: 'no-print' }, `Adresse utilisée : ${siteBase()}`),
    warn ? h('p', { class: 'note warn no-print' }, warn) : h('p', { class: 'note ok small no-print' }, 'Adresse publique : ces QR codes peuvent être imprimés.'),
    h('p', { class: 'small muted no-print' }, 'Impression : échelle 100 %, noir sur papier blanc mat, 3 cm de côté minimum. Scannez chaque QR code imprimé avec plusieurs téléphones avant de l’accrocher.'),
    h('div', { class: 'actions no-print' }, h('button', { class: 'btn primary', onclick: print }, 'Imprimer la planche')),
    sheet));
}
