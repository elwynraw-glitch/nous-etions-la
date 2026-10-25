// Fabrique les QR codes de l'exposition : un par photographie + un d'accueil + une planche prête à imprimer.
// Usage :  npm run qr          (lit le fichier .env, interroge la base, écrit le dossier « qr »)
//          npm run qr -- --local   (autorise une adresse de test comme localhost : NE PAS imprimer le résultat)
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const allowLocal = process.argv.includes('--local');

function readEnv() {
  const env = { ...process.env };
  const file = path.join(root, '.env');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const env = readEnv();
const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY;
const site = (env.VITE_SITE_URL || '').replace(/\/$/, '');
if (!url || !key || url.includes('xxxxxxxx')) { console.error('Fichier .env incomplet : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont nécessaires.'); process.exit(1); }
if (!site) { console.error('VITE_SITE_URL est vide : indiquez l’adresse publique finale du site dans .env.'); process.exit(1); }
if (/localhost|127\.0\.0\.1|192\.168\./.test(site) && !allowLocal) {
  console.error(`VITE_SITE_URL vaut « ${site} » : un QR code imprimé avec cette adresse ne fonctionnerait pas pour les visiteurs.\nMettez l’adresse publique définitive, ou ajoutez --local pour un simple essai.`);
  process.exit(1);
}

const res = await fetch(`${url}/rest/v1/artworks?select=id,title,is_demo&active=eq.true&order=id`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
if (!res.ok) { console.error('Impossible de lire les œuvres dans Supabase :', res.status, await res.text()); process.exit(1); }
const artworks = await res.json();
if (!artworks.length) { console.error('Aucune œuvre active dans la base : ajoutez-en avant de générer les QR codes.'); process.exit(1); }

const out = path.join(root, 'qr');
fs.mkdirSync(path.join(out, 'oeuvres'), { recursive: true });
const opts = { errorCorrectionLevel: 'Q', margin: 4, color: { dark: '#000000', light: '#FFFFFF' } };   // noir sur blanc : lecture la plus fiable

const items = [{ id: 'accueil', title: 'Accueil de l’exposition', link: `${site}/#/`, file: 'accueil' },
  ...artworks.map((a) => ({ id: a.id, title: a.title, demo: a.is_demo, link: `${site}/#/oeuvre/${a.id}`, file: `oeuvres/oeuvre-${a.id}` }))];

for (const it of items) {
  await QRCode.toFile(path.join(out, `${it.file}.png`), it.link, { ...opts, type: 'png', width: 1200 });
  fs.writeFileSync(path.join(out, `${it.file}.svg`), await QRCode.toString(it.link, { ...opts, type: 'svg' }));
}
fs.writeFileSync(path.join(out, 'liste.csv'), 'id;titre;adresse\n' + items.map((i) => `${i.id};"${i.title.replace(/"/g, '""')}";${i.link}`).join('\n') + '\n');

// Planche A4 : 12 QR codes par page, 3,5 cm de côté, étiquette lisible en dessous
const cards = [];
for (const it of items) {
  const svg = (await QRCode.toString(it.link, { ...opts, type: 'svg' })).replace(/<\?xml[^>]*\?>/, '');
  cards.push(`<figure><div class="qr">${svg}</div><figcaption><b>${esc(it.id === 'accueil' ? 'ACCUEIL' : 'n° ' + it.id)}</b><br>${esc(it.title)}${it.demo ? '<br><i>(démonstration)</i>' : ''}</figcaption></figure>`);
}
fs.writeFileSync(path.join(out, 'planche-impression.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><title>QR codes — NOUS ÉTIONS LÀ</title>
<style>
@page { size: A4; margin: 12mm; }
body { font: 10pt/1.25 Arial, sans-serif; margin: 0; color: #000; }
.sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm 6mm; }
figure { margin: 0; text-align: center; break-inside: avoid; border: 0.2mm dashed #999; padding: 3mm; }
.qr svg { width: 35mm; height: 35mm; display: block; margin: 0 auto 2mm; }
figcaption { font-size: 9pt; }
.note { font-size: 9pt; margin: 0 0 6mm; }
@media print { .note { display: none; } }
</style>
<p class="note">Imprimez à 100 % (« taille réelle »), en noir sur papier blanc mat. Chaque carré fait 3,5 cm : ne le réduisez pas. Les pointillés sont des repères de découpe.</p>
<main class="sheet">${cards.join('\n')}</main></html>`);

console.log(`${items.length} QR codes écrits dans : ${out}`);
console.log(`Exemple : ${items[1].link}`);
