import { h, clear, toast, announce } from '../lib/dom.js';
import { go } from '../lib/router.js';
import { ApiError } from '../lib/api.js';
import * as store from '../lib/store.js';
import { artworkImg } from '../lib/artwork-image.js';

export async function artworkView({ main, route }) {
  const art = store.getArtwork(route.id);
  if (!art) {
    main.append(
      h('h1', null, 'Photographie introuvable'),
      h('p', { class: 'lead' }, 'Ce QR code ne correspond à aucune photographie de l’exposition, ou elle a été retirée.'),
      h('p', null, 'Essayez de scanner de nouveau le QR code placé sous la photographie. Si le problème continue, signalez-le à l’accueil de la médiathèque.'),
      h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/collection' }, 'Ma collection'), h('a', { class: 'btn', href: '#/' }, 'Accueil')));
    return;
  }
  document.title = `${art.title} — NOUS ÉTIONS LÀ`;
  const min = store.minCollection();
  const zone = h('div', { class: 'stack', 'aria-live': 'polite' });

  function paint(message) {
    clear(zone);
    const saved = store.savedCount(), pending = store.pendingCount();
    const here = store.getState().collection.includes(art.id);
    const waiting = store.isPending(art.id);

    if (here) zone.append(h('p', { class: 'note ok' }, message || 'Cette photographie est enregistrée dans votre collection.'));
    else if (waiting) zone.append(h('p', { class: 'note warn' }, 'Pas encore enregistrée : la connexion est indisponible. La photographie est gardée sur cet appareil et sera envoyée dès que possible.'));

    if (!here) {
      zone.append(h('div', { class: 'actions' },
        h('button', { class: 'btn primary', id: 'add', onclick: add }, waiting ? 'Réessayer l’enregistrement' : 'Ajouter à ma collection')));
    }
    const left = Math.max(0, min - saved);
    zone.append(h('p', { class: 'meta' },
      saved >= min ? `Vous avez collecté ${saved} photographies. L’étape suivante est ouverte.`
        : `${saved} sur ${min} photographies collectées${pending ? ` (+ ${pending} en attente)` : ''}. Encore ${left} pour débloquer la suite.`));
    zone.append(h('div', { class: 'actions' },
      h('a', { class: 'btn', href: '#/scanner' }, 'Scanner une autre photographie'),
      h('a', { class: 'btn', href: '#/collection' }, 'Retour à ma collection'),
      saved >= min ? h('a', { class: 'btn primary', href: '#/choix' }, 'Choisir ma photographie préférée') : null));
  }

  async function add() {
    const btn = zone.querySelector('#add'); if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
    try {
      const r = await store.addArtwork(art.id);
      if (r.status === 'pending') {
        // Le serveur n'a PAS confirmé : on ne dit jamais « enregistrée », ni à l'écran ni aux lecteurs d'écran.
        const msg = 'Pas encore enregistrée : connexion indisponible. La photographie est gardée sur cet appareil et sera envoyée dès que possible.';
        toast('Connexion indisponible : photographie gardée sur cet appareil, pas encore enregistrée.', 'error');
        paint(); announce(msg);
      } else {
        const msg = r.status === 'already' ? 'Cette photographie était déjà dans votre collection : rien n’a été ajouté en double.' : 'Photographie ajoutée et enregistrée.';
        paint(msg); announce(msg);
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Erreur inattendue.', 'error'); paint();
    }
  }

  main.append(
    h('a', { class: 'back', href: '#/collection' }, 'Ma collection'),
    h('article', { class: 'stack' },
      h('figure', { class: 'plate' },
        h('div', { class: 'frame' }, artworkImg(art, { eager: true })),
        h('figcaption', null, h('span', { class: 'num' }, `n° ${art.id}`), h('span', { class: 'muted' }, 'Photographie'))),
      h('h1', null, art.title),
      (art.taken_on || art.location) ? h('p', { class: 'meta' }, [art.taken_on, art.location].filter(Boolean).join(' — ')) : null,
      art.caption ? h('p', { class: 'caption' }, art.caption) : null,
      art.is_demo ? h('p', { class: 'demo-note' }, 'Image et texte de démonstration : à remplacer par la photographie réelle avant l’exposition.') : null,
      zone));
  // Si la photo était déjà dans la collection au moment du scan, on le dit tout de suite
  paint(store.getState().collection.includes(art.id) ? 'Cette photographie est déjà dans votre collection.' : undefined);
}
