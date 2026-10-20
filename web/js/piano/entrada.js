// Sonido de piano sintetizado + entradas unificadas: teclado de la PC, piano MIDI,
// micrófono (detección de altura para piano acústico) y teclado en pantalla.
import { audio, sonido } from '../util.js';

export const NOMBRES = {
  latino: ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'],
  ingles: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
};
export const esNegra = m => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
export const octava = m => Math.floor(m / 12) - 1;
export function nombreNota(m, sistema = 'latino', conOctava = false) {
  return NOMBRES[sistema][((m % 12) + 12) % 12] + (conOctava ? octava(m) : '');
}
/** "C#4" / "Eb5" -> midi */
export function midiDe(txt) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(txt.trim());
  if (!m) throw new Error('nota inválida ' + txt);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  return (+m[3] + 1) * 12 + base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
export const frec = m => 440 * 2 ** ((m - 69) / 12);

// ---------- Síntesis tipo piano (aditiva con decaimiento) ----------
let salida = null;
function bus() {
  const a = audio();
  if (!salida) {
    salida = a.createGain();
    salida.gain.value = 0.5;
    const comp = a.createDynamicsCompressor();
    salida.connect(comp).connect(a.destination);
  }
  return a;
}
const activas = new Map();
export function sonar(m, vel = 0.8, dur = null) {
  if (!sonido.activo) return;
  const a = bus();
  const t = a.currentTime;
  const f = frec(m);
  const g = a.createGain();
  const decae = 2.8 - (m - 48) / 30;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.32 * vel, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.12 * vel, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0008, t + Math.max(0.8, decae));
  const filtro = a.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.setValueAtTime(Math.min(12000, f * 10), t);
  filtro.frequency.exponentialRampToValueAtTime(Math.min(8000, f * 3), t + 0.4);
  g.connect(filtro).connect(salida);
  const osc = [[1, 1, 'triangle'], [2, 0.38, 'sine'], [3, 0.14, 'sine'], [4, 0.07, 'sine'], [1.003, 0.4, 'sine']].map(([h, amp, tipo]) => {
    const o = a.createOscillator();
    const og = a.createGain();
    o.type = tipo;
    o.frequency.value = f * h;
    og.gain.value = amp;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + Math.max(0.9, decae) + 0.1);
    return o;
  });
  const nota = { g, osc };
  activas.set(m, nota);
  if (dur) {
    setTimeout(() => apagar(m, nota), dur * 1000);
    // lo que suena solo (demo, oído) no debe contarse como nota tocada si el mic lo escucha por los parlantes
    entrada.mic.mudoHasta = Math.max(entrada.mic.mudoHasta, performance.now() + Math.min(dur, 1.2) * 1000);
  }
}
export function apagar(m, nota = activas.get(m)) {
  if (!nota) return;
  const a = audio();
  const t = a.currentTime;
  nota.g.gain.cancelScheduledValues(t);
  nota.g.gain.setValueAtTime(nota.g.gain.value, t);
  nota.g.gain.exponentialRampToValueAtTime(0.0005, t + 0.25);
  if (activas.get(m) === nota) activas.delete(m);
}
export function clic(acento = false) {
  const a = audio();
  const t = a.currentTime;
  const o = a.createOscillator();
  const g = a.createGain();
  o.frequency.value = acento ? 1760 : 1100;
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + 0.06);
}

// ---------- Entradas ----------
const TECLAS_PC = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon', 'Quote', 'BracketRight'];
export const LETRAS_PC = ['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J', 'K', 'O', 'L', 'P', 'Ñ', '´', '+'];

export const entrada = {
  base: 60,           // nota de la tecla A
  oyentes: new Set(), // fn({tipo:'on'|'off', m, vel, fuente})
  midi: { ok: false, nombres: [] },
  mic: { activo: false, nota: null, umbral: 0.006, nivel: 0, dispositivo: '', mudoHasta: 0, ultima: null, cents: 0, afinacion: 0 },
  pcActivo: false,
  sonarPC: true,
  apretadas: new Set(),
};

function emitir(ev) {
  if (ev.tipo === 'on') entrada.apretadas.add(ev.m); else entrada.apretadas.delete(ev.m);
  for (const f of entrada.oyentes) f(ev);
}
export function pulsar(m, fuente = 'pantalla', vel = 0.8) {
  if (fuente === 'pc' || fuente === 'pantalla') sonar(m, vel);
  emitir({ tipo: 'on', m, vel, fuente });
}
export function soltar(m, fuente = 'pantalla') {
  if (fuente === 'pc' || fuente === 'pantalla') apagar(m);
  emitir({ tipo: 'off', m, fuente });
}
export function escuchar(fn) { entrada.oyentes.add(fn); return () => entrada.oyentes.delete(fn); }
export function teclaPCDe(m) {
  const i = m - entrada.base;
  return i >= 0 && i < LETRAS_PC.length ? LETRAS_PC[i] : '';
}

