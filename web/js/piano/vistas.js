// Componentes visuales: teclado en pantalla y pentagrama en canvas.
import { el } from '../util.js';
import { esNegra, nombreNota, teclaPCDe, pulsar, soltar, entrada } from './entrada.js';
import { P } from '../progreso.js';

export function teclado(lo, hi, { etiquetas = 'ambas' } = {}) {
  const blancas = [];
  for (let m = lo; m <= hi; m++) if (!esNegra(m)) blancas.push(m);
  const nodo = el('div.teclado');
  const teclas = new Map();
  const ancho = 100 / blancas.length;
  const posiciones = new Map();
  const etiqueta = m => {
    const n = etiquetas !== 'pc' ? nombreNota(m, P.piano.nombres) : '';
    const pc = etiquetas !== 'nombre' && entrada.pcActivo ? teclaPCDe(m) : '';
    return [esNegra(m) ? '' : n, pc ? el('div', { style: { opacity: 0.55, fontSize: '.85em' } }, pc) : null];
  };
  blancas.forEach((m, i) => {
    const t = el('div.tecla', { style: { flexDirection: 'column', gap: '2px' } }, ...etiqueta(m));
    teclas.set(m, t);
    posiciones.set(m, { x: i * ancho, w: ancho });
    nodo.append(t);
  });
  for (let m = lo; m <= hi; m++) {
    if (!esNegra(m)) continue;
    const i = blancas.indexOf(m - 1);
    if (i < 0) continue;
    const x = (i + 1) * ancho - ancho * 0.31;
    const t = el('div.tecla.negra', { style: { left: x + '%', width: ancho * 0.62 + '%', flexDirection: 'column' } }, ...etiqueta(m));
    teclas.set(m, t);
    posiciones.set(m, { x, w: ancho * 0.62 });
    nodo.append(t);
  }
  // mouse / táctil
  let apretada = null;
  const down = e => {
    const t = e.target.closest('.tecla');
    if (!t) return;
    e.preventDefault();
    const m = [...teclas].find(([, v]) => v === t)?.[0];
    if (m == null) return;
    apretada = m;
    pulsar(m, 'pantalla');
  };
  const up = () => { if (apretada != null) { soltar(apretada, 'pantalla'); apretada = null; } };
  nodo.addEventListener('pointerdown', down);
  addEventListener('pointerup', up);
  // reflejar notas tocadas desde cualquier fuente
  const oyente = ev => {
    const t = teclas.get(ev.m);
    if (t) t.classList.toggle('on', ev.tipo === 'on');
  };
  entrada.oyentes.add(oyente);
  return {
    nodo, teclas, posiciones, lo, hi,
    marcar(m, clase, on = true) { teclas.get(m)?.classList.toggle(clase, on); },
    limpiar(clase) { teclas.forEach(t => t.classList.remove(clase)); },
    destruir() { entrada.oyentes.delete(oyente); removeEventListener('pointerup', up); },
  };
}

/** Rango de teclado (lo, hi) que cubre las notas, ajustado a Do..Si completos. */
export function rangoPara(notas, minimoBlancas = 15) {
  let lo = Math.min(...notas), hi = Math.max(...notas);
  lo = lo - (((lo % 12) + 12) % 12);           // bajar a Do
  hi = hi + (11 - (((hi % 12) + 12) % 12));    // subir a Si
  while ((hi - lo + 1) * 7 / 12 < minimoBlancas) { hi += 12; }
  return [lo, hi];
}

// ---------- Pentagrama ----------
const LETRA = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; // índice diatónico de cada semitono (sostenidos)
export const diatonico = m => Math.floor(m / 12) * 7 + LETRA[((m % 12) + 12) % 12];
const D_E4 = diatonico(64), D_G2 = diatonico(43);

export function pentagrama(g, { x, y, w, esp, clave = 'sol', tinta = '#2a2140' }) {
  g.strokeStyle = tinta;
  g.lineWidth = Math.max(1, esp / 9);
  for (let i = 0; i < 5; i++) {
    g.beginPath(); g.moveTo(x, y + i * esp); g.lineTo(x + w, y + i * esp); g.stroke();
  }
  g.fillStyle = tinta;
  g.textBaseline = 'alphabetic';
  if (clave === 'sol') {
    g.font = `${esp * 6.2}px "Segoe UI Symbol", "Noto Music", serif`;
    g.fillText('𝄞', x + esp * 0.2, y + esp * 4.65);
  } else {
    g.font = `${esp * 3.3}px "Segoe UI Symbol", "Noto Music", serif`;
    g.fillText('𝄢', x + esp * 0.3, y + esp * 2.95);
  }
}

/** y del centro de la nota m en un pentagrama cuya primera línea (arriba) está en y. */
export function yNota(m, { y, esp, clave = 'sol' }) {
  const abajo = y + 4 * esp;
  const ref = clave === 'sol' ? D_E4 : D_G2;
  return abajo - (diatonico(m) - ref) * esp / 2;
}

export function nota(g, m, cx, opts) {
  const { y, esp, clave = 'sol', color = '#2a2140', etiqueta = null } = opts;
  const cy = yNota(m, opts);
  const abajo = y + 4 * esp;
  g.strokeStyle = color; g.fillStyle = color;
  g.lineWidth = Math.max(1, esp / 9);
  // líneas adicionales
  for (let ly = abajo + esp; ly <= cy + 0.1; ly += esp) { g.beginPath(); g.moveTo(cx - esp * 0.95, ly); g.lineTo(cx + esp * 0.95, ly); g.stroke(); }
  for (let ly = y - esp; ly >= cy - 0.1; ly -= esp) { g.beginPath(); g.moveTo(cx - esp * 0.95, ly); g.lineTo(cx + esp * 0.95, ly); g.stroke(); }
  g.beginPath(); g.ellipse(cx, cy, esp * 0.62, esp * 0.45, -0.35, 0, Math.PI * 2); g.fill();
  const arriba = cy > y + 2 * esp;
  g.lineWidth = Math.max(1, esp / 8);
  g.beginPath();
  if (arriba) { g.moveTo(cx + esp * 0.56, cy - 1); g.lineTo(cx + esp * 0.56, cy - esp * 3.3); }
  else { g.moveTo(cx - esp * 0.56, cy + 1); g.lineTo(cx - esp * 0.56, cy + esp * 3.3); }
  g.stroke();
  if (esNegra(m)) {
    g.font = `${esp * 1.6}px "Segoe UI Symbol", serif`;
    g.textBaseline = 'middle';
    g.fillText('♯', cx - esp * 1.9, cy);
  }
  if (etiqueta) {
    g.font = `${esp * 1.1}px DotGothic16, monospace`;
    g.textBaseline = 'top';
    g.textAlign = 'center';
    g.fillText(etiqueta, cx, Math.max(abajo + esp * 1.6, cy + esp * 1.2));
    g.textAlign = 'left';
  }
  return cy;
}
