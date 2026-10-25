import { h, clear, toast, announce } from '../lib/dom.js';
import { go } from '../lib/router.js';
import { ApiError } from '../lib/api.js';
import * as store from '../lib/store.js';
import { artworkImg } from '../lib/artwork-image.js';

export async function chooseView({ main }) {
  await store.refreshFromServer().catch(() => {});
  const cfg = store.getConfig();
  const st = store.getState();
  const min = store.minCollection();

  // Étape verrouillée
  if (!store.canChoose()) {
    main.append(h('h1', null, 'Cette étape n’est pas encore ouverte'),
      h('p', { class: 'lead' }, `Il faut collecter au moins ${min} photographies différentes. Vous en avez ${store.savedCount()} d’enregistrée${store.savedCount() > 1 ? 's' : ''}.`),
      h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/collection' }, 'Retour à ma collection')));
    return;
  }
  // Déjà posé : le choix est définitif
  if (st.pixel) {
    const art = store.getArtwork(st.choice?.artwork_id);
    main.append(h('h1', null, 'Votre contribution est faite'),
      art ? h('div', { class: 'frame', style: 'max-width:26rem' }, artworkImg(art)) : null,
      h('p', { class: 'lead' }, art ? `Votre photographie préférée : ${art.title}.` : 'Votre pixel est posé.'),
      h('p', null, 'Une fois le pixel posé, le choix ne peut plus être modifié.'),
      h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/mosaique' }, 'Découvrir les autres regards')));
    return;
  }

  const items = st.collection.map((id) => store.getArtwork(id)).filter(Boolean);
  let selected = st.choice?.artwork_id && st.collection.includes(st.choice.artwork_id) ? st.choice.artwork_id : null;
  const maxLen = cfg.max_comment_length;
  const moderated = cfg.moderation_mode === 'pre';

  const root = h('div', { class: 'stack' });
  main.append(root);

  // La galerie n'est construite qu'une fois : changer de photo ne reconstruit que la partie du dessous
  // (le texte déjà tapé est conservé et la navigation au clavier reste stable).
  const draft = { comment: st.choice?.comment || '', consent: Boolean(st.choice?.comment_public) };
  const detail = h('section', { class: 'stack', 'aria-live': 'polite' });
  const form = h('form', { class: 'stack', novalidate: true });
  form.addEventListener('submit', (e) => e.preventDefault());

  form.append(h('fieldset', null,
    h('legend', null, 'Parmi toutes ces images, laquelle vous a le plus marqué ?'),
    h('ul', { class: 'gallery' }, items.map((a) =>
      h('li', null, h('label', { class: 'pick' },
        h('input', { type: 'radio', name: 'fav', value: a.id, checked: selected === a.id, onchange: () => {
          const first = !selected; selected = a.id; renderDetail();
          if (first) setTimeout(() => document.getElementById('why')?.focus(), 40);
        } }),
        h('figure', { class: 'plate' },
          h('div', { class: 'frame' }, artworkImg(a)),
          h('figcaption', null, h('span', null, h('span', { class: 'num' }, a.id), ' ', a.title)))))))),
    detail);

  function renderDetail() {
    clear(detail);
    if (!selected) return;
    const art = store.getArtwork(selected);
    const ta = h('textarea', { id: 'why', maxlength: String(maxLen), 'aria-describedby': 'why-help why-count', placeholder: 'Quelques mots, si vous le souhaitez.' });
    ta.value = draft.comment;
    const consent = h('input', { type: 'checkbox', id: 'consent' });
    consent.checked = draft.consent;
    const count = h('p', { class: 'count', id: 'why-count' }, `0 / ${maxLen}`);
    const warn = h('p', { class: 'note warn small', hidden: true }, 'Sans votre autorisation de publication, ce commentaire ne sera pas conservé. Cochez la case pour le partager, ou continuez sans commentaire.');
    const err = h('p', { class: 'note err', role: 'alert', hidden: true });
    const sync = () => {
      draft.comment = ta.value; draft.consent = consent.checked;
      count.textContent = `${ta.value.length} / ${maxLen}`;
      warn.hidden = !(ta.value.trim() && !consent.checked);
    };
    ta.addEventListener('input', sync); consent.addEventListener('change', sync);

    async function submit(withComment) {
      err.hidden = true;
      const btns = detail.querySelectorAll('button'); btns.forEach((b) => (b.disabled = true));
      try {
        const r = await store.saveChoice(selected, withComment ? ta.value : '', withComment && consent.checked);
        done(r.comment_status, withComment && ta.value.trim() !== '' && !consent.checked);
      } catch (e) {
        btns.forEach((b) => (b.disabled = false));
        err.hidden = false; err.textContent = e instanceof ApiError ? e.message : 'Enregistrement impossible. Réessayez.';
        err.scrollIntoView({ block: 'center' }); announce(err.textContent);
      }
    }

    detail.append(
      h('div', { class: 'frame', style: 'max-width:26rem' }, artworkImg(art, { eager: true })),
      h('p', { class: 'meta' }, `Votre choix : n° ${art.id} — ${art.title}`),
      h('label', { class: 'field', for: 'why' }, 'Pourquoi cette photographie ?'),
      h('p', { class: 'small muted', id: 'why-help', style: 'margin:0' }, 'Facultatif. Sans lien, adresse e-mail ni numéro de téléphone.'),
      ta, count,
      h('label', { class: 'check', for: 'consent' }, consent,
        h('span', null, 'J’autorise la publication anonyme de ce commentaire dans la mosaïque.', moderated ? ' Il sera relu avant d’apparaître.' : '')),
      warn, err,
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => submit(false) }, 'Continuer sans commenter'),
        h('button', { type: 'button', class: 'btn primary', onclick: () => submit(true) }, 'Valider mon choix')));
    sync();
  }

  function done(status, discarded) {
    clear(root);
    const msg = status === 'pending' ? 'Votre commentaire est enregistré. Il apparaîtra dans la mosaïque après relecture.'
      : status === 'approved' ? 'Votre commentaire est enregistré et sera visible dans la mosaïque.'
      : discarded ? 'Votre choix est enregistré. Votre commentaire n’a pas été conservé, faute d’autorisation de publication.'
      : 'Votre choix est enregistré.';
    announce(msg);
    root.append(h('h1', null, 'Choix enregistré'), h('p', { class: 'note ok' }, msg),
      h('p', { class: 'lead' }, 'Dernière étape : posez votre pixel dans la mosaïque commune.'),
      h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/mosaique' }, 'Poser mon pixel'), h('a', { class: 'btn', href: '#/collection' }, 'Ma collection')));
    window.scrollTo(0, 0);
  }

  root.append(h('h1', { class: 'sr-only' }, 'Choisir ma photographie préférée'), form);
  renderDetail();
}
