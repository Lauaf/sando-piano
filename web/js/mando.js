// Mando / joystick (Gamepad API, distribución estándar tipo Xbox): cruceta o palanca para moverse,
// A = hablar / elegir, B = volver, Start = menú. Igual que la cruceta táctil, simula teclas.
import { simularTecla, toast } from './util.js';
import { actividad } from './actividad.js';
import { dialogo } from './dialogo.js';

const BOTON = { 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight' };
const ZONA_MUERTA = 0.5;
const REPETIR_TRAS = 380, REPETIR_CADA = 140; // ms, para recorrer menús dejando apretado

const apretadas = new Map(); // tecla -> {desde, ultima}

function direccionesDe(pad) {
  const dirs = new Set();
  for (const [i, k] of Object.entries(BOTON)) if (pad.buttons[i]?.pressed) dirs.add(k);
  const [x = 0, y = 0] = pad.axes;
  if (Math.abs(x) > ZONA_MUERTA && Math.abs(x) >= Math.abs(y)) dirs.add(x > 0 ? 'ArrowRight' : 'ArrowLeft');
  else if (Math.abs(y) > ZONA_MUERTA) dirs.add(y > 0 ? 'ArrowDown' : 'ArrowUp');
  return dirs;
}

/** A: en una ventana de actividad "aprieta" el botón con foco (las teclas simuladas no hacen clic solas). */
function confirmar() {
  const foco = document.activeElement;
  if (actividad.abierta && !dialogo.activo && foco && foco !== document.body && document.getElementById('actividad').contains(foco)) {
    if (/BUTTON|A/.test(foco.tagName)) return foco.click();
  }
  if (actividad.abierta && !dialogo.activo && (!foco || foco === document.body)) return simularTecla('keydown', 'ArrowDown', 'ArrowDown');
  simularTecla('keydown', 'Enter', 'Enter');
  simularTecla('keyup', 'Enter', 'Enter');
}

const accionesBoton = {
  0: confirmar,
  1: () => { simularTecla('keydown', 'Escape', 'Escape'); simularTecla('keyup', 'Escape', 'Escape'); },
  9: () => { simularTecla('keydown', 'm', 'KeyM'); simularTecla('keyup', 'm', 'KeyM'); },
};
let antes = {};

function leer(t) {
  const pads = navigator.getGamepads?.() || [];
  const pad = [...pads].find(p => p && p.connected);
  if (pad) {
    const dirs = direccionesDe(pad);
    for (const k of dirs) {
      const a = apretadas.get(k);
      if (!a) { apretadas.set(k, { desde: t, ultima: t }); simularTecla('keydown', k, k); }
      else if (t - a.desde > REPETIR_TRAS && t - a.ultima > REPETIR_CADA) { a.ultima = t; simularTecla('keydown', k, k); }
    }
    for (const k of [...apretadas.keys()]) if (!dirs.has(k)) { apretadas.delete(k); simularTecla('keyup', k, k); }
    for (const [i, fn] of Object.entries(accionesBoton)) {
      const ahora = !!pad.buttons[i]?.pressed;
      if (ahora && !antes[i]) fn();
      antes[i] = ahora;
    }
  }
  requestAnimationFrame(leer);
}

export function montarMando() {
  if (!navigator.getGamepads) return;
  addEventListener('gamepadconnected', () => toast('🎮 Mando conectado: A elegir · B volver · Start menú'));
  addEventListener('gamepaddisconnected', () => { for (const k of apretadas.keys()) simularTecla('keyup', k, k); apretadas.clear(); });
  requestAnimationFrame(leer);
}
