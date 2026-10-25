import { h, clear, toast } from '../../lib/dom.js';
import { adminRpc } from '../../lib/admin-client.js';

export async function moderationPanel(box, ctx) {
  let status = 'pending';
  const listEl = h('div', { class: 'adm-list' });
  const seg = h('div', { class: 'actions', role: 'group', 'aria-label': 'Filtre' });
  const labels = { pending: 'À relire', approved: 'Publiés' };

  async function load() {
    clear(listEl); listEl.append(h('p', { class: 'muted' }, 'Chargement…'));
    let rows = [];
    try { rows = await adminRpc('admin_list_comments', { p_status: status }); } catch (e) { clear(listEl); listEl.append(h('p', { class: 'note err' }, e.message)); return; }
    clear(listEl);
    if (!rows.length) listEl.append(h('p', { class: 'muted' }, status === 'pending' ? 'Aucun commentaire à relire.' : 'Aucun commentaire publié.'));
    for (const r of rows) {
      const reject = h('button', { class: 'btn small danger', onclick: () => {
        if (!reject.dataset.sure) { reject.dataset.sure = '1'; reject.textContent = 'Confirmer le refus (définitif)'; return; }
        act(r, 'reject');
      } }, 'Refuser');
      listEl.append(h('article', { class: 'adm-row' },
        h('div', { class: 'adm-info' },
          h('p', { class: 'meta', style: 'margin:0 0 0.4rem' }, `Case colonne ${r.x + 1}, ligne ${r.y + 1} · photo n° ${r.artwork_id ?? '?'} ${r.artwork_title ? '— ' + r.artwork_title : ''}`),
          h('blockquote', { class: 'viewer-quote' }, r.comment),
          r.reports ? h('p', { class: 'small', style: 'margin:0.4rem 0 0' }, h('span', { class: 'badge' }, `${r.reports} signalement${r.reports > 1 ? 's' : ''}`)) : null),
        h('div', { class: 'adm-actions' },
          status === 'pending' ? h('button', { class: 'btn small primary', onclick: () => act(r, 'approve') }, 'Approuver') : null,
          reject)));
    }
  }

  async function act(r, action) {
    try {
      await adminRpc('admin_moderate', { p_x: r.x, p_y: r.y, p_action: action });
      toast(action === 'approve' ? 'Commentaire publié.' : 'Commentaire refusé et supprimé.');
      await ctx.reloadStats(); await load();
    } catch (e) { toast(e.message, 'error'); }
  }

  function paintSeg() {
    clear(seg);
    for (const [s, label] of Object.entries(labels)) {
      seg.append(h('button', { class: 'btn small' + (s === status ? ' primary' : ''), 'aria-pressed': String(s === status), onclick: () => { status = s; paintSeg(); load(); } }, label));
    }
    seg.append(h('button', { class: 'btn small', onclick: () => { ctx.reloadStats(); load(); } }, 'Actualiser'));
  }
  paintSeg();
  box.append(
    h('h2', null, 'Commentaires'),
    h('p', { class: 'small muted' }, 'Seuls les commentaires que leur auteur a autorisés à publier apparaissent ici. Un commentaire signalé par plusieurs visiteurs repasse automatiquement « à relire ». Les commentaires contenant un mot de votre liste de mots bloqués aussi.'),
    seg, listEl);
  await load();
  const timer = setInterval(() => { if (!document.hidden) load(); }, 30000);
  return () => clearInterval(timer);
}
