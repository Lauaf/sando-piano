// Utilidades comunes: DOM, azar, fechas, toasts y efectos de sonido chiptune.

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

/** el('div.clase#id', {atributos/eventos}, ...hijos) */
export function el(tag, props = {}, ...hijos) {
  const [base, ...resto] = tag.split(/(?=[.#])/);
  const n = document.createElement(base || 'div');
  for (const r of resto) {
    if (r[0] === '.') n.classList.add(r.slice(1));
    else n.id = r.slice(1);
  }
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    hijos.unshift(props);
    props = {};
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k in n && k !== 'list') n[k] = v;
    else n.setAttribute(k, v);
  }
  for (const h of hijos.flat(Infinity)) {
    if (h == null || h === false) continue;
    n.append(h instanceof Node ? h : document.createTextNode(String(h)));
  }
  return n;
}

export const esperar = ms => new Promise(r => setTimeout(r, ms));
export const azar = (a, b) => a + Math.random() * (b - a);
export const entero = (a, b) => Math.floor(azar(a, b + 1));
export const elegir = arr => arr[Math.floor(Math.random() * arr.length)];
export const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
export function mezclar(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** n elementos distintos de arr, excluyendo los que cumplen `excluir` */
export function distractores(arr, n, excluir = () => false) {
  return mezclar(arr.filter(x => !excluir(x))).slice(0, n);
}

export function hoy(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export function diasEntre(a, b) {
  return Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 86400000);
}

/** Aviso corto arriba a la derecha de la pantalla del juego. tipo: info|xp|mision|logro|nivel */
export function toast(texto, ms = 3400, tipo = 'info') {
  const caja = document.getElementById('toasts');
  const t = el('div.toast.' + tipo, { role: 'status', style: { animationDuration: ms + 'ms' } }, texto);
  caja.append(t);
  while (caja.children.length > 4) caja.firstChild.remove(); // que no se apilen infinitos
  setTimeout(() => t.remove(), ms);
}

// ---------- Celebraciones (subir de nivel, logros): un cartel grande que se va solo ----------
const colaCelebrar = [];
let celebrando = false;
/** {ico, titulo, texto, tipo: 'nivel'|'logro'} — se muestran de a una. */
export function celebrar(c) {
  colaCelebrar.push(c);
  if (!celebrando) siguienteCelebracion();
}
function siguienteCelebracion() {
  const c = colaCelebrar.shift();
  const raiz = document.getElementById('celebracion');
  if (!c || !raiz) { celebrando = false; return; }
  celebrando = true;
  const chispas = Array.from({ length: 14 }, (_, i) => el('i.chispa', { style: { '--a': `${i * (360 / 14)}deg`, '--d': `${60 + (i % 3) * 22}px` } }));
  raiz.className = 'cel-' + (c.tipo || 'nivel');
  raiz.replaceChildren(el('div.cel-caja', chispas, el('div.cel-ico', c.ico), el('div.cel-tit', c.titulo), c.texto ? el('div.cel-txt', c.texto) : null));
  (c.tipo === 'logro' ? sfx.logro : sfx.subir)();
  const fuera = () => { raiz.className = 'oculto'; raiz.onclick = null; setTimeout(siguienteCelebracion, 200); };
  const t = setTimeout(fuera, 2900);
  raiz.onclick = () => { clearTimeout(t); fuera(); };
}

/** Simula una tecla (para la cruceta táctil y el mando): los manejadores de teclado ya existentes la atienden. */
export function simularTecla(tipo, key, code = key) {
  dispatchEvent(new KeyboardEvent(tipo, { key, code, bubbles: true, cancelable: true }));
}

// ---------- Sonidos (WebAudio, sin archivos) ----------
let ctx = null;
export function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export const sonido = { activo: true, volumen: 1 }; // volumen: 0..1 (lo ajusta Opciones)

function beep(freq, dur = 0.08, tipo = 'square', vol = 0.06, cuando = 0) {
  if (!sonido.activo || sonido.volumen <= 0) return;
  const a = audio();
  const t = a.currentTime + cuando;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol * sonido.volumen, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
export const sfx = {
  letra: () => beep(880 + Math.random() * 60, 0.025, 'square', 0.02),
  cursor: () => beep(660, 0.04, 'square', 0.04),
  aceptar: () => { beep(784, 0.06); beep(1046, 0.08, 'square', 0.06, 0.06); },
  bien: () => { beep(988, 0.07, 'square', 0.05); beep(1319, 0.12, 'square', 0.05, 0.07); },
  mal: () => { beep(196, 0.15, 'sawtooth', 0.05); beep(147, 0.2, 'sawtooth', 0.05, 0.12); },
  golpe: () => beep(110, 0.12, 'square', 0.08),
  subir: () => [523, 659, 784, 1046, 1319].forEach((f, i) => beep(f, 0.12, 'square', 0.05, i * 0.09)),
  puerta: () => { beep(330, 0.06, 'triangle', 0.08); beep(262, 0.1, 'triangle', 0.08, 0.06); },
  paso: () => beep(90 + Math.random() * 20, 0.02, 'triangle', 0.03),
  inicio: () => [392, 523, 659, 784, 659, 1046].forEach((f, i) => beep(f, i === 5 ? 0.3 : 0.1, 'square', 0.045, i * 0.085)),
  logro: () => [784, 988, 1175, 1568].forEach((f, i) => beep(f, i === 3 ? 0.25 : 0.08, 'triangle', 0.07, i * 0.07)),
};

// ---------- Voz (TTS del navegador; Edge trae voces japonesas naturales) ----------
let voces = [];
function cargarVoces() { voces = speechSynthesis.getVoices(); }
if ('speechSynthesis' in window) {
  cargarVoces();
  speechSynthesis.onvoiceschanged = cargarVoces;
}
export function vozPara(lang) {
  const de = voces.filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(lang));
  return de.find(v => /natural|online/i.test(v.name)) || de[0] || null;
}
export function hablar(texto, lang = 'ja', vel = 0.9) {
  if (!('speechSynthesis' in window) || !texto) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  const v = vozPara(lang);
  if (v) u.voice = v;
  u.lang = v ? v.lang : (lang === 'ja' ? 'ja-JP' : 'es-AR');
  u.rate = vel;
  speechSynthesis.speak(u);
  return !!v;
}
