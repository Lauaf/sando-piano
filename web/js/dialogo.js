// Caja de diálogo estilo GBA: texto a máquina, japonés clicable, opciones con teclado.
import { $, el, sfx, esperar } from './util.js';
import { renderTokens } from './jp/texto.js';
import { P } from './progreso.js';

const caja = $('#dialogo');
const nNombre = $('#dialogo-nombre');
const nTexto = $('#dialogo-texto');
const nTrad = $('#dialogo-trad');
const nOpc = $('#dialogo-opciones');

export const dialogo = { activo: false };
let resolver = null;
let escribiendo = false;
let saltar = false;
let opciones = [];
let sel = 0;
let cancelable = false;

async function escribir(contenido) {
  escribiendo = true;
  saltar = false;
  caja.classList.add('escribiendo');
  nTexto.replaceChildren();
  if (typeof contenido === 'string') {
    for (const ch of contenido) {
      if (saltar) { nTexto.textContent = contenido; break; }
      nTexto.textContent += ch;
      if (ch.trim()) sfx.letra();
      await esperar(ch === '.' || ch === '…' || ch === '。' ? 90 : 22);
    }
  } else {
    // nodos (japonés con ruby): aparecen token por token
    nTexto.append(contenido);
    const raiz = contenido.querySelector('.jp') || contenido;
    const hijos = [...raiz.childNodes];
    const envolturas = hijos.map(h => {
      if (h.nodeType === 3) { const s = el('span', h.textContent); h.replaceWith(s); return s; }
      return h;
    });
    envolturas.forEach(h => { h.style.opacity = 0; });
    for (const h of envolturas) {
      if (!saltar) { sfx.letra(); await esperar(25 * Math.max(1, h.textContent.length)); }
      h.style.opacity = 1;
    }
  }
  escribiendo = false;
  caja.classList.remove('escribiendo');
}

function pintarOpciones() {
  [...nOpc.children].forEach((o, i) => o.classList.toggle('sel', i === sel));
}

/**
 * Muestra un diálogo. args: {nombre, texto | toks, trad, opciones:[{txt|nodo, valor}], cancelable}
 * Sin opciones resuelve al avanzar; con opciones resuelve con el valor elegido (o null si cancela).
 */
export async function decir(args) {
  if (typeof args === 'string') args = { texto: args };
  dialogo.activo = true;
  caja.classList.remove('oculto');
  nNombre.textContent = args.nombre || '';
  nTrad.classList.add('oculto');
  nOpc.replaceChildren();
  caja.classList.remove('con-opciones');
  opciones = args.opciones || [];
  cancelable = !!args.cancelable;
  sel = 0;

  let contenido = args.texto ?? '';
  let romajiNodo = null;
  if (args.toks) {
    const r = renderTokens(args.toks, { furigana: P.jp.furigana, romaji: args.romaji ?? P.jp.romaji });
    contenido = el('span', r.nodo);
    romajiNodo = r.romajiNodo;
  }
  await escribir(contenido);
  if (romajiNodo) nTexto.append(romajiNodo);
  if (args.trad) {
    nTrad.replaceChildren(
      args.tradOculta ? el('span', { style: { cursor: 'pointer' }, onclick: e => { e.stopPropagation(); e.target.textContent = args.trad; } }, '👁 ver traducción (T)') : args.trad);
    nTrad.classList.remove('oculto');
  }
  if (opciones.length) {
    caja.classList.add('con-opciones');
    opciones.forEach((o, i) => {
      const n = el('div.opcion', { onclick: e => { e.stopPropagation(); sel = i; confirmar(); }, onmouseenter: () => { sel = i; pintarOpciones(); } });
      if (o.toks) {
        const r = renderTokens(o.toks, { furigana: P.jp.furigana, romaji: false });
        n.append(r.nodo);
        // en opciones japonesas el clic en una palabra traduce; el clic en el resto elige
        if (o.romaji) n.append(el('div.suave', { style: { fontSize: '.65em' } }, o.romaji));
      } else n.append(o.nodo || o.txt);
      nOpc.append(n);
    });
    pintarOpciones();
  }
  return new Promise(r => { resolver = r; });
}

function confirmar() {
  if (escribiendo) { saltar = true; return; }
  const r = resolver;
  if (!r) return;
  resolver = null;
  sfx.cursor();
  const v = opciones.length ? opciones[sel].valor ?? sel : true;
  r(v);
}

export function cerrar() {
  caja.classList.add('oculto');
  dialogo.activo = false;
  resolver = null;
}

/** Secuencia de líneas del mismo personaje y cierre al final. */
export async function charla(nombre, lineas) {
  for (const l of lineas) await decir(typeof l === 'string' ? { nombre, texto: l } : { nombre, ...l });
  cerrar();
}

caja.addEventListener('click', e => {
  if (e.target.closest('.pal') || e.target.closest('.opcion')) return;
  if (!opciones.length || escribiendo) confirmar();
});

addEventListener('keydown', e => {
  if (!dialogo.activo || !resolver && !escribiendo) return;
  const k = e.key;
  if (['z', 'Z', 'Enter', ' '].includes(k)) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (!opciones.length || !escribiendo) confirmar(); else saltar = true;
  } else if (opciones.length && !escribiendo && ['ArrowDown', 'ArrowRight', 's', 'd'].includes(k)) {
    e.preventDefault(); e.stopImmediatePropagation();
    sel = (sel + 1) % opciones.length; sfx.cursor(); pintarOpciones();
  } else if (opciones.length && !escribiendo && ['ArrowUp', 'ArrowLeft', 'w', 'a'].includes(k)) {
    e.preventDefault(); e.stopImmediatePropagation();
    sel = (sel - 1 + opciones.length) % opciones.length; sfx.cursor(); pintarOpciones();
  } else if (['x', 'X', 'Escape'].includes(k)) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (escribiendo) saltar = true;
    else if (cancelable && resolver) { const r = resolver; resolver = null; r(null); }
    else if (!opciones.length) confirmar();
  } else if ((k === 't' || k === 'T') && nTrad.textContent.includes('ver traducción')) {
    nTrad.querySelector('span')?.click();
  }
}, true);
