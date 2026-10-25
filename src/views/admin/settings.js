import { h, clear, toast } from '../../lib/dom.js';
import { adminRpc, getSettings } from '../../lib/admin-client.js';
import { download } from '../../lib/qr-links.js';

const NUM = [
  ['min_collection', 'Photographies à collecter avant de pouvoir choisir', 'Modifier ce nombre pendant l’exposition change la règle pour tous les visiteurs en cours.'],
  ['max_comment_length', 'Longueur maximale d’un commentaire (caractères)', ''],
  ['retention_days', 'Durée de conservation des parcours (jours)', 'Passé ce délai sans visite, les données du parcours sont supprimables (bouton plus bas).'],
  ['report_threshold', 'Signalements qui renvoient un commentaire en relecture', ''],
  ['rate_new_per_hour', 'Nouveaux parcours par heure et par réseau', 'La médiathèque partage probablement un seul réseau Wi-Fi : gardez une valeur large (ex. 120).'],
  ['rate_actions_per_hour', 'Pixels, signalements et reprises par heure et par réseau', 'Même remarque (ex. 600).'],
];

export async function settingsPanel(box, ctx) {
  const s = await getSettings();
  const inputs = {};

  const numFields = NUM.map(([key, label, help]) => {
    inputs[key] = h('input', { type: 'text', inputmode: 'numeric', id: `s-${key}`, value: String(s[key]), 'aria-describedby': help ? `h-${key}` : null });
    return h('div', null, h('label', { class: 'field', for: `s-${key}` }, label), inputs[key], help ? h('p', { class: 'small muted', id: `h-${key}`, style: 'margin:0.3rem 0 0' }, help) : null);
  });

  inputs.moderation_mode = h('select', { id: 's-mod' },
    h('option', { value: 'pre', selected: s.moderation_mode === 'pre' }, 'Relire avant publication (recommandé)'),
    h('option', { value: 'post', selected: s.moderation_mode === 'post' }, 'Publier tout de suite, modérer ensuite'));
  inputs.blocked_words = h('textarea', { id: 's-words', 'aria-describedby': 'h-words' });
  inputs.blocked_words.value = (s.blocked_words || []).join('\n');

  // Palette
  let palette = (s.palette || []).map((p) => ({ ...p }));
  const palEl = h('div', { class: 'stack' });
  function paintPalette() {
    clear(palEl);
    palette.forEach((p, i) => {
      const name = h('input', { type: 'text', value: p.name, 'aria-label': `Nom de la couleur ${i + 1}`, maxlength: '40' });
      const col = h('input', { type: 'color', value: p.hex, 'aria-label': `Couleur ${i + 1}`, class: 'color-input' });
      name.addEventListener('input', () => { p.name = name.value; });
      col.addEventListener('input', () => { p.hex = col.value.toUpperCase(); });
      palEl.append(h('div', { class: 'pal-row' }, col, name,
        h('button', { class: 'btn small', type: 'button', disabled: palette.length <= 2, 'aria-label': `Retirer la couleur ${p.name}`, onclick: () => { palette.splice(i, 1); paintPalette(); } }, 'Retirer')));
    });
    palEl.append(h('button', { class: 'btn small', type: 'button', disabled: palette.length >= 24, onclick: () => { palette.push({ name: 'Nouvelle couleur', hex: '#888888' }); paintPalette(); } }, 'Ajouter une couleur'));
  }
  paintPalette();

  const saveBtn = h('button', { class: 'btn primary', onclick: save }, 'Enregistrer les réglages');
  async function save() {
    saveBtn.disabled = true;
    const next = { moderation_mode: inputs.moderation_mode.value,
      blocked_words: inputs.blocked_words.value.split('\n').map((w) => w.trim()).filter(Boolean), palette };
    for (const [key] of NUM) {
      const v = inputs[key].value.trim();
      if (!/^\d+$/.test(v) || Number(v) < 1) { toast(`Valeur invalide pour « ${key} » : entrez un nombre entier positif.`, 'error'); saveBtn.disabled = false; return; }
      next[key] = Number(v);
    }
    let changed = 0;
    try {
      for (const [key, value] of Object.entries(next)) {
        if (JSON.stringify(value) === JSON.stringify(s[key])) continue;
        await adminRpc('admin_set_setting', { p_key: key, p_value: value });
        s[key] = value; changed++;
      }
      toast(changed ? `${changed} réglage${changed > 1 ? 's' : ''} enregistré${changed > 1 ? 's' : ''}.` : 'Aucun changement.');
    } catch (e) { toast(e.message, 'error'); }
    saveBtn.disabled = false;
  }

  // ---------- Données ----------
  const purgeOut = h('p', { class: 'small', role: 'status' });
  async function purge() {
    try { const r = await adminRpc('admin_purge_expired'); purgeOut.textContent = `${r.deleted} parcours supprimé${r.deleted > 1 ? 's' : ''}.`; await ctx.reloadStats(); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function backup() {
    try {
      const data = await adminRpc('admin_export');
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      download(`sauvegarde-nous-etions-la-${stamp}.json`, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      toast('Sauvegarde téléchargée. Conservez-la ailleurs que sur cet ordinateur.');
    } catch (e) { toast(e.message, 'error'); }
  }
  function resetDialog() {
    const input = h('input', { type: 'text', id: 'reset-confirm', autocomplete: 'off', 'aria-describedby': 'reset-h' });
    const go = h('button', { class: 'btn danger', disabled: true, onclick: async () => {
      go.disabled = true;
      try { await adminRpc('admin_reset_visitor_data'); dlg.close(); toast('Toutes les données des visiteurs ont été effacées.'); await ctx.reloadStats(); }
      catch (e) { go.disabled = false; toast(e.message, 'error'); }
    } }, 'Effacer toutes les données visiteurs');
    input.addEventListener('input', () => { go.disabled = input.value.trim() !== 'EFFACER'; });
    const dlg = h('dialog', { 'aria-labelledby': 'reset-t' }, h('div', { class: 'sheet' },
      h('h2', { id: 'reset-t' }, 'Effacer les données de test ?'),
      h('p', null, 'Tous les parcours, collections, choix, commentaires et TOUS LES PIXELS de la mosaïque seront supprimés. Les photographies et les réglages sont conservés. Cette action est irréversible.'),
      h('p', { class: 'note warn' }, 'À faire uniquement avant l’ouverture au public. Téléchargez d’abord une sauvegarde.'),
      h('label', { class: 'field', for: 'reset-confirm', id: 'reset-h' }, 'Pour confirmer, tapez EFFACER'), input,
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => dlg.close() }, 'Annuler'), go)));
    document.body.append(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
  }

  box.append(h('div', { class: 'stack' },
    h('h2', null, 'Réglages'),
    h('div', null, h('label', { class: 'field', for: 's-mod' }, 'Modération des commentaires'), inputs.moderation_mode),
    numFields,
    h('div', null, h('label', { class: 'field', for: 's-words' }, 'Mots bloqués (un par ligne)'), inputs.blocked_words,
      h('p', { class: 'small muted', id: 'h-words', style: 'margin:0.3rem 0 0' }, 'Un commentaire qui contient l’un de ces mots est toujours envoyé en relecture, même en publication immédiate.')),
    h('h3', null, 'Palette de la mosaïque'),
    h('p', { class: 'small muted', style: 'margin:0' }, 'Les pixels déjà posés gardent leur couleur. Choisissez des couleurs bien distinctes les unes des autres.'),
    palEl,
    h('div', { class: 'actions' }, saveBtn),

    h('h2', { style: 'margin-top:2rem' }, 'Données'),
    h('h3', null, 'Sauvegarde'),
    h('p', { class: 'small muted', style: 'margin:0' }, 'Fichier JSON avec les photographies (textes), la mosaïque, les choix et les commentaires publiés, sans aucune donnée permettant d’identifier un visiteur. L’offre gratuite de Supabase n’inclut pas de sauvegarde automatique : faites-en une avant et après l’exposition.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: backup }, 'Télécharger une sauvegarde')),
    h('h3', null, 'Suppression des anciens parcours'),
    h('p', { class: 'small muted', style: 'margin:0' }, `Supprime les parcours sans visite depuis plus de ${s.retention_days} jours. Les cases colorées de la mosaïque restent.`),
    h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: purge }, 'Supprimer les parcours expirés')), purgeOut,
    h('h3', null, 'Avant l’ouverture au public'),
    h('p', { class: 'small muted', style: 'margin:0' }, 'Efface les contributions de test pour repartir d’une mosaïque vide.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn danger', onclick: resetDialog }, 'Effacer les données de test…'))));
}
