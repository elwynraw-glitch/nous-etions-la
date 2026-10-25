import { h, clear, toast } from '../../lib/dom.js';
import { ApiError } from '../../lib/api.js';
import { listAllArtworks, insertArtwork, updateArtwork, deleteArtworkRow, uploadImage, removeImage } from '../../lib/admin-client.js';
import { resizeToJpeg } from '../../lib/image-resize.js';
import { artworkImg } from '../../lib/artwork-image.js';
import { artworkLink, baseWarning, download } from '../../lib/qr-links.js';

export async function photosPanel(box, ctx) {
  let artworks = [];
  const listEl = h('div', { class: 'adm-list' });

  const addsOf = (id) => ctx.stats?.adds_per_artwork?.find((a) => a.id === id)?.adds ?? 0;
  const nextId = () => {
    const nums = artworks.map((a) => parseInt(a.id, 10)).filter((n) => !Number.isNaN(n));
    return String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
  };

  async function load() {
    try { artworks = await listAllArtworks(); } catch (e) { toast(e.message, 'error'); }
    paint();
  }

  function paint() {
    clear(listEl);
    if (!artworks.length) listEl.append(h('p', { class: 'muted' }, 'Aucune photographie. Ajoutez la première.'));
    for (const a of artworks) {
      listEl.append(h('article', { class: 'adm-row' + (a.active ? '' : ' off') },
        h('div', { class: 'adm-thumb' }, artworkImg(a)),
        h('div', { class: 'adm-info' },
          h('h3', null, `n° ${a.id} — ${a.title}`),
          h('p', { class: 'meta', style: 'margin:0' }, [a.taken_on, a.location].filter(Boolean).join(' — ') || 'Date et lieu non renseignés'),
          h('p', { class: 'small', style: 'margin:0.3rem 0 0' },
            a.is_demo ? h('span', { class: 'badge' }, 'Démonstration') : null, ' ',
            !a.active ? h('span', { class: 'badge' }, 'Masquée') : null, ' ',
            !a.image_path ? h('span', { class: 'badge' }, 'Sans image') : null, ' ',
            h('span', { class: 'muted' }, `${addsOf(a.id)} ajout${addsOf(a.id) > 1 ? 's' : ''} en collection`))),
        h('div', { class: 'adm-actions' },
          h('button', { class: 'btn small', onclick: () => openForm(a) }, 'Modifier'),
          h('button', { class: 'btn small', onclick: () => openQr(a) }, 'QR code'),
          h('button', { class: 'btn small danger', onclick: () => confirmDelete(a) }, 'Supprimer'))));
    }
  }

  // ---------- Formulaire ajout / modification ----------
  function openForm(art) {
    const isNew = !art;
    const f = {
      id: h('input', { type: 'text', id: 'f-id', value: art?.id || nextId(), readonly: !isNew, maxlength: '32', 'aria-describedby': 'f-id-h' }),
      title: h('input', { type: 'text', id: 'f-title', value: art?.title || '', maxlength: '200', required: true }),
      date: h('input', { type: 'text', id: 'f-date', value: art?.taken_on || '', maxlength: '100', placeholder: 'ex. 17 octobre 2026' }),
      place: h('input', { type: 'text', id: 'f-place', value: art?.location || '', maxlength: '200' }),
      caption: h('textarea', { id: 'f-cap', maxlength: '1500' }),
      file: h('input', { type: 'file', id: 'f-file', accept: 'image/jpeg,image/png,image/webp' }),
      demo: h('input', { type: 'checkbox', id: 'f-demo' }),
      active: h('input', { type: 'checkbox', id: 'f-active' }),
    };
    f.caption.value = art?.caption || '';
    f.demo.checked = art ? art.is_demo : false;
    f.active.checked = art ? art.active : true;

    const preview = h('div', { class: 'frame', style: 'max-width:18rem' }, art ? artworkImg(art) : h('p', { class: 'muted small', style: 'padding:1rem' }, 'Aucune image choisie'));
    f.file.addEventListener('change', () => {
      const file = f.file.files[0]; clear(preview);
      if (file) { const img = h('img', { class: 'art-img', alt: 'Aperçu de l’image choisie' }); img.src = URL.createObjectURL(file); preview.append(img); }
    });
    const err = h('p', { class: 'note err', role: 'alert', hidden: true });
    const dlg = h('dialog', { 'aria-labelledby': 'f-h' });
    const saveBtn = h('button', { class: 'btn primary', type: 'submit' }, isNew ? 'Ajouter la photographie' : 'Enregistrer');

    const form = h('form', { class: 'sheet', novalidate: true, onsubmit: async (e) => {
      e.preventDefault(); err.hidden = true;
      const id = f.id.value.trim().toLowerCase();
      if (!/^[a-z0-9-]{1,32}$/.test(id)) return fail('Le numéro ne peut contenir que des chiffres, lettres minuscules et tirets (ex. 007).');
      if (!f.title.value.trim()) return fail('Le titre est obligatoire.');
      saveBtn.disabled = true; saveBtn.textContent = 'Enregistrement…';
      let newPath = null;
      try {
        if (f.file.files[0]) {
          const { blob } = await resizeToJpeg(f.file.files[0]);
          newPath = await uploadImage(blob, id);
        }
        const row = { title: f.title.value.trim(), taken_on: f.date.value.trim() || null, location: f.place.value.trim() || null,
          caption: f.caption.value.trim() || null, is_demo: f.demo.checked, active: f.active.checked };
        if (newPath) row.image_path = newPath;
        if (isNew) await insertArtwork({ id, ...row, image_path: newPath });
        else { await updateArtwork(art.id, row); if (newPath) await removeImage(art.image_path); }
        dlg.close(); toast(isNew ? 'Photographie ajoutée.' : 'Modifications enregistrées.');
        await ctx.reloadStats(); await load();
      } catch (er) {
        if (newPath) await removeImage(newPath);   // on ne laisse pas d'image orpheline
        saveBtn.disabled = false; saveBtn.textContent = isNew ? 'Ajouter la photographie' : 'Enregistrer';
        fail(er instanceof ApiError ? er.message : er.message || 'Enregistrement impossible.');
      }
    } },
      h('h2', { id: 'f-h' }, isNew ? 'Ajouter une photographie' : `Modifier la photographie n° ${art.id}`),
      h('div', null, h('label', { class: 'field', for: 'f-id' }, 'Numéro (celui du QR code)'), f.id,
        h('p', { class: 'small muted', id: 'f-id-h', style: 'margin:0.3rem 0 0' }, isNew ? 'Sert d’adresse (…/#/oeuvre/001). Impossible à changer ensuite : le QR code imprimé en dépend.' : 'Non modifiable : le QR code imprimé en dépend.')),
      h('div', null, h('label', { class: 'field', for: 'f-title' }, 'Titre'), f.title),
      h('div', null, h('label', { class: 'field', for: 'f-date' }, 'Date (facultatif)'), f.date),
      h('div', null, h('label', { class: 'field', for: 'f-place' }, 'Lieu (facultatif)'), f.place),
      h('div', null, h('label', { class: 'field', for: 'f-cap' }, 'Légende documentaire (facultatif)'), f.caption),
      h('div', null, h('label', { class: 'field', for: 'f-file' }, art?.image_path ? 'Remplacer l’image' : 'Image'), f.file,
        h('p', { class: 'small muted', style: 'margin:0.3rem 0 0' }, 'JPEG, PNG ou WebP. Elle est réduite à 1800 px de large et ses métadonnées (GPS, appareil, date) sont supprimées. Le site ne conserve pas l’original.')),
      preview,
      h('label', { class: 'check', for: 'f-active' }, f.active, h('span', null, 'Visible par les visiteurs (décochez pour masquer sans supprimer)')),
      h('label', { class: 'check', for: 'f-demo' }, f.demo, h('span', null, 'Contenu de démonstration (à remplacer avant l’exposition)')),
      err,
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Annuler'), saveBtn));
    function fail(msg) { err.hidden = false; err.textContent = msg; err.scrollIntoView({ block: 'nearest' }); }
    dlg.append(form); document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
  }

  // ---------- Suppression ----------
  function confirmDelete(a) {
    const n = addsOf(a.id);
    const dlg = h('dialog', { 'aria-labelledby': 'd-h' });
    const err = h('p', { class: 'note err', hidden: true });
    dlg.append(h('div', { class: 'sheet' },
      h('h2', { id: 'd-h' }, `Supprimer la photographie n° ${a.id} ?`),
      h('p', null, `« ${a.title} » sera retirée définitivement, y compris des collections des visiteurs (${n} ajout${n > 1 ? 's' : ''}). Le QR code imprimé n’ouvrira plus rien. Les pixels déjà posés restent, mais ceux dont c’était la photo préférée perdent leur photo.`),
      h('p', { class: 'muted' }, 'Pour simplement la retirer de l’exposition, préférez la masquer (Modifier → décocher « Visible »).'),
      err,
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => dlg.close() }, 'Annuler'),
        h('button', { class: 'btn danger', onclick: async (e) => {
          e.target.disabled = true;
          try { await deleteArtworkRow(a.id); await removeImage(a.image_path); dlg.close(); toast('Photographie supprimée.'); await ctx.reloadStats(); await load(); }
          catch (er) { e.target.disabled = false; err.hidden = false; err.textContent = er.message; }
        } }, 'Supprimer définitivement'))));
    document.body.append(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
  }

  // ---------- QR code individuel ----------
  async function openQr(a) {
    const { default: QRCode } = await import('qrcode');
    const link = artworkLink(a.id);
    const opts = { errorCorrectionLevel: 'Q', margin: 4, color: { dark: '#000000', light: '#FFFFFF' } };
    const svg = await QRCode.toString(link, { ...opts, type: 'svg' });
    const warn = baseWarning();
    const dlg = h('dialog', { 'aria-labelledby': 'q-h' });
    const holder = h('div', { class: 'qr-holder', 'aria-label': `QR code de la photographie ${a.id}`, role: 'img' });
    holder.innerHTML = svg;   // SVG fabriqué localement par la bibliothèque, sans contenu saisi par un visiteur
    dlg.append(h('div', { class: 'sheet' },
      h('h2', { id: 'q-h' }, `QR code n° ${a.id}`),
      warn ? h('p', { class: 'note warn' }, warn) : null,
      holder,
      h('p', { class: 'small', style: 'word-break:break-all;margin:0' }, link),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: async () => download(`oeuvre-${a.id}.png`, await QRCode.toDataURL(link, { ...opts, width: 1200 })) }, 'Télécharger en PNG'),
        h('button', { class: 'btn', onclick: () => download(`oeuvre-${a.id}.svg`, new Blob([svg], { type: 'image/svg+xml' })) }, 'Télécharger en SVG'),
        h('button', { class: 'btn primary', onclick: () => dlg.close() }, 'Fermer'))));
    document.body.append(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
  }

  box.append(
    h('div', { class: 'actions', style: 'margin-bottom:1rem' },
      h('button', { class: 'btn primary', onclick: () => openForm(null) }, 'Ajouter une photographie')),
    listEl);
  await load();
}
