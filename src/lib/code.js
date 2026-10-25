// Code de récupération : 16 caractères tirés au hasard par le navigateur (crypto sécurisé), environ 79 bits.
// Alphabet sans les caractères ambigus (0/O, 1/I/L) : 2-9, A-H, J, K, M, N, P-Z.
export const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const VALID = /^[2-9A-HJKMNP-Z]{16}$/;

export function generateCode() {
  const out = [];
  const limit = 256 - (256 % ALPHABET.length); // évite le biais statistique du modulo
  while (out.length < 16) {
    const buf = new Uint8Array(32);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < limit && out.length < 16) out.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  return out.join('');
}

// Accepte minuscules, espaces et tirets (même règle que le serveur).
export function normalizeCode(input) {
  return String(input || '').toUpperCase().replace(/[\s-]/g, '');
}
export function isValidCode(input) {
  return VALID.test(normalizeCode(input));
}
// ABCD-EFGH-2345-6789
export function formatCode(code) {
  return normalizeCode(code).replace(/(.{4})(?=.)/g, '$1-');
}
