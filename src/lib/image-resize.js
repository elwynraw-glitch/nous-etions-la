// Prépare une photographie pour le web : réduite à 1800 px max, enregistrée en JPEG.
// Bonus vie privée : la ré-encodage supprime les métadonnées de l'image (position GPS, appareil, date).
// L'original n'est PAS conservé par le site : gardez vos fichiers d'origine.
export async function resizeToJpeg(file, maxEdge = 1800, quality = 0.86) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Ce fichier n’est pas une image.');
  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch { throw new Error('Format d’image illisible par le navigateur. Exportez la photo en JPEG ou PNG (les fichiers HEIC ne sont pas pris en charge).'); }
  const k = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  if (!blob) throw new Error('La conversion de l’image a échoué.');
  return { blob, width: w, height: h };
}
