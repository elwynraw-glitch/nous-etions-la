import { h } from './dom.js';
import { imageUrl } from './api.js';

// Image de démonstration : cadre sombre rayé, clairement identifié comme faux.
function placeholderSvg(id) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" role="img">
  <defs><pattern id="p" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
  <rect width="14" height="14" fill="#101419"/><rect width="2" height="14" fill="#0A2A6E"/></pattern></defs>
  <rect width="400" height="300" fill="url(#p)"/>
  <rect x="120" y="118" width="160" height="64" fill="#0D0D0D"/>
  <text x="200" y="146" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#F0EDE6">Image de démonstration</text>
  <text x="200" y="168" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#B8B5AE">n° ${id}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function artworkImg(art, { eager = false, className = '' } = {}) {
  const src = imageUrl(art.image_path) || placeholderSvg(art.id);
  return h('img', {
    src, class: 'art-img ' + className, loading: eager ? 'eager' : 'lazy', decoding: 'async',
    alt: art.image_path ? `Photographie : ${art.title}` : `Image de démonstration, œuvre ${art.id}`,
  });
}
