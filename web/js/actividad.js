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
  // transición de entrada tipo "iris" (como al cruzar una puerta en los juegos de GBA)
  raiz.classList.remove('iris'); void raiz.offsetWidth; raiz.classList.add('iris');
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
  const f = $('#fundido'); // al salir, el pueblo aparece desde negro
  if (f) { f.classList.remove('activo'); void f.offsetWidth; f.classList.add('activo'); }
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

// ---------- Navegación con flechas (teclado, mando o cruceta) entre los botones de la ventana ----------
// Mueve el foco al botón más cercano en esa dirección. Si el minijuego ya usa las flechas
// (latte art, pedidos, cine…) llama a preventDefault y acá no se hace nada.
const FOCO = 'button:not(:disabled), a[href], input:not([type=hidden]):not(:disabled), select, [tabindex]:not([tabindex="-1"])';

function visibles() {
  return [...raiz.querySelectorAll(FOCO)].filter(n => {
    if (n.closest('[hidden], .oculto')) return false;
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

function moverFoco(tecla) {
  const lista = visibles();
  if (!lista.length) return;
  const actual = document.activeElement;
  let destino = null;
  if (!actual || actual === document.body || !raiz.contains(actual)) {
    const enCuerpo = lista.filter(n => n.closest('.act-cuerpo'));
    destino = enCuerpo.find(n => n.matches('.tarjeta, .ac-leccion, .poster')) || enCuerpo.find(n => n.matches('.btn.prim')) || enCuerpo[0] || lista[0];
  } else {
    const a = actual.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    const [ex, ey] = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[tecla];
    let mejor = Infinity;
    for (const n of lista) {
      if (n === actual) continue;
      const r = n.getBoundingClientRect();
      const dx = r.left + r.width / 2 - ax, dy = r.top + r.height / 2 - ay;
      const avance = dx * ex + dy * ey;          // cuánto avanza en la dirección pedida
      const desvio = Math.abs(dx * ey) + Math.abs(dy * ex); // cuánto se corre hacia el costado
      if (avance <= 4) continue;
      const puntaje = avance + desvio * 2.2;
      if (puntaje < mejor) { mejor = puntaje; destino = n; }
    }
  }
  if (!destino) return;
  destino.focus({ preventScroll: true });
  destino.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  sfx.cursor();
}

addEventListener('keydown', e => {
  if (!actividad.abierta || !e.key.startsWith('Arrow') || e.altKey || e.ctrlKey || e.metaKey) return;
  const foco = document.activeElement;
  const enOtroControl = foco && foco !== document.body && raiz.contains(foco) && !/^(BUTTON|A)$/.test(foco.tagName);
  if (enOtroControl) return; // un slider, un campo de texto o un canvas usan las flechas a su manera
  setTimeout(() => { if (!e.defaultPrevented && actividad.abierta) moverFoco(e.key); }, 0);
});
