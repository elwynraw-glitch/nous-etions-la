// Mosaïque en direct : chargement initial, abonnement temps réel, et filet de sécurité par interrogation légère.
// Si le temps réel est coupé (réseau, quota), la mosaïque continue de se mettre à jour toutes les 30 secondes.
import { rpc, supabase } from './api.js';

const cells = new Map();          // "x,y" -> { id, x, y, color }
let lastId = 0;
let status = 'connecting';        // 'connecting' | 'live' | 'offline'
let started = false;
const listeners = new Set();
const emit = (ev) => listeners.forEach((fn) => fn(ev));

export const onLive = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getCells = () => cells;
export const getStatus = () => status;
export const cellCount = () => cells.size;
export const toList = () => [...cells.values()].map((c) => [c.id, c.x, c.y, c.color]);

function setStatus(s) { if (s !== status) { status = s; emit({ type: 'status', status }); } }

function put(id, x, y, color, announceIt) {
  const key = `${x},${y}`;
  if (cells.has(key)) return false;
  cells.set(key, { id, x, y, color });
  if (id > lastId) lastId = id;
  emit({ type: 'insert', x, y, color, live: announceIt });
  return true;
}

export async function fullLoad() {
  const r = await rpc('get_cells', { p_after_id: 0 });
  cells.clear();
  for (const [id, x, y, color] of r.cells) cells.set(`${x},${y}`, { id, x, y, color });
  lastId = r.last_id;
  emit({ type: 'reset' });
}

async function incremental() {
  const r = await rpc('get_cells', { p_after_id: lastId });
  for (const [id, x, y, color] of r.cells) put(id, x, y, color, false);
  if (r.last_id > lastId) lastId = r.last_id;
}

export async function refreshNow() {
  try { await incremental(); } catch { /* réseau coupé : on réessaiera */ }
}

export async function startLive() {
  if (started || !supabase) return;
  started = true;
  const load = async () => {
    try { await fullLoad(); } catch { setStatus('offline'); setTimeout(load, 8000); }
  };
  await load();

  supabase.channel('mosaic')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mosaic_cells' }, (p) => {
      const n = p.new; put(n.id, n.x, n.y, n.color, true);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'mosaic_cells' }, (p) => {
      const o = p.old; if (o && cells.delete(`${o.x},${o.y}`)) emit({ type: 'delete', x: o.x, y: o.y });
    })
    .subscribe((s) => {
      if (s === 'SUBSCRIBED') { setStatus('live'); incremental().catch(() => {}); }
      else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(s)) setStatus('offline');
    });

  setInterval(() => { if (!document.hidden) incremental().catch(() => {}); }, 30_000);
  setInterval(() => { if (!document.hidden) fullLoad().catch(() => {}); }, 5 * 60_000);   // rattrape suppressions et remises à zéro
  document.addEventListener('visibilitychange', () => { if (!document.hidden) incremental().catch(() => {}); });
  window.addEventListener('online', () => incremental().catch(() => {}));
}
