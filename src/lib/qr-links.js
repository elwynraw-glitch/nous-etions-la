import { SITE_URL } from './api.js';

// Adresse publique du site, utilisée pour fabriquer les QR codes.
export function siteBase() { return SITE_URL || (location.origin + location.pathname.replace(/\/$/, '')); }
export const homeLink = () => `${siteBase()}/#/`;
export const artworkLink = (id) => `${siteBase()}/#/oeuvre/${id}`;

// Un QR code imprimé avec une adresse locale ne marcherait pour personne d'autre : on prévient.
export function baseWarning() {
  const b = siteBase();
  if (!SITE_URL) return `VITE_SITE_URL n’est pas renseigné : les QR codes utilisent l’adresse actuelle (${b}). Renseignez l’adresse publique définitive avant d’imprimer.`;
  if (/localhost|127\.0\.0\.1|192\.168\.|(^|\/\/)10\.|172\.(1[6-9]|2\d|3[01])\./.test(b)) return `L’adresse « ${b} » est une adresse locale : ces QR codes ne fonctionneraient que chez vous. Ne les imprimez pas, ils servent seulement à tester.`;
  return null;
}

export function download(filename, data) {
  const url = typeof data === 'string' ? data : URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  if (typeof data !== 'string') setTimeout(() => URL.revokeObjectURL(url), 2000);
}
