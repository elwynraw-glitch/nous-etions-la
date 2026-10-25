import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const SITE_URL = (import.meta.env.VITE_SITE_URL || '').replace(/\/$/, '');
export const isConfigured = Boolean(SUPABASE_URL && ANON_KEY && !SUPABASE_URL.includes('xxxxxxxx'));

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

// Messages affichés au visiteur pour chaque code d'erreur renvoyé par le serveur.
export const ERRORS = {
  network: 'Connexion impossible pour le moment. Vérifiez votre réseau : rien n’a été enregistré.',
  invalid_code: 'Ce code de récupération n’est pas reconnu.',
  unknown_artwork: 'Cette photographie n’existe pas ou n’est plus disponible.',
  collection_too_small: 'Il faut d’abord collecter au moins 3 photographies différentes.',
  not_in_collection: 'Cette photographie n’est pas dans votre collection.',
  choice_required: 'Choisissez d’abord votre photographie préférée.',
  already_placed: 'Vous avez déjà posé votre pixel. Chaque visiteur n’en pose qu’un.',
  out_of_grid: 'Cette case n’existe pas.',
  invalid_color: 'Cette couleur n’est pas disponible.',
  cell_taken: 'Cette case vient d’être prise par quelqu’un d’autre. Choisissez-en une autre : votre pixel n’est pas perdu.',
  grid_full: 'La mosaïque est complète. Merci à toutes et à tous.',
  contributions_closed: 'Les nouvelles contributions sont fermées pour le moment.',
  comment_too_long: 'Votre commentaire est trop long.',
  comment_has_link_or_contact: 'Pour protéger la vie privée, le commentaire ne peut contenir ni lien, ni adresse e-mail, ni numéro de téléphone.',
  rate_limited: 'Trop de demandes depuis ce réseau. Patientez quelques minutes puis réessayez.',
  bad_login: 'Adresse e-mail ou mot de passe incorrect.',
  duplicate_id: 'Ce numéro est déjà utilisé par une autre photographie.',
  upload_failed: 'L’envoi de l’image a échoué. Vérifiez que vous êtes connecté et que l’image est valide.',
  not_admin: 'Ce compte n’a pas les droits d’administration.',
  invalid_value: 'Cette valeur n’est pas acceptée.',
  setting_not_editable: 'Ce réglage ne peut pas être modifié ici.',
  invalid_action: 'Action inconnue.',
};

export class ApiError extends Error {
  constructor(code, detail) {
    super(ERRORS[code] || 'Une erreur est survenue. Réessayez dans un instant.');
    this.code = code;
    this.detail = detail;
  }
}

// Appelle une fonction du serveur. Lève ApiError avec un code lisible.
export async function rpc(name, args = {}) {
  if (!supabase) throw new ApiError('network', 'not_configured');
  let res;
  try {
    res = await supabase.rpc(name, args);
  } catch (e) {
    throw new ApiError('network', String(e));
  }
  if (res.error) {
    const msg = String(res.error.message || '');
    // Les codes d'erreur du serveur sont des mots simples (ex. cell_taken)
    if (/^[a-z_]+$/.test(msg)) throw new ApiError(msg);
    // Échec réseau côté bibliothèque (code vide ou message « Failed to fetch »)
    if (!res.error.code || /fetch|network/i.test(msg)) throw new ApiError('network', msg);
    throw new ApiError('unknown', msg);
  }
  return res.data;
}

// URL publique d'une photographie (Supabase Storage). Renvoie null pour une image de démonstration.
export function imageUrl(path) {
  if (!path || !SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/artworks/${path.split('/').map(encodeURIComponent).join('/')}`;
}
