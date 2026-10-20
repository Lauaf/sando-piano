// Ventanas de actividades (minijuegos) con pila de pantallas: Esc/X vuelve atrás.
import { $, el, sfx } from './util.js';
import { ocultarGlobo } from './jp/texto.js';

const raiz = $('#actividad');
const pila = [];      // [{titulo, sub, render, limpiar}]
let alCerrarTodo = null;
export const actividad = { abierta: false };

function montar() {
  const top = pila[pila.length - 1];
  if (top.limpiar) { try { top.limpiar(); } catch { /* */ } top.limpiar = null; }
  ocultarGlobo();
  const cuerpo = el('div.act-cuerpo');
  const barra = el('div.act-barra',
    el('button.btn.volver', { onclick: volver, title: 'Volver (Esc)' }, pila.length > 1 ? '◀ Volver' : '✕ Salir'),
    el('h2', top.titulo, top.sub ? el('small', top.sub) : null),
    top.extra || null);
  raiz.replaceChildren(barra, cuerpo);
  const ctx = {
    cuerpo, barra,
    ir: (titulo, render, opts = {}) => ir(titulo, render, opts),
    volver,
    rehacer: () => montar(),
    titulo: t => { barra.querySelector('h2').firstChild.textContent = t; },
  };
  const r = top.render(cuerpo, ctx);
  top.limpiar = typeof r === 'function' ? r : null;
}

/** Abre una actividad nueva (vacía la pila). clase: jp|piano|cafe|casa */
export function abrir(clase, titulo, render, { sub, alCerrar } = {}) {
  while (pila.length) { const p = pila.pop(); p.limpiar?.(); }
  raiz.className = clase;
  alCerrarTodo = alCerrar || null;
  actividad.abierta = true;
  sfx.puerta();
  ir(titulo, render, { sub });
}

export function ir(titulo, render, { sub, extra } = {}) {
  const top = pila[pila.length - 1];
  if (top?.limpiar) { top.limpiar(); top.limpiar = null; }
  pila.push({ titulo, sub, render, extra });
  montar();
}

export function volver() {
  const p = pila.pop();
  p?.limpiar?.();
  if (pila.length) { sfx.cursor(); montar(); return; }
  cerrar();
}

export function cerrar() {
  while (pila.length) { const p = pila.pop(); p.limpiar?.(); }
  raiz.classList.add('oculto');
  raiz.replaceChildren();
  actividad.abierta = false;
  ocultarGlobo();
  const cb = alCerrarTodo;
  alCerrarTodo = null;
  cb?.();
}

addEventListener('keydown', e => {
  if (!actividad.abierta) return;
  const enCampo = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  if (e.key === 'Escape' || (!enCampo && (e.key === 'x' || e.key === 'X') && !raiz.dataset.capturaX)) {
    if (enCampo && e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation(); // si no, la misma tecla abre el menú del mundo al cerrar
    volver();
  }
});
