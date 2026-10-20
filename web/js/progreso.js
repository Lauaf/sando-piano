// Estado de la partida: XP por habilidad, niveles, racha, misiones diarias,
// repaso espaciado (Leitner) y guardado (servidor + localStorage de respaldo).
import { hoy, diasEntre, toast, sfx, elegir, mezclar, $ } from './util.js';

export const SKILLS = {
  jp: { nombre: 'Japonés', ico: 'あ', titulos: ['Turista', 'Aprendiz de kana', 'Lector de kana', 'Viajero', 'Conversador', 'Senpai', 'Sensei'] },
  piano: { nombre: 'Piano', ico: '♪', titulos: ['Oyente', 'Principiante', 'Aprendiz', 'Intérprete', 'Pianista', 'Concertista', 'Maestro'] },
  cafe: { nombre: 'Café', ico: '☕', titulos: ['Tomador de café', 'Aprendiz de barista', 'Barista', 'Barista experto', 'Catador', 'Tostador', 'Maestro cafetero'] },
};

const NUEVA = () => ({
  version: 1,
  creado: hoy(),
  presentado: false,
  skills: { jp: { xp: 0 }, piano: { xp: 0 }, cafe: { xp: 0 } },
  racha: { dias: 0, ultimo: null, mejor: 0 },
  historial: {},          // fecha -> {jp, piano, cafe} (xp ganada ese día)
  misiones: { fecha: null, lista: [] },
  srs: {},                // clave -> {c: caja, p: próxima fecha, a: aciertos, e: errores}
  jp: { nivel: null, furigana: true, romaji: true, chat: [], mazo: [] }, // mazo: palabras guardadas en el cine
  piano: { nivel: null, nombres: 'latino', practica: [] },
  cafe: { nivel: null, equipo: [], bitacora: [] },
  stats: {},              // contadores varios (eventos)
  logros: [],
  pos: null,
  opciones: { sonido: true },
});

export let P = NUEVA();

// ---------- XP y niveles ----------
export const nivelDe = xp => Math.floor(Math.sqrt(xp / 40)) + 1;
export const xpDeNivel = n => 40 * (n - 1) ** 2;
export function tituloDe(skill) {
  const t = SKILLS[skill].titulos;
  return t[Math.min(t.length - 1, Math.floor((nivelDe(P.skills[skill].xp) - 1) / 2))];
}
export const nivelTotal = () => Object.keys(SKILLS).reduce((s, k) => s + nivelDe(P.skills[k].xp), 0) - 2;

export function ganarXP(skill, xp, motivo = '') {
  if (!xp) return;
  const antes = nivelDe(P.skills[skill].xp);
  P.skills[skill].xp += xp;
  const f = hoy();
  P.historial[f] ??= { jp: 0, piano: 0, cafe: 0 };
  P.historial[f][skill] += xp;
  actualizarRacha();
  const despues = nivelDe(P.skills[skill].xp);
  if (despues > antes) {
    sfx.subir();
    toast(`⬆ ¡${SKILLS[skill].nombre} nivel ${despues}! — ${tituloDe(skill)}`, 4500);
  } else if (motivo) {
    toast(`+${xp} XP ${SKILLS[skill].ico} ${motivo}`, 2200);
  }
  pintarHUD();
  guardar();
}

function actualizarRacha() {
  const f = hoy();
  const r = P.racha;
  if (r.ultimo === f) return;
  r.dias = r.ultimo && diasEntre(r.ultimo, f) === 1 ? r.dias + 1 : 1;
  r.ultimo = f;
  r.mejor = Math.max(r.mejor, r.dias);
  if (r.dias > 1) toast(`🔥 Racha de ${r.dias} días`);
}
export function rachaViva() {
  const r = P.racha;
  if (!r.ultimo) return 0;
  return diasEntre(r.ultimo, hoy()) <= 1 ? r.dias : 0;
}

// ---------- Eventos, misiones diarias y logros ----------
const POOL = {
  jp: [
    { ev: 'kana_ganada', meta: 1, texto: 'Ganale una batalla a un yokai de kana', solo: 'basico' },
    { ev: 'gramatica_ok', meta: 8, texto: 'Acertá 8 ejercicios de gramática N4/N3', solo: 'avanzado' },
    { ev: 'vocab_ok', meta: 15, texto: 'Acertá 15 palabras en el repaso' },
    { ev: 'chat_jp', meta: 5, texto: 'Mandale 5 mensajes en japonés a Haru-sensei' },
    { ev: 'vecino_jp', meta: 3, texto: 'Charlá con 3 vecinos del pueblo (en japonés)' },
    { ev: 'cine_lineas', meta: 30, texto: 'Mirá 30 líneas de un video en el cine' },
    { ev: 'cine_palabra', meta: 5, texto: 'Guardá 5 palabras nuevas de un video del cine' },
  ],
  piano: [
    { ev: 'nota_ok', meta: 25, texto: 'Leé 25 notas en el pentagrama' },
    { ev: 'cancion_fin', meta: 1, texto: 'Tocá una canción completa' },
    { ev: 'oido_ok', meta: 8, texto: 'Acertá 8 ejercicios de oído' },
    { ev: 'practica_real', meta: 10, texto: 'Practicá 10 min en tu piano real (registralo)' },
  ],
  cafe: [
    { ev: 'brew_lab', meta: 3, texto: 'Prepará 3 cafés en el laboratorio' },
    { ev: 'pedido_ok', meta: 4, texto: 'Atendé 4 pedidos bien hechos' },
    { ev: 'bitacora', meta: 1, texto: 'Registrá un café real en la bitácora' },
    { ev: 'quiz_cafe_ok', meta: 6, texto: 'Acertá 6 preguntas del quiz barista' },
    { ev: 'academia', meta: 3, texto: 'Completá 3 actividades de la Academia de barismo' },
    { ev: 'diag_ok', meta: 3, texto: 'Diagnosticá bien 3 espressos' },
  ],
};