addEventListener('keydown', e => {
  if (!entrada.pcActivo || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
  if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
  const i = TECLAS_PC.indexOf(e.code);
  if (i < 0) return;
  e.preventDefault();
  e.stopPropagation();
  pulsar(entrada.base + i, 'pc');
}, true);
addEventListener('keyup', e => {
  if (!entrada.pcActivo) return;
  const i = TECLAS_PC.indexOf(e.code);
  if (i >= 0) soltar(entrada.base + i, 'pc');
}, true);

export async function activarMIDI() {
  if (!navigator.requestMIDIAccess) return false;
  try {
    const acc = await navigator.requestMIDIAccess();
    const conectar = () => {
      entrada.midi.nombres = [];
      for (const inp of acc.inputs.values()) {
        entrada.midi.nombres.push(inp.name);
        inp.onmidimessage = ({ data }) => {
          const [st, nota, vel] = data;
          const tipo = st & 0xf0;
          if (tipo === 0x90 && vel > 0) pulsar(nota, 'midi', vel / 127);
          else if (tipo === 0x80 || (tipo === 0x90 && vel === 0)) soltar(nota, 'midi');
        };
      }
      entrada.midi.ok = entrada.midi.nombres.length > 0;
    };
    acc.onstatechange = conectar;
    conectar();
    return entrada.midi.ok;
  } catch {
    return false;
  }
}

// ---------- Micrófono: detección de altura ----------
let micCtx = null;
export async function listarMics() {
  try {
    const d = await navigator.mediaDevices.enumerateDevices();
    return d.filter(x => x.kind === 'audioinput').map(x => ({ id: x.deviceId, nombre: x.label || 'Micrófono' }));
  } catch { return []; }
}

export async function activarMic(on = true, dispositivo = entrada.mic.dispositivo) {
  entrada.mic.activo = false;
  micCtx?.stream.getTracks().forEach(t => t.stop());
  micCtx = null;
  if (entrada.mic.nota != null) { soltar(entrada.mic.nota, 'mic'); entrada.mic.nota = null; }
  if (!on) return false;
  entrada.mic.dispositivo = dispositivo || '';
  const a = audio();
  const audioReq = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  if (dispositivo && dispositivo !== 'default') audioReq.deviceId = { exact: dispositivo };
  const stream = await navigator.mediaDevices.getUserMedia({ audio: audioReq });
  const src = a.createMediaStreamSource(stream);
  const an = a.createAnalyser();
  an.fftSize = 4096;
  src.connect(an);
  micCtx = { stream, an, buf: new Float32Array(an.fftSize), rmsPrev: 0, candidata: null, cuenta: 0 };
  entrada.mic.activo = true;
  const bucle = () => {
    if (!entrada.mic.activo || !micCtx) return;
    detectar(a.sampleRate);
    requestAnimationFrame(bucle);
  };
  bucle();
  return true;
}

/**
 * Detección de altura con el método McLeod (NSDF: autocorrelación normalizada).
 * A diferencia de la autocorrelación simple no tira las notas graves hacia arriba,
 * y elige el período fundamental en vez del armónico (evita errores de octava).
 */
const MPM_K = 0.9;
let xs = null;
function mpm(buf, sr) {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < entrada.mic.umbral) return { f: -1, rms, claridad: 0 };
  // bajamos a la mitad de frecuencia de muestreo: 2x más rápido y ventana igual de larga
  const n = buf.length >> 1, sr2 = sr / 2;
  if (!xs || xs.length !== n) xs = new Float32Array(n);
  for (let i = 0; i < n; i++) xs[i] = (buf[2 * i] + buf[2 * i + 1]) * 0.5;
  const L = Math.min(n >> 1, Math.ceil(sr2 / 50)); // hasta 50 Hz
  const nsdf = new Float32Array(L);
  let m = 0;
  for (let j = 0; j < n; j++) m += 2 * xs[j] * xs[j];
  for (let tau = 0; tau < L; tau++) {
    let acf = 0;
    for (let j = 0; j < n - tau; j++) acf += xs[j] * xs[j + tau];
    nsdf[tau] = m > 0 ? 2 * acf / m : 0;
    m -= xs[n - tau - 1] * xs[n - tau - 1] + xs[tau] * xs[tau];
  }
  // máximos "clave": el mayor de cada tramo positivo después del primer cruce por cero
  const picos = [];
  let tau = 1;
  while (tau < L && nsdf[tau] > 0) tau++;
  while (tau < L) {
    while (tau < L && nsdf[tau] <= 0) tau++;
    let mejor = -1;
    while (tau < L && nsdf[tau] > 0) {
      if (mejor < 0 || nsdf[tau] > nsdf[mejor]) mejor = tau;
      tau++;
    }
    if (mejor > 0 && mejor < L - 1) picos.push(mejor);
  }
  if (!picos.length) return { f: -1, rms, claridad: 0 };
  const maximo = Math.max(...picos.map(t => nsdf[t]));
  const t0 = picos.find(t => nsdf[t] >= MPM_K * maximo);
  const a = nsdf[t0 - 1], b = nsdf[t0], c = nsdf[t0 + 1];
  const den = a - 2 * b + c;
  const tf = den ? t0 + 0.5 * (a - c) / den : t0;
  return { f: sr2 / tf, rms, claridad: b };
}

