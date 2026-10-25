// Lecture du contenu d'un QR code d'œuvre.
// On n'ouvre JAMAIS l'adresse lue : on en extrait seulement le numéro de l'œuvre (ex. « 001 ») et on ouvre notre propre fiche.
// Un QR code étranger ne peut donc pas envoyer le visiteur ailleurs.
export function parseArtworkQr(text) {
  if (typeof text !== 'string' || text.length > 500) return null;
  const m = text.trim().match(/#\/oeuvre\/([A-Za-z0-9-]{1,32})\/?$/);
  return m ? m[1].toLowerCase() : null;
}

// Numéro saisi à la main : « 1 », « 01 » ou « 001 » désignent la même photo si les numéros ont 3 chiffres.
export function normalizeTypedNumber(input, exists) {
  const raw = String(input || '').trim().toLowerCase().replace(/^n°\s*/, '').replace(/\s+/g, '');
  if (!/^[a-z0-9-]{1,32}$/.test(raw)) return null;
  if (exists(raw)) return raw;
  if (/^\d+$/.test(raw)) { const padded = raw.padStart(3, '0'); if (exists(padded)) return padded; }
  return null;
}
