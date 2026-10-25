// Tests rapides des petites fonctions (sans navigateur ni Supabase) : npm test
import assert from 'node:assert/strict';
import { generateCode, normalizeCode, isValidCode, formatCode, ALPHABET } from '../src/lib/code.js';
import { parseHash } from '../src/lib/router.js';
import { parseArtworkQr, normalizeTypedNumber } from '../src/lib/scan.js';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

let n = 0; const ok = (name, fn) => { fn(); n++; console.log('PASS ', name); };

ok('code : 16 caractères valides', () => { for (let i = 0; i < 500; i++) { const c = generateCode(); assert.equal(c.length, 16); assert.ok(isValidCode(c)); } });
ok('code : jamais de caractère ambigu', () => { for (let i = 0; i < 500; i++) assert.ok(!/[01OIL]/.test(generateCode())); });
ok('code : tous différents', () => { const s = new Set(Array.from({ length: 2000 }, generateCode)); assert.equal(s.size, 2000); });
ok('code : répartition à peu près uniforme', () => {
  const counts = {}; for (let i = 0; i < 4000; i++) for (const ch of generateCode()) counts[ch] = (counts[ch] || 0) + 1;
  const vals = Object.values(counts); assert.equal(vals.length, ALPHABET.length);
  assert.ok(Math.max(...vals) / Math.min(...vals) < 1.15);
});
ok('code : normalisation (minuscules, espaces, tirets)', () => assert.equal(normalizeCode(' abcd-efgh 2345-6789 '), 'ABCDEFGH23456789'));
ok('code : format affiché', () => assert.equal(formatCode('ABCDEFGH23456789'), 'ABCD-EFGH-2345-6789'));
ok('code : refuse 0, O, I, L, 1 et mauvaise longueur', () => { for (const bad of ['ABCDEFGH2345678', 'ABCDEFGH23456780', 'ABCDEFGH2345678O', 'ABCDEFGH2345678L', '', null]) assert.ok(!isValidCode(bad)); });
ok('route : accueil', () => assert.deepEqual(parseHash(''), { name: 'home' }));
ok('route : œuvre', () => assert.deepEqual(parseHash('#/oeuvre/001'), { name: 'artwork', id: '001' }));
ok('route : œuvre sans identifiant', () => assert.equal(parseHash('#/oeuvre').name, 'notfound'));
ok('route : QR inconnu', () => assert.equal(parseHash('#/nimportequoi').name, 'notfound'));
ok('route : mosaïque plein écran', () => assert.deepEqual(parseHash('#/mosaique/plein-ecran'), { name: 'mosaic', kiosk: true }));

// --- Scanner : contenu des QR codes ---
ok('scan : lien d’œuvre reconnu', () => assert.equal(parseArtworkQr('https://x.github.io/nous-etions-la/#/oeuvre/001'), '001'));
ok('scan : adresse locale reconnue aussi (QR de test)', () => assert.equal(parseArtworkQr('http://192.168.1.21:5173/#/oeuvre/012'), '012'));
ok('scan : espaces et majuscules tolérés', () => assert.equal(parseArtworkQr('  https://x.org/#/oeuvre/AB-3\n'), 'ab-3'));
ok('scan : QR d’accueil ou étranger refusé', () => { for (const t of ['https://x.org/#/', 'https://exemple.com', 'WIFI:S:box;;', 'oeuvre/001', '', null, 42]) assert.equal(parseArtworkQr(t), null); });
ok('scan : numéro piégé refusé (pas de redirection ailleurs)', () => { for (const t of ['https://x.org/#/oeuvre/../admin', 'https://x.org/#/oeuvre/001/extra', 'https://x.org/#/oeuvre/<script>', 'https://x.org/#/oeuvre/' + 'a'.repeat(40)]) assert.equal(parseArtworkQr(t), null); });
ok('scan : numéro tapé « 1 » devient 001', () => { const has = (x) => ['001', '002'].includes(x); assert.equal(normalizeTypedNumber('1', has), '001'); assert.equal(normalizeTypedNumber('n° 002', has), '002'); assert.equal(normalizeTypedNumber('9', has), null); assert.equal(normalizeTypedNumber('<b>', has), null); });

// --- Lecture d'images de QR codes par la même bibliothèque que le scanner (navigateurs sans BarcodeDetector) ---
function qrImage(text, scale, { invert = false, quiet = 4 } = {}) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'Q' });
  const size = qr.modules.size, W = (size + quiet * 2) * scale, data = new Uint8ClampedArray(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const mx = Math.floor(x / scale) - quiet, my = Math.floor(y / scale) - quiet;
    const dark = Boolean(mx >= 0 && my >= 0 && mx < size && my < size && qr.modules.get(my, mx));
    const v = dark !== invert ? 0 : 255, i = (y * W + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { data, width: W, height: W };
}
const LINK = 'https://exemple.github.io/nous-etions-la/#/oeuvre/007';
ok('scan : QR net décodé', () => { const im = qrImage(LINK, 8); assert.equal(parseArtworkQr(jsQR(im.data, im.width, im.height).data), '007'); });
ok('scan : QR petit à l’écran (3 px par module) décodé', () => { const im = qrImage(LINK, 3); assert.equal(parseArtworkQr(jsQR(im.data, im.width, im.height).data), '007'); });
ok('scan : QR clair sur fond sombre décodé (inversion)', () => { const im = qrImage(LINK, 6, { invert: true }); assert.equal(parseArtworkQr(jsQR(im.data, im.width, im.height, { inversionAttempts: 'attemptBoth' }).data), '007'); });
ok('scan : QR d’accueil décodé mais refusé comme œuvre', () => { const im = qrImage('https://exemple.github.io/nous-etions-la/#/', 6); const t = jsQR(im.data, im.width, im.height).data; assert.ok(t); assert.equal(parseArtworkQr(t), null); });

console.log(`\n${n} tests réussis`);