/** Pasa frecuencia a nota MIDI teniendo en cuenta la afinación calibrada del piano. */
function aNota(f) {
  const mf = 69 + 12 * Math.log2(f / 440) - (entrada.mic.afinacion || 0) / 100;
  const nota = Math.round(mf);
  return { nota, mf, cents: (mf - nota) * 100, crudo: 69 + 12 * Math.log2(f / 440) };
}

let calibrando = null;
/**
 * Calibración: el usuario toca varias veces la nota `objetivo` (cualquier octava) durante `ms`.
 * Medimos cuántos cents está corrida y lo guardamos. Devuelve los cents, o null si no hubo
 * suficientes muestras o no parecía ser esa nota.
 */
export function calibrar(ms = 8000, objetivo = 60) {
  return new Promise(res => {
    calibrando = [];
    calibrando.objetivo = objetivo;
    setTimeout(() => {
      const muestras = calibrando.sort((x, y) => x - y);
      calibrando = null;
      if (muestras.length < 10) return res(null);
      const mediana = muestras[muestras.length >> 1];
      if (Math.abs(mediana) > 90) return res(null); // no era la nota pedida
      entrada.mic.afinacion = Math.round(mediana);
      res(entrada.mic.afinacion);
    }, ms);
  });
}

function detectar(sr) {
  const m = micCtx;
  m.an.getFloatTimeDomainData(m.buf);
  const { f, rms, claridad } = mpm(m.buf, sr);
  entrada.mic.nivel = rms;
  const u = entrada.mic.umbral;
  const ataque = rms > m.rmsPrev * 1.7 && rms > u * 2.5;
  if (performance.now() < entrada.mic.mudoHasta) { m.rmsPrev = rms; m.candidata = null; return; }
  m.rmsPrev = rms * 0.6 + m.rmsPrev * 0.4;
  if (f < 50 || f > 2200 || claridad < 0.6) {
    if (entrada.mic.nota != null && rms < u) { soltar(entrada.mic.nota, 'mic'); entrada.mic.nota = null; }
    m.candidata = null;
    return;
  }
  let { nota, mf, cents, crudo } = aNota(f);
  // histéresis: una nota que suena justo entre dos teclas no tiene que titilar
  if (entrada.mic.nota != null && Math.abs(mf - entrada.mic.nota) < 0.7) {
    nota = entrada.mic.nota;
    cents = (mf - nota) * 100;
  }
  entrada.mic.ultima = nota;
  entrada.mic.cents = cents;
  if (calibrando && claridad > 0.85) {
    const rel = ((((crudo - calibrando.objetivo) % 12) + 18) % 12) - 6; // distancia al Do más cercano, en semitonos
    calibrando.push(rel * 100);
  }
  if (nota === m.candidata) m.cuenta++;
  else { m.candidata = nota; m.cuenta = 1; }
  if (m.cuenta === 3 && (nota !== entrada.mic.nota || ataque)) {
    if (entrada.mic.nota != null) soltar(entrada.mic.nota, 'mic');
    entrada.mic.nota = nota;
    pulsar(nota, 'mic', Math.min(1, rms / u / 10));
  } else if (ataque && nota === entrada.mic.nota && m.cuenta > 3) {
    pulsar(nota, 'mic', Math.min(1, rms / u / 10));
  }
}
