import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/source-serif-4';
import './styles.css';

import { h, clear, toast } from './lib/dom.js';
import { isConfigured, ApiError } from './lib/api.js';
import { parseHash } from './lib/router.js';
import * as store from './lib/store.js';
import { startLive } from './lib/live.js';

import { homeView } from './views/home.js';
import { artworkView } from './views/artwork.js';
import { collectionView } from './views/collection.js';
import { chooseView } from './views/choose.js';
import { mosaicView } from './views/mosaic.js';
import { restoreView } from './views/restore.js';
import { privacyView } from './views/privacy.js';
import { scannerView } from './views/scanner.js';

const app = document.getElementById('app');
let cleanup = null;

// Pour savoir si l'utilisateur navigue au clavier (afficher le curseur de la grille)
window.addEventListener('keydown', (e) => { if (e.key === 'Tab') document.documentElement.dataset.input = 'keyboard'; });
window.addEventListener('pointerdown', () => { document.documentElement.dataset.input = 'pointer'; });

function shell(route) {
  const nav = h('nav', { class: 'nav', 'aria-label': 'Navigation principale' },
    h('a', { href: '#/scanner', 'aria-current': route.name === 'scanner' ? 'page' : null }, 'Scanner'),
    h('a', { href: '#/collection', 'aria-current': route.name === 'collection' ? 'page' : null }, 'Ma collection'),
    h('a', { href: '#/mosaique', 'aria-current': route.name === 'mosaic' ? 'page' : null }, 'Mosaïque'));
  const bar = h('header', { class: 'bar' }, h('a', { class: 'brand', href: '#/' }, 'NOUS ÉTIONS LÀ'), nav);
  const main = h('main', { id: 'main', tabindex: '-1', class: route.name === 'mosaic' ? 'wide' : route.name === 'admin' ? 'admin' : null });
  const foot = h('footer', { class: 'foot' },
    h('span', null, 'Une exposition de elwyn.raw'),
    h('a', { href: '#/confidentialite' }, 'Confidentialité et données'));
  return { nodes: [bar, main, foot], main };
}

function setupScreen() {
  clear(app);
  app.append(h('div', { class: 'setup stack' },
    h('h1', null, 'Configuration à terminer'),
    h('p', null, 'Le site est installé, mais il n’est pas encore relié à sa base de données Supabase.'),
    h('ol', null,
      h('li', null, 'Copiez le fichier ', h('code', null, '.env.example'), ' en ', h('code', null, '.env'), '.'),
      h('li', null, 'Renseignez-y l’adresse et la clé publique de votre projet Supabase.'),
      h('li', null, 'Relancez ', h('code', null, 'npm run dev'), '.')),
    h('p', { class: 'muted' }, 'Le détail pas à pas se trouve dans le fichier README.md.')));
}

async function render() {
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  const route = parseHash();
  document.body.classList.toggle('kiosk', Boolean(route.kiosk));
  const { nodes, main } = shell(route);
  clear(app); app.append(...nodes);
  const ctx = { main, route };
  const views = { admin: (c) => import('./views/admin/index.js').then((m) => m.adminView(c)), home: homeView, artwork: artworkView, collection: collectionView, choose: chooseView, mosaic: mosaicView, restore: restoreView, scanner: scannerView, privacy: privacyView };
  const view = views[route.name];
  document.title = 'NOUS ÉTIONS LÀ — exposition photographique';
  if (!view) {
    main.append(h('h1', null, 'Page introuvable'),
      h('p', { class: 'lead' }, 'Ce QR code ou ce lien ne correspond à aucune page de l’exposition.'),
      h('p', null, h('a', { class: 'btn primary', href: '#/' }, 'Retour à l’accueil')));
    return;
  }
  cleanup = (await view(ctx)) || null;
  window.scrollTo(0, 0);
  if (route.name !== 'mosaic') main.focus({ preventScroll: true });
}

async function boot() {
  if (!isConfigured) return setupScreen();
  clear(app);
  app.append(h('p', { class: 'muted', style: 'padding:1.5rem' }, 'Chargement…'));
  try {
    await Promise.all([store.loadConfig(), store.loadArtworks()]);
  } catch (e) {
    clear(app);
    app.append(h('div', { class: 'setup stack' },
      h('h1', null, 'Connexion impossible'),
      h('p', null, e instanceof ApiError ? e.message : 'Le site n’arrive pas à joindre son serveur.'),
      h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Réessayer')));
    return;
  }
  startLive();                          // mosaïque en direct
  store.syncPending().catch(() => {});  // envoie les photos restées « en attente »
  window.addEventListener('online', () => { store.syncPending().then(() => toast('Connexion rétablie.')).catch(() => {}); });
  window.addEventListener('hashchange', render);
  await render();
}
boot();
