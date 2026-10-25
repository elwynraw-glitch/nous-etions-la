// Connexion administrateur. Client SÉPARÉ de celui des visiteurs : lui seul garde une session de connexion.
// Les droits ne dépendent PAS de ce code (n'importe qui peut le lire) mais du serveur :
// chaque fonction admin_* et chaque règle de table revérifie que le compte est dans la table « admins ».
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, ANON_KEY, ApiError } from './api.js';

let client = null;
export function getAdminClient() {
  if (!client) {
    client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'nel-admin-auth', detectSessionInUrl: false },
    });
  }
  return client;
}

export async function signIn(email, password) {
  const { data, error } = await getAdminClient().auth.signInWithPassword({ email, password });
  if (error) {
    if (/invalid login/i.test(error.message)) throw new ApiError('bad_login');
    throw new ApiError('network', error.message);
  }
  return data.session;
}
export async function signOut() { await getAdminClient().auth.signOut(); }
export async function getSessionEmail() {
  const { data } = await getAdminClient().auth.getSession();
  return data.session?.user?.email || null;
}
export async function isAdmin() {
  const { data, error } = await getAdminClient().rpc('is_admin');
  return !error && data === true;
}

// Appel d'une fonction admin_* : même gestion d'erreurs que pour les visiteurs.
export async function adminRpc(name, args = {}) {
  let res;
  try { res = await getAdminClient().rpc(name, args); } catch (e) { throw new ApiError('network', String(e)); }
  if (res.error) {
    const msg = String(res.error.message || '');
    if (/^[a-z_]+$/.test(msg)) throw new ApiError(msg);
    if (!res.error.code || /fetch|network/i.test(msg)) throw new ApiError('network', msg);
    throw new ApiError('unknown', msg);
  }
  return res.data;
}

// Erreurs des tables (œuvres) traduites en français
function dbError(error) {
  const msg = String(error.message || '');
  if (error.code === '23505') return new ApiError('duplicate_id');
  if (error.code === '23514') return new ApiError('invalid_value');
  if (error.code === '42501' || /row-level security/i.test(msg)) return new ApiError('not_admin');
  if (!error.code || /fetch|network/i.test(msg)) return new ApiError('network', msg);
  return new ApiError('unknown', msg);
}

export async function listAllArtworks() {
  const { data, error } = await getAdminClient().from('artworks').select('*').order('id');
  if (error) throw dbError(error);
  return data;
}
export async function insertArtwork(row) {
  const { error } = await getAdminClient().from('artworks').insert(row);
  if (error) throw dbError(error);
}
export async function updateArtwork(id, patch) {
  const { data, error } = await getAdminClient().from('artworks').update(patch).eq('id', id).select('id');
  if (error) throw dbError(error);
  if (!data.length) throw new ApiError('not_admin');   // 0 ligne modifiée : droits insuffisants
}
export async function deleteArtworkRow(id) {
  const { data, error } = await getAdminClient().from('artworks').delete().eq('id', id).select('id');
  if (error) throw dbError(error);
  if (!data.length) throw new ApiError('not_admin');
}
export async function getSettings() {
  const { data, error } = await getAdminClient().from('app_settings').select('key,value');
  if (error) throw dbError(error);
  return Object.fromEntries(data.map((r) => [r.key, r.value]));
}

// Photographies (Supabase Storage)
export async function uploadImage(blob, id) {
  const path = `${id}-${Date.now()}.jpg`;
  const { error } = await getAdminClient().storage.from('artworks').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) throw new ApiError('upload_failed', error.message);
  return path;
}
export async function removeImage(path) {
  if (path) await getAdminClient().storage.from('artworks').remove([path]).catch(() => {});
}