export function misionesDeHoy() {
  const f = hoy();
  if (P.misiones.fecha !== f) {
    P.misiones = {
      fecha: f,
      lista: Object.entries(POOL).map(([skill, pool]) => {
        const tipo = ['n4', 'n3'].includes(P.jp.nivel) ? 'avanzado' : 'basico';
        const m = elegir(pool.filter(x => !x.solo || x.solo === tipo));
        return { skill, ev: m.ev, meta: m.meta, texto: m.texto, prog: 0, hecha: false };
      }),
    };
    guardar();
  }
  return P.misiones.lista;
}

const LOGROS = [
  { id: 'hiragana', txt: 'Dominaste el hiragana', cond: () => kanaDominados('h') >= 46 },
  { id: 'katakana', txt: 'Dominaste el katakana', cond: () => kanaDominados('k') >= 46 },
  { id: 'racha7', txt: '7 días seguidos practicando', cond: () => P.racha.dias >= 7 },
  { id: 'racha30', txt: '30 días seguidos', cond: () => P.racha.dias >= 30 },
  { id: 'notas100', txt: '100 notas leídas', cond: () => (P.stats.nota_ok || 0) >= 100 },
  { id: 'cancion5', txt: '5 canciones terminadas', cond: () => (P.stats.cancion_fin || 0) >= 5 },
  { id: 'brew_perfecto', txt: 'Una extracción perfecta en el laboratorio', cond: () => (P.stats.brew_perfecto || 0) >= 1 },
  { id: 'bitacora10', txt: '10 cafés reales en la bitácora', cond: () => (P.stats.bitacora || 0) >= 10 },
  // Academia de barismo: logros por habilidades reales, no por tiempo jugado
  { id: 'esp_balanceado', txt: 'Un espresso balanceado y sin canalizar', cond: () => (P.stats.esp_ok || 0) >= 1 },
  { id: 'carrera_espresso', txt: 'Completaste la carrera de espresso', cond: () => (P.stats.carrera_espresso || 0) >= 1 },
  { id: 'diagnostico10', txt: '10 espressos bien diagnosticados', cond: () => (P.stats.diag_ok || 0) >= 10 },
  { id: 'corazon', txt: 'Tu primer corazón de latte art', cond: () => (P.stats.latte_corazon || 0) >= 1 },
  { id: 'rosetta', txt: 'Una rosetta aprobada', cond: () => (P.stats.latte_rosetta || 0) >= 1 },
  { id: 'rush_limpio', txt: 'Un turno de Rush Hour sin perder clientes', cond: () => (P.stats.rush_limpio || 0) >= 1 },
  { id: 'cientifico', txt: '5 experimentos A/B cambiando una sola variable', cond: () => (P.stats.ab_unavariable || 0) >= 5 },
  { id: 'tostador', txt: 'Un blend aprobado por el tostador', cond: () => (P.stats.blend_ok || 0) >= 1 },
  { id: 'cine1', txt: 'Terminaste tu primera función en el cine', cond: () => (P.stats.cine_fin || 0) >= 1 },
  { id: 'mazo50', txt: '50 palabras guardadas de videos', cond: () => (P.jp.mazo?.length || 0) >= 50 },
  { id: 'trinidad', txt: 'Las tres sendas en un mismo día', cond: () => { const h = P.historial[hoy()]; return h && h.jp > 0 && h.piano > 0 && h.cafe > 0; } },
];
function kanaDominados(tipo) {
  return Object.entries(P.srs).filter(([k, v]) => k.startsWith(`kana:${tipo}:`) && v.c >= 3).length;
}

export function evento(ev, n = 1) {
  P.stats[ev] = (P.stats[ev] || 0) + n;
  for (const m of misionesDeHoy()) {
    if (m.ev !== ev || m.hecha) continue;
    m.prog = Math.min(m.meta, m.prog + n);
    if (m.prog >= m.meta) {
      m.hecha = true;
      sfx.subir();
      toast(`✅ Misión diaria cumplida: ${m.texto}`, 4500);
      ganarXP(m.skill, 30);
    }
  }
  for (const l of LOGROS) {
    if (!P.logros.includes(l.id) && l.cond()) {
      P.logros.push(l.id);
      toast(`🏅 Logro: ${l.txt}`, 5000);
    }
  }
  guardar();
}
export const listaLogros = () => LOGROS.map(l => ({ ...l, tiene: P.logros.includes(l.id) }));

