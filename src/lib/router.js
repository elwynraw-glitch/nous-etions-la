// Routage par « # » : https://site/#/oeuvre/001
// (GitHub Pages ne sait pas servir de vraies adresses /oeuvre/001 ; avec le # tout fonctionne partout.)
export function parseHash(hash = location.hash) {
  const path = hash.replace(/^#\/?/, '').split('?')[0].replace(/\/+$/, '');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const [name = '', arg = ''] = parts;
  switch (name) {
    case '': return { name: 'home' };
    case 'oeuvre': return arg ? { name: 'artwork', id: arg.toLowerCase() } : { name: 'notfound' };
    case 'collection': return { name: 'collection' };
    case 'choix': return { name: 'choose' };
    case 'mosaique': return { name: 'mosaic', kiosk: arg === 'plein-ecran' };
    case 'reprendre': return { name: 'restore' };
    case 'confidentialite': return { name: 'privacy' };
    case 'scanner': return { name: 'scanner' };
    case 'admin': return { name: 'admin' };
    default: return { name: 'notfound' };
  }
}
export const go = (path) => { location.hash = '#' + path; };
