// Espace d'administration : connexion, tableau de bord, onglets.
import { h, clear, toast } from '../../lib/dom.js';
import { ApiError } from '../../lib/api.js';
import { signIn, signOut, getSessionEmail, isAdmin, adminRpc } from '../../lib/admin-client.js';

const TABS = [
  ['photos', 'Photographies', () => import('./photos.js').then((m) => m.photosPanel)],
  ['qr', 'QR codes', () => import('./qr.js').then((m) => m.qrPanel)],
  ['comments', 'Commentaires', () => import('./moderation.js').then((m) => m.moderationPanel)],
  ['mosaic', 'Mosaïque', () => import('./mosaic-admin.js').then((m) => m.mosaicAdminPanel)],
  ['settings', 'Réglages et données', () => import('./settings.js').then((m) => m.settingsPanel)],
];

export async function adminView({ main }) {
  document.title = 'Administration — NOUS ÉTIONS LÀ';
  const root = h('div', { class: 'stack' });
  main.append(root);
  let panelCleanup = null;

  async function show() {
    clear(root);
    let email = null;
    try { email = await getSessionEmail(); } catch { /* réseau : on retombe sur la connexion */ }
    if (!email) return loginForm();
    let ok = false;
    try { ok = await isAdmin(); } catch { /* idem */ }
    if (!ok) return notAdmin(email);
    return dashboard(email);
  }

  function loginForm() {
    const err = h('p', { class: 'note err', role: 'alert', hidden: true });
    const email = h('input', { type: 'text', id: 'adm-mail', autocomplete: 'username', inputmode: 'email', autocapitalize: 'none', spellcheck: 'false' });
    const pass = h('input', { type: 'password', id: 'adm-pass', autocomplete: 'current-password', autocapitalize: 'none', spellcheck: 'false' });
    const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Se connecter');
    root.append(h('div', { class: 'stack', style: 'max-width:26rem' },
      h('h1', null, 'Administration'),
      h('p', { class: 'muted' }, 'Espace réservé à l’organisateur de l’exposition.'),
      h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
        e.preventDefault(); err.hidden = true; btn.disabled = true; btn.textContent = 'Connexion…';
        try { await signIn(email.value.trim(), pass.value); await show(); }
        catch (er) { btn.disabled = false; btn.textContent = 'Se connecter'; err.hidden = false; err.textContent = er instanceof ApiError ? er.message : 'Connexion impossible.'; }
      } },
        h('div', null, h('label', { class: 'field', for: 'adm-mail' }, 'Adresse e-mail'), email),
        h('div', null, h('label', { class: 'field', for: 'adm-pass' }, 'Mot de passe'), pass),
        err, btn)));
  }

  function notAdmin(email) {
    root.append(h('div', { class: 'stack' },
      h('h1', null, 'Accès refusé'),
      h('p', { class: 'lead' }, `Le compte ${email} est connecté, mais il n’est pas autorisé à administrer l’exposition.`),
      h('p', { class: 'muted' }, 'Si c’est votre compte, il faut l’ajouter à la liste des administrateurs dans Supabase (étape 4 du README).'),
      h('button', { class: 'btn', onclick: async () => { await signOut(); show(); } }, 'Se déconnecter')));
  }

  async function dashboard(email) {
    const cards = h('div', { class: 'stat-grid' });
    const badge = h('span', { class: 'badge', hidden: true });
    const ctx = { stats: null, reloadStats, toast };

    async function reloadStats() {
      try {
        const s = await adminRpc('admin_stats');
        ctx.stats = s;
        clear(cards);
        const pct = s.grid_total ? Math.round((s.pixels / s.grid_total) * 1000) / 10 : 0;
        for (const [label, value, sub] of [
          ['Parcours commencés', s.participants], ['Ont choisi leur photo', s.with_choice],
          ['Pixels posés', `${s.pixels} / ${s.grid_total}`, `${pct} % rempli`], ['Commentaires à relire', s.pending_comments]]) {
          cards.append(h('div', { class: 'stat' }, h('b', null, String(value)), h('span', null, label), sub ? h('small', null, sub) : null));
        }
        badge.hidden = !s.pending_comments; badge.textContent = String(s.pending_comments);
      } catch (e) { toast(e.message, 'error'); }
      return ctx.stats;
    }
    await reloadStats();

    const panelBox = h('div', { class: 'admin-panel', tabindex: '-1' });
    const tabButtons = [];
    let current = null;

    async function open(id) {
      if (panelCleanup) { try { panelCleanup(); } catch { /* ignore */ } panelCleanup = null; }
      current = id;
      tabButtons.forEach(([tid, b]) => { b.setAttribute('aria-selected', String(tid === id)); b.tabIndex = tid === id ? 0 : -1; });
      clear(panelBox); panelBox.append(h('p', { class: 'muted' }, 'Chargement…'));
      const [, , loader] = TABS.find((t) => t[0] === id);
      try {
        const panel = await loader();
        if (current !== id) return;
        clear(panelBox);
        panelCleanup = (await panel(panelBox, ctx)) || null;
      } catch (e) {
        clear(panelBox); panelBox.append(h('p', { class: 'note err' }, e instanceof ApiError ? e.message : 'Impossible d’afficher cette section.'));
      }
    }

    const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Sections de l’administration' },
      TABS.map(([id, label]) => {
        const b = h('button', { class: 'tab', role: 'tab', id: `tab-${id}`, type: 'button', onclick: () => open(id) },
          label, id === 'comments' ? badge : null);
        tabButtons.push([id, b]);
        return b;
      }));
    tablist.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const i = tabButtons.findIndex(([id]) => id === current);
      const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabButtons.length) % tabButtons.length;
      tabButtons[n][1].focus(); open(tabButtons[n][0]);
    });

    root.append(
      h('div', { class: 'admin-head' },
        h('h1', null, 'Administration'),
        h('div', { class: 'admin-user' }, h('span', { class: 'muted small' }, email),
          h('button', { class: 'btn small', onclick: async () => { await signOut(); toast('Déconnecté.'); show(); } }, 'Se déconnecter'))),
      cards, tablist, panelBox);
    open('photos');
  }

  await show();
  return () => { if (panelCleanup) try { panelCleanup(); } catch { /* ignore */ } };
}