// ---------- Repaso espaciado (Leitner) ----------
const INTERVALOS = [0, 1, 2, 4, 8, 16, 32]; // días por caja
export function srsDato(clave) { return P.srs[clave]; }
export function srsResponder(clave, acierto) {
  const d = P.srs[clave] ?? { c: 0, a: 0, e: 0 };
  d.c = acierto ? Math.min(INTERVALOS.length - 1, d.c + 1) : Math.max(0, d.c - 2);
  acierto ? d.a++ : d.e++;
  const f = new Date();
  f.setDate(f.getDate() + INTERVALOS[d.c]);
  d.p = hoy(f);
  P.srs[clave] = d;
}
/**
 * Elige los próximos `n` ítems a practicar: primero los vencidos (cajas bajas primero),
 * después algunos nuevos (máx `nuevos`), y si falta, cualquiera.
 */
export function srsCola(items, clave, n = 10, nuevos = 5) {
  const f = hoy();
  const vencidos = [], sinVer = [], resto = [];
  for (const it of items) {
    const d = P.srs[clave(it)];
    if (!d) sinVer.push(it);
    else if (d.p <= f) vencidos.push(it);
    else resto.push(it);
  }
  vencidos.sort((a, b) => P.srs[clave(a)].c - P.srs[clave(b)].c);
  let cola = mezclar(vencidos.slice(0, n));
  cola = cola.concat(sinVer.slice(0, Math.max(0, Math.min(nuevos, n - cola.length))));
  if (cola.length < n) cola = cola.concat(mezclar(resto).slice(0, n - cola.length));
  return mezclar(cola);
}
export function srsResumen(items, clave) {
  const f = hoy();
  let nuevos = 0, vencidos = 0, dominados = 0;
  for (const it of items) {
    const d = P.srs[clave(it)];
    if (!d) nuevos++;
    else {
      if (d.p <= f) vencidos++;
      if (d.c >= 3) dominados++;
    }
  }
  return { nuevos, vencidos, dominados, total: items.length };
}

// ---------- Guardado ----------
let timer = null;
export function guardar(inmediato = false) {
  clearTimeout(timer);
  const hacer = async () => {
    P.guardadoEn = Date.now();
    const txt = JSON.stringify(P);
    try { localStorage.setItem('sando', txt); } catch { /* sin storage */ }
    try {
      await fetch('/api/partida', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: txt });
    } catch { /* servidor caído: queda en localStorage */ }
  };
  if (inmediato) return hacer();
  timer = setTimeout(hacer, 800);
}

function fusionar(base, datos) {
  for (const [k, v] of Object.entries(datos || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) fusionar(base[k], v);
    else base[k] = v;
  }
  return base;
}

export async function cargar() {
  let servidor = null, local = null;
  try { servidor = await (await fetch('/api/partida')).json(); } catch { /* */ }
  try { local = JSON.parse(localStorage.getItem('sando') || 'null'); } catch { /* */ }
  const xpTotal = d => d?.skills ? Object.values(d.skills).reduce((s, x) => s + (x.xp || 0), 0) : -1;
  const mejor = xpTotal(local) > xpTotal(servidor) ? local : servidor;
  P = fusionar(NUEVA(), mejor && mejor.version ? mejor : {});
  misionesDeHoy();
  return P;
}

/**
 * Si otra ventana guardó una partida más nueva (ej: el juego abierto en Edge y en otro lado),
 * la traemos antes de seguir, para que no se pisen.
 */
export async function sincronizar() {
  try {
    const srv = await (await fetch('/api/partida')).json();
    if (srv?.version && (srv.guardadoEn || 0) > (P.guardadoEn || 0)) {
      clearTimeout(timer);
      P = fusionar(NUEVA(), srv);
      misionesDeHoy();
      pintarHUD();
      return true;
    }
  } catch { /* sin servidor */ }
  return false;
}

export function reiniciarPartida() {
  P = NUEVA();
  guardar(true);
}

// ---------- HUD ----------
export function pintarHUD() {
  for (const k of Object.keys(SKILLS)) {
    const xp = P.skills[k].xp;
    const n = nivelDe(xp);
    const pct = ((xp - xpDeNivel(n)) / (xpDeNivel(n + 1) - xpDeNivel(n))) * 100;
    const s = document.querySelector(`.skill[data-skill=${k}]`);
    s.querySelector('i').style.width = pct + '%';
    s.querySelector('b').textContent = n;
    s.title = `${SKILLS[k].nombre} — Nv ${n} (${tituloDe(k)}) · ${xp} XP`;
  }
  $('#hud-nivel').textContent = `Nv ${nivelTotal()}`;
  $('#hud-racha').textContent = `🔥 ${rachaViva()}`;
}
