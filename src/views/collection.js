import { h, clear, toast, plural } from '../lib/dom.js';
import { go } from '../lib/router.js';
import { ApiError } from '../lib/api.js';
import { formatCode } from '../lib/code.js';
import * as store from '../lib/store.js';
import { artworkImg } from '../lib/artwork-image.js';

export async function collectionView({ main }) {
  await store.refreshFromServer().catch(() => {});   // met à jour depuis le serveur si possible
  const min = store.minCollection();
  const root = h('div', { class: 'stack' });
  main.append(root);

  function paint() {
    clear(root);
    const st = store.getState();
    const saved = store.savedCount(), pending = store.pendingCount();
    const ids = [...st.collection, ...st.pending.filter((id) => !st.collection.includes(id))];
    const items = ids.map((id) => store.getArtwork(id)).filter(Boolean);

    root.append(h('h1', null, 'Ma collection'));

    // Progression vers le minimum requis
    const segs = Array.from({ length: min }, (_, i) => h('i', { class: i < saved ? 'on' : i < saved + pending ? 'wait' : '' }));
    root.append(h('div', null,
      h('p', { class: 'counter', style: 'margin:0' }, h('b', null, String(saved)), ` ${plural(saved, 'photographie collectée', 'photographies collectées')} sur ${min} nécessaires`),
      h('div', { class: 'progress', role: 'img', 'aria-label': `${saved} sur ${min} photographies collectées` }, segs),
      pending ? h('p', { class: 'note warn small' }, `${pending} ${plural(pending, 'photographie est', 'photographies sont')} en attente d’enregistrement (connexion indisponible). ` , h('button', { class: 'btn small', onclick: retry }, 'Réessayer maintenant')) : null));

    // Étape suivante
    if (st.pixel) {
      root.append(h('p', { class: 'note ok' }, 'Votre pixel est posé dans la mosaïque. Merci d’avoir participé.'),
        h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/mosaique' }, 'Découvrir les autres regards')));
    } else if (saved >= min) {
      root.append(h('div', { class: 'actions' },
        st.choice
          ? h('a', { class: 'btn primary', href: '#/mosaique' }, 'Poser mon pixel')
          : h('a', { class: 'btn primary', href: '#/choix' }, 'Choisir ma photographie préférée'),
        st.choice ? h('a', { class: 'btn', href: '#/choix' }, 'Modifier mon choix') : null));
    } else {
      root.append(h('p', null, saved + pending === 0
        ? 'Rien pour l’instant. Scannez le QR code placé sous une photographie de l’exposition pour l’ajouter ici.'
        : `Scannez encore ${Math.max(0, min - saved)} ${plural(min - saved, 'photographie', 'photographies')} différente${min - saved > 1 ? 's' : ''} pour débloquer l’étape suivante.`),
        h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/scanner' }, 'Scanner un QR code')));
    }

    if (items.length) {
      root.append(h('ul', { class: 'gallery' }, items.map((a) =>
        h('li', null, h('a', { href: `#/oeuvre/${a.id}` },
          h('figure', { class: 'plate' },
            h('div', { class: 'frame' }, artworkImg(a)),
            h('figcaption', null, h('span', null, h('span', { class: 'num' }, a.id), ' ', a.title),
              st.pixel === null && st.choice?.artwork_id === a.id ? h('span', { class: 'badge' }, 'Préférée') : null,
              store.isPending(a.id) ? h('span', { class: 'badge' }, 'En attente') : null)))))));
    }

    root.append(recoveryBlock(), dataBlock());
  }

  async function retry() {
    try { await store.syncPending(); paint(); } catch (e) { toast(e.message, 'error'); }
  }

  function recoveryBlock() {
    const st = store.getState();
    if (!st.code) return h('p', { class: 'small muted' }, 'Votre code de récupération sera créé dès la première photographie ajoutée.');
    const pretty = formatCode(st.code);
    const copy = async () => {
      try { await navigator.clipboard.writeText(pretty); toast('Code copié.'); } catch { toast('Copie impossible : recopiez le code à la main.', 'error'); }
    };
    return h('details', null,
      h('summary', null, 'Mon code de récupération'),
      h('div', { class: 'stack', style: 'padding-top:0.5rem' },
        h('p', null, 'Ce code permet de retrouver votre collection sur un autre téléphone ou après avoir vidé le navigateur. Notez-le ou prenez-le en photo. Il n’est conservé nulle part ailleurs : sans lui, personne, pas même l’organisateur, ne peut vous le redonner.'),
        h('div', { class: 'codebox', 'aria-label': 'Code de récupération' }, pretty),
        h('p', { class: st.registered ? 'note ok small' : 'note warn small' }, st.registered
          ? 'Ce code est bien enregistré sur le serveur : il fonctionnera sur un autre appareil.'
          : 'Ce code n’est pas encore enregistré sur le serveur (connexion indisponible). Il ne fonctionnera sur un autre appareil qu’une fois la connexion rétablie.'),
        h('button', { class: 'btn', onclick: copy }, 'Copier le code')));
  }

  function dataBlock() {
    const st = store.getState();
    if (!st.code) return null;
    const dlg = h('dialog', { 'aria-labelledby': 'del-title' });
    const removePixel = h('input', { type: 'checkbox', id: 'rm-px' });
    const err = h('p', { class: 'note err', hidden: true });
    dlg.append(h('div', { class: 'sheet' },
      h('h2', { id: 'del-title' }, 'Supprimer mes données ?'),
      h('p', null, 'Votre collection, votre photographie préférée et votre commentaire seront définitivement effacés du serveur, et votre code ne fonctionnera plus.'),
      st.pixel ? h('label', { class: 'check', for: 'rm-px' }, removePixel, h('span', null, 'Libérer aussi ma case dans la mosaïque. Sinon, elle reste en place comme une case colorée anonyme, sans photographie ni commentaire.')) : null,
      err,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: () => dlg.close() }, 'Annuler'),
        h('button', { class: 'btn danger', onclick: async (e) => {
          e.target.disabled = true;
          try { await store.deleteMyData(removePixel.checked); dlg.close(); toast('Vos données ont été supprimées.'); go('/'); }
          catch (er) { e.target.disabled = false; err.hidden = false; err.textContent = er instanceof ApiError ? er.message : 'Suppression impossible.'; }
        } }, 'Supprimer définitivement'))));
    const leave = h('dialog', { 'aria-labelledby': 'leave-title' },
      h('div', { class: 'sheet' },
        h('h2', { id: 'leave-title' }, 'Quitter ce parcours sur cet appareil ?'),
        h('p', null, 'Ce téléphone oubliera votre collection, mais vos données restent enregistrées. Vous pourrez les retrouver avec votre code de récupération. Vérifiez que vous l’avez noté.'),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', onclick: () => leave.close() }, 'Annuler'),
          h('button', { class: 'btn primary', onclick: () => { store.forgetThisDevice(); leave.close(); go('/'); } }, 'Quitter sur cet appareil'))));
    return h('details', null,
      h('summary', null, 'Mes données'),
      h('div', { class: 'stack', style: 'padding-top:0.5rem' },
        h('p', null, 'Vous pouvez à tout moment supprimer vos données, ou simplement quitter ce parcours sur cet appareil (par exemple sur un téléphone prêté).'),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', onclick: () => leave.showModal() }, 'Quitter sur cet appareil'),
          h('button', { class: 'btn danger', onclick: () => dlg.showModal() }, 'Supprimer mes données')),
        h('p', { class: 'small' }, h('a', { href: '#/confidentialite' }, 'Lire la politique de confidentialité')),
        dlg, leave));
  }

  paint();
  return store.subscribe(() => {});   // pas de re-rendu automatique : l'écran reste stable pendant la lecture
}
