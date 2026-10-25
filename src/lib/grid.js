// Grille de pixels interactive. Dessinée dans un <canvas> pour rester fluide avec 2 500 cases.
// - souris : glisser pour se déplacer, molette pour zoomer, clic sur une case
// - tactile : un doigt pour se déplacer, deux doigts pour zoomer, toucher une case
// - clavier : flèches pour se déplacer de case en case, Entrée ou Espace pour choisir, + et - pour zoomer, 0 pour tout voir

const EMPTY = '#262626';
const LINE = '#0D0D0D';
const OFFWHITE = '#F0EDE6';
const BLUE = '#0448B5';
const MAX_SCALE = 48;
const TAP_MOVE = 8;     // pixels : au-delà, c'est un glissement et non un toucher
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export class MosaicGrid {
  constructor(host, { size = 50, onTap, onCursor } = {}) {
    this.host = host;
    this.size = size;
    this.onTap = onTap || (() => {});
    this.onCursor = onCursor || (() => {});
    this.cells = new Map();            // "x,y" -> couleur
    this.selected = null;              // { x, y, color } : case choisie, avec aperçu de la couleur
    this.mine = null;                  // { x, y } : le pixel du visiteur
    this.cursor = { x: Math.floor(size / 2), y: Math.floor(size / 2) };
    this.showCursor = false;           // visible seulement après usage du clavier
    this.flashes = new Map();
    this.pointers = new Map();
    this.scale = 8; this.ox = 0; this.oy = 0; this.minScale = 4;
    this.raf = 0;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'grid-canvas';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'application');
    this.canvas.setAttribute('aria-label', `Mosaïque de ${size} par ${size} cases. Flèches pour se déplacer, Entrée pour choisir une case, plus et moins pour zoomer.`);
    this.ctx = this.canvas.getContext('2d');
    host.append(this.canvas);

    this._bind();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize(true);
  }

  // ---------- Données ----------
  setCells(list) {                               // list = [[id, x, y, color], ...]
    this.cells.clear();
    for (const [, x, y, c] of list) this.cells.set(`${x},${y}`, c);
    this.invalidate();
  }
  setCell(x, y, color, flash = true) {
    this.cells.set(`${x},${y}`, color);
    if (flash && !reduceMotion()) this.flashes.set(`${x},${y}`, performance.now());
    this.invalidate();
  }
  removeCell(x, y) { this.cells.delete(`${x},${y}`); this.invalidate(); }
  has(x, y) { return this.cells.has(`${x},${y}`); }
  colorAt(x, y) { return this.cells.get(`${x},${y}`); }
  get count() { return this.cells.size; }
  select(x, y, color) { this.selected = { x, y, color }; this.invalidate(); }
  setPreviewColor(color) { if (this.selected) { this.selected.color = color; this.invalidate(); } }
  clearSelection() { this.selected = null; this.invalidate(); }
  setMine(pos) { this.mine = pos; this.invalidate(); }

  // ---------- Vue ----------
  resize(first = false) {
    const r = this.host.getBoundingClientRect();
    this.vw = Math.max(1, r.width); this.vh = Math.max(1, r.height);
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.vw * dpr);
    this.canvas.height = Math.round(this.vh * dpr);
    this.canvas.style.width = this.vw + 'px';
    this.canvas.style.height = this.vh + 'px';
    this.dpr = dpr;
    const pad = 12;
    const fit = Math.max(2, Math.min((this.vw - pad * 2) / this.size, (this.vh - pad * 2) / this.size));
    const wasFit = first || this.scale <= this.minScale + 0.01;
    this.minScale = fit;
    if (wasFit) { this.scale = fit; this.center(); } else { this.clamp(); }
    this.invalidate();
  }
  fit() { this.scale = this.minScale; this.center(); this.invalidate(); }
  center() { this.ox = (this.vw - this.size * this.scale) / 2; this.oy = (this.vh - this.size * this.scale) / 2; }
  clamp() {
    const gw = this.size * this.scale;
    const m = 40; // marge visible minimale
    this.ox = gw + m * 2 <= this.vw ? (this.vw - gw) / 2 : Math.min(m, Math.max(this.vw - gw - m, this.ox));
    this.oy = gw + m * 2 <= this.vh ? (this.vh - gw) / 2 : Math.min(m, Math.max(this.vh - gw - m, this.oy));
  }
  zoomAt(factor, cx = this.vw / 2, cy = this.vh / 2) {
    const next = Math.min(MAX_SCALE, Math.max(this.minScale, this.scale * factor));
    const k = next / this.scale;
    this.ox = cx - (cx - this.ox) * k;
    this.oy = cy - (cy - this.oy) * k;
    this.scale = next;
    this.clamp(); this.invalidate();
  }
  zoomBy(factor) { this.zoomAt(factor); }
  focusCell(x, y, minScale = 18) {
    if (this.scale < minScale) this.scale = Math.min(MAX_SCALE, Math.max(this.minScale, minScale));
    this.ox = this.vw / 2 - (x + 0.5) * this.scale;
    this.oy = this.vh / 2 - (y + 0.5) * this.scale;
    this.clamp(); this.invalidate();
  }
  cellAt(px, py) {
    const x = Math.floor((px - this.ox) / this.scale), y = Math.floor((py - this.oy) / this.scale);
    return x >= 0 && y >= 0 && x < this.size && y < this.size ? { x, y } : null;
  }

  // ---------- Dessin ----------
  invalidate() { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); }); }
  draw() {
    const { ctx, scale: s, ox, oy, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = LINE;
    ctx.fillRect(0, 0, this.vw, this.vh);
    const gap = s >= 9 ? Math.max(1, Math.min(2, s / 16)) : 0;
    // cases visibles seulement
    const x0 = Math.max(0, Math.floor(-ox / s)), x1 = Math.min(this.size - 1, Math.floor((this.vw - ox) / s));
    const y0 = Math.max(0, Math.floor(-oy / s)), y1 = Math.min(this.size - 1, Math.floor((this.vh - oy) / s));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        ctx.fillStyle = this.cells.get(`${x},${y}`) || EMPTY;
        ctx.fillRect(ox + x * s, oy + y * s, s - gap, s - gap);
      }
    }
    // contour de la grille entière
    ctx.strokeStyle = '#3A3A3A'; ctx.lineWidth = 1;
    ctx.strokeRect(ox - 0.5, oy - 0.5, this.size * s + gap, this.size * s + gap);

    if (this.mine) this._outline(this.mine.x, this.mine.y, OFFWHITE, 1.5, [4, 3], 2);
    if (this.selected) {
      const { x, y, color } = this.selected;
      ctx.fillStyle = color; ctx.fillRect(ox + x * s, oy + y * s, s - gap, s - gap);
      this._outline(x, y, OFFWHITE, 3, null, -1);
      this._outline(x, y, BLUE, 1.5, null, -3);
    }
    if (this.showCursor) this._outline(this.cursor.x, this.cursor.y, OFFWHITE, 2, [5, 3], -2);

    // pulsation des nouveaux pixels (temps réel)
    const now = performance.now(); let animating = false;
    for (const [key, t0] of this.flashes) {
      const p = (now - t0) / 900;
      if (p >= 1) { this.flashes.delete(key); continue; }
      animating = true;
      const [x, y] = key.split(',').map(Number);
      ctx.strokeStyle = `rgba(240,237,230,${1 - p})`; ctx.lineWidth = 2;
      const grow = p * s * 1.2;
      ctx.strokeRect(ox + x * s - grow / 2, oy + y * s - grow / 2, s + grow, s + grow);
    }
    if (animating) this.invalidate();
  }
  _outline(x, y, color, width, dash, inset) {
    const { ctx, scale: s, ox, oy } = this;
    const i = Math.min(inset, s / 4);
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
    ctx.strokeRect(ox + x * s + i, oy + y * s + i, s - 2 * i, s - 2 * i);
    ctx.restore();
  }

  // ---------- Interactions ----------
  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY, sx: e.offsetX, sy: e.offsetY, t: performance.now(), moved: false });
      this.showCursor = false;
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const nx = e.offsetX, ny = e.offsetY;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const before = Math.hypot(a.x - b.x, a.y - b.y);
        const mxB = (a.x + b.x) / 2, myB = (a.y + b.y) / 2;
        p.x = nx; p.y = ny; p.moved = true;
        const after = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        this.ox += mx - mxB; this.oy += my - myB;
        if (before > 0) this.zoomAt(after / before, mx, my);
        return;
      }
      if (!p.moved && Math.hypot(nx - p.sx, ny - p.sy) < TAP_MOVE) return;
      p.moved = true;
      this.ox += nx - p.x; this.oy += ny - p.y;
      p.x = nx; p.y = ny;
      this.clamp(); this.invalidate();
    });
    const end = (e) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (p && !p.moved && e.type === 'pointerup' && this.pointers.size === 0) {
        const cell = this.cellAt(e.offsetX, e.offsetY);
        if (cell) { this.cursor = cell; this.onTap(cell.x, cell.y); }
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.offsetX, e.offsetY);
    }, { passive: false });
    c.addEventListener('dblclick', (e) => this.zoomAt(1.8, e.offsetX, e.offsetY));
    c.addEventListener('keydown', (e) => {
      const k = e.key;
      const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (mv) {
        e.preventDefault();
        this.showCursor = true;
        this.cursor = {
          x: Math.min(this.size - 1, Math.max(0, this.cursor.x + mv[0])),
          y: Math.min(this.size - 1, Math.max(0, this.cursor.y + mv[1])),
        };
        this._reveal(this.cursor);
        this.onCursor(this.cursor.x, this.cursor.y);
        this.invalidate();
      } else if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        this.showCursor = true;
        this.onTap(this.cursor.x, this.cursor.y);
      } else if (k === '+' || k === '=') { e.preventDefault(); this.zoomBy(1.4); }
      else if (k === '-' || k === '_') { e.preventDefault(); this.zoomBy(1 / 1.4); }
      else if (k === '0') { e.preventDefault(); this.fit(); }
    });
    c.addEventListener('focus', () => { if (document.documentElement.dataset.input === 'keyboard') { this.showCursor = true; this.invalidate(); } });
    c.addEventListener('blur', () => { this.showCursor = false; this.invalidate(); });
  }
  _reveal({ x, y }) {  // fait défiler la vue si le curseur sort de l'écran
    const l = this.ox + x * this.scale, t = this.oy + y * this.scale, s = this.scale, m = 24;
    if (l < m) this.ox += m - l; else if (l + s > this.vw - m) this.ox -= l + s - (this.vw - m);
    if (t < m) this.oy += m - t; else if (t + s > this.vh - m) this.oy -= t + s - (this.vh - m);
    this.clamp();
  }

  destroy() {
    this.ro.disconnect();
    cancelAnimationFrame(this.raf);
    this.canvas.remove();
  }
}
