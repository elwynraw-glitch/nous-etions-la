// État du visiteur. Copie locale (localStorage) + vérité sur le serveur.
// Règle d'honnêteté : une photo n'est « enregistrée » que lorsque le serveur l'a confirmé.
// Tant que ce n'est pas le cas, elle est marquée « en attente » et l'interface le dit.
import { rpc, supabase, ApiError } from './api.js';
import { generateCode, normalizeCode } from './code.js';

const KEY = 'nel.v1';
const empty = () => ({ code: null, registered: false, collection: [], pending: [], choice: null, pixel: null });

let state = empty();
let config = null;           // réglages publics (palette, minimum…)
let artworks = new Map();    // œuvres actives
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...empty(), ...JSON.parse(raw) };
  } catch { state = empty(); }
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* navigation privée pleine : on continue en mémoire */ }
  listeners.forEach((fn) => fn());
}
load();

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getState = () => state;
export const getConfig = () => config;
export const hasSession = () => Boolean(state.code);
export const isInCollection = (id) => state.collection.includes(id) || state.pending.includes(id);
export const isPending = (id) => state.pending.includes(id) && !state.collection.includes(id);
export const savedCount = () => state.collection.length;           // confirmé par le serveur
export const pendingCount = () => state.pending.filter((id) => !state.collection.includes(id)).length;
export const minCollection = () => config?.min_collection ?? 3;
export const canChoose = () => savedCount() >= minCollection();
export const getArtwork = (id) => artworks.get(id);
export const allArtworks = () => [...artworks.values()];

// ---------- Réglages et œuvres ----------
export async function loadConfig() {
  config = await rpc('public_config');
  return config;
}
export async function loadArtworks() {
  if (!supabase) return;
  const { data, error } = await supabase.from('artworks').select('*').order('id');
  if (error) throw new ApiError('network', error.message);
  artworks = new Map(data.map((a) => [a.id, a]));
}

// ---------- Session ----------
export async function ensureSession() {
  if (!state.code) { state.code = generateCode(); state.registered = false; persist(); }
  if (!state.registered) {
    await rpc('start_session', { p_code: state.code });
    state.registered = true;
    persist();
  }
  return state.code;
}

// Applique l'état renvoyé par le serveur (source de vérité)
function applyServerState(s) {
  const server = s.collection || [];
  state.collection = server;
  state.pending = state.pending.filter((id) => !server.includes(id));
  state.choice = s.choice && s.choice.artwork_id ? s.choice : null;
  state.pixel = s.pixel || null;
  persist();
}

export async function refreshFromServer() {
  if (!state.code || !state.registered) return;
  try {
    applyServerState(await rpc('get_my_state', { p_code: state.code }));
  } catch (e) {
    if (e.code === 'invalid_code') { // le serveur ne connaît plus ce code (données purgées ou effacées)
      state = empty(); persist();
    } else if (e.code !== 'network') throw e;
  }
}

// ---------- Collection ----------
// Retourne { status: 'added' | 'already' | 'pending' }
export async function addArtwork(id) {
  if (state.collection.includes(id)) return { status: 'already' };
  if (!state.pending.includes(id)) { state.pending.push(id); persist(); }
  try {
    await ensureSession();
    const r = await rpc('add_to_collection', { p_code: state.code, p_artwork_id: id });
    state.pending = state.pending.filter((x) => x !== id);
    if (!state.collection.includes(id)) state.collection.push(id);
    persist();
    return { status: r.status };
  } catch (e) {
    if (e.code === 'network' || e.code === 'rate_limited') return { status: 'pending', error: e };
    state.pending = state.pending.filter((x) => x !== id); // refus définitif du serveur (ex. photo inconnue)
    persist();
    throw e;
  }
}

// À appeler au démarrage et au retour de la connexion : envoie ce qui attend.
export async function syncPending() {
  const todo = state.pending.filter((id) => !state.collection.includes(id));
  for (const id of todo) {
    try { await addArtwork(id); } catch { /* on réessaiera plus tard */ }
  }
  await refreshFromServer();
}

// ---------- Choix et pixel ----------
export async function saveChoice(artworkId, comment, publish) {
  const code = await ensureSession();
  const r = await rpc('save_choice', { p_code: code, p_artwork_id: artworkId, p_comment: comment || '', p_public: Boolean(publish) });
  await refreshFromServer();
  return r;
}

export async function placePixel(x, y, color) {
  const code = await ensureSession();
  const r = await rpc('place_pixel', { p_code: code, p_x: x, p_y: y, p_color: color });
  state.pixel = { x: r.x, y: r.y, color: r.color };
  persist();
  return r;
}

// ---------- Reprise sur un autre appareil ----------
export async function restoreFromCode(input) {
  const r = await rpc('restore_session', { p_code: normalizeCode(input) });
  if (!r.ok) throw new ApiError(r.error || 'invalid_code');
  state = { ...empty(), code: r.code, registered: true };
  applyServerState(r.state);
  return state;
}

// ---------- Effacement ----------
export async function deleteMyData(removePixel) {
  if (state.code && state.registered) await rpc('delete_my_data', { p_code: state.code, p_remove_pixel: Boolean(removePixel) });
  state = empty();
  persist();
}
export function forgetThisDevice() { state = empty(); persist(); }
