import { h, clear, announce } from '../lib/dom.js';
import { go } from '../lib/router.js';
import * as store from '../lib/store.js';
import { parseArtworkQr, normalizeTypedNumber } from '../lib/scan.js';

const PROBLEMS = {
  NotAllowedError: 'L’accès à la caméra a été refusé. Autorisez-la dans les réglages de votre navigateur pour ce site, ou saisissez le numéro ci-dessous.',
  SecurityError: 'L’accès à la caméra a été refusé. Autorisez-la dans les réglages de votre navigateur pour ce site, ou saisissez le numéro ci-dessous.',
  NotFoundError: 'Aucune caméra n’a été trouvée sur cet appareil. Saisissez le numéro de la photographie ci-dessous.',
  NotReadableError: 'La caméra est utilisée par une autre application. Fermez-la, ou saisissez le numéro ci-dessous.',
  insecure: 'La caméra n’est disponible que sur une adresse sécurisée (https). Utilisez l’appareil photo de votre téléphone pour scanner le QR code, ou saisissez le numéro ci-dessous.',
};

export async function scannerView({ main }) {
  document.title = 'Scanner un QR code — NOUS ÉTIONS LÀ';
  let stream = null, stopped = false, timer = null, detector = null, jsQR = null, lastBad = '';

  const status = h('p', { class: 'note', role: 'status' }, 'Démarrage de la caméra…');
  const video = h('video', { class: 'scan-video', playsinline: true, autoplay: true, 'aria-label': 'Aperçu de la caméra' });
  video.muted = true;
  const frame = h('div', { class: 'scan-frame' }, video, h('div', { class: 'scan-reticle', 'aria-hidden': 'true' }));
  const canvas = document.createElement('canvas');

  // Saisie manuelle : toujours disponible (caméra refusée, QR abîmé, lecteur d'écran…)
  const num = h('input', { type: 'text', id: 'num', inputmode: 'text', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', 'aria-describedby': 'num-h', placeholder: 'ex. 001' });
  const numErr = h('p', { class: 'note err', role: 'alert', hidden: true });
  const manual = h('form', { class: 'stack', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const id = normalizeTypedNumber(num.value, (x) => Boolean(store.getArtwork(x)));
    if (!id) { numErr.hidden = false; numErr.textContent = 'Aucune photographie ne porte ce numéro. Le numéro est écrit sous le QR code, à côté de la photographie.'; announce(numErr.textContent); return; }
    stop(); go(`/oeuvre/${id}`);
  } },
    h('h2', null, 'Ou saisissez le numéro'),
    h('div', null, h('label', { class: 'field', for: 'num' }, 'Numéro de la photographie'),
      h('p', { class: 'small muted', id: 'num-h', style: 'margin:0 0 0.4rem' }, 'Il est écrit sous le QR code.'), num),
    numErr,
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'submit' }, 'Ouvrir la fiche')));

  function problem(kind) {
    frame.hidden = true;
    status.className = 'note warn';
    status.textContent = PROBLEMS[kind] || 'La caméra ne peut pas démarrer sur cet appareil. Saisissez le numéro ci-dessous.';
    announce(status.textContent);
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    video.srcObject = null;
  }

  async function start() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return problem('insecure');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) { return problem(e.name); }
    if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
    video.srcObject = stream;
    await video.play?.().catch(() => {});
    status.textContent = 'Placez le QR code dans le cadre, bien éclairé et à une distance de 15 à 30 cm.';
    if ('BarcodeDetector' in window) { try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { detector = null; } }
    if (!detector) jsQR = (await import('jsqr')).default;
    loop();
  }

  async function readFrame() {
    if (video.readyState < 2) return null;
    if (detector) { const r = await detector.detect(video); return r[0]?.rawValue || null; }
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    const k = Math.min(1, 720 / Math.max(vw, vh));
    canvas.width = Math.round(vw * k); canvas.height = Math.round(vh * k);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data || null;
  }

  function loop(delay = 150) {
    if (stopped) return;
    timer = setTimeout(async () => {
      if (stopped) return;
      try {
        const text = document.hidden ? null : await readFrame();
        if (text) {
          const id = parseArtworkQr(text);
          if (id) { navigator.vibrate?.(60); stop(); go(`/oeuvre/${id}`); return; }
          if (text !== lastBad) {   // un QR code d'ailleurs : on le dit une fois, puis on continue de chercher
            lastBad = text;
            status.className = 'note warn';
            status.textContent = 'Ce QR code n’appartient pas à l’exposition. Cherchez celui placé sous une photographie.';
            announce(status.textContent);
          }
          return loop(700);
        }
      } catch { /* image illisible : on réessaie */ }
      loop();
    }, delay);
  }

  main.append(h('div', { class: 'stack', style: 'max-width:30rem' },
    h('a', { class: 'back', href: '#/collection' }, 'Ma collection'),
    h('h1', null, 'Scanner un QR code'),
    frame, status, manual,
    h('p', { class: 'small muted' }, 'La caméra ne sert qu’à lire le QR code : aucune image n’est enregistrée ni envoyée.')));
  start();
  return stop;
}
