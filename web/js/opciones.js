// Opciones: sonido, velocidad del texto, pantalla y respaldo de la partida. Los cambios se aplican al instante.
import { el, hoy, sonido, sfx, toast } from './util.js';
import { P, guardar, reiniciarPartida, importarPartida } from './progreso.js';

/** Aplica las opciones guardadas y avisa al resto de la app (tamaño de pantalla). */
export function aplicarOpciones() {
  const o = P.opciones;
  sonido.activo = o.sonido !== false;
  sonido.volumen = Math.max(0, Math.min(100, o.volumen ?? 100)) / 100;
  dispatchEvent(new CustomEvent('sando:opciones'));
}

function cambiar(clave, valor) {
  P.opciones[clave] = valor;
  aplicarOpciones();
  guardar();
}

/** Grupo de botones donde se elige uno (aria-pressed para lectores de pantalla). */
function selector(opts, actual, alElegir) {
  const cont = el('div.chips', { role: 'group' });
  const pintar = v => cont.querySelectorAll('.chip').forEach((b, i) => {
    b.classList.toggle('sel', opts[i][0] === v);
    b.setAttribute('aria-pressed', opts[i][0] === v);
  });
  opts.forEach(([v, txt]) => cont.append(el('button.chip', { onclick: () => { alElegir(v); pintar(v); sfx.cursor(); } }, txt)));
  pintar(actual);
  return cont;
}

const fila = (titulo, ayuda, control) => el('div.op-fila',
  el('div.op-tit', titulo, ayuda ? el('div.suave', ayuda) : null), el('div.op-control', control));

export function pantallaOpciones(c, ctx) {
  const o = P.opciones;
  const vol = el('input', { type: 'range', min: 0, max: 100, step: 5, value: o.volumen ?? 100, 'aria-label': 'Volumen de los efectos' });
  const volTxt = el('span.val', `${o.volumen ?? 100}%`);
  vol.addEventListener('input', () => { volTxt.textContent = `${vol.value}%`; cambiar('volumen', +vol.value); });
  vol.addEventListener('change', () => sfx.aceptar());

  const archivo = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
  archivo.addEventListener('change', async () => {
    const f = archivo.files[0];
    if (!f) return;
    try {
      if (!importarPartida(JSON.parse(await f.text()))) throw new Error();
      toast('Partida restaurada. Recargando…');
      setTimeout(() => location.reload(), 900);
    } catch { toast('Ese archivo no parece un respaldo de Sandō.'); }
  });

  c.append(
    el('div.panel.op-grupo', el('div.op-cab', 'Sonido'),
      fila('Efectos de sonido', 'Pasos, menús, aciertos y errores.',
        selector([[true, 'Sí'], [false, 'No']], o.sonido !== false, v => cambiar('sonido', v))),
      fila('Volumen', null, el('div.op-rango', vol, volTxt))),
    el('div.panel.op-grupo', el('div.op-cab', 'Diálogos'),
      fila('Velocidad del texto', 'Con Z / Enter siempre podés saltar al final de la línea.',
        selector([['lento', 'Lento'], ['normal', 'Normal'], ['rapido', 'Rápido'], ['instantaneo', 'Instantáneo']], o.texto || 'normal', v => cambiar('texto', v)))),
    el('div.panel.op-grupo', el('div.op-cab', 'Pantalla'),
      fila('Píxeles perfectos', 'Escala entera: el pixel art se ve más nítido, la pantalla queda un poco más chica.',
        selector([[false, 'Ajustar a la ventana'], [true, 'Escala entera']], !!o.escalaEntera, v => cambiar('escalaEntera', v)))),
    el('div.panel.op-grupo', el('div.op-cab', 'Partida'),
      el('div.suave', 'Se guarda sola en la carpeta datos/ de la app (partida.json, con una copia por día) y en este navegador.'),
      el('div.fila',
        el('button.btn', { onclick: () => {
          const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(P, null, 1)], { type: 'application/json' })), download: `sando-${hoy()}.json` });
          a.click();
        } }, '↓ Exportar respaldo'),
        el('button.btn', { onclick: () => archivo.click() }, '↑ Restaurar respaldo'), archivo)),
    el('div.panel.op-grupo.peligro', el('div.op-cab.no', 'Zona peligrosa'),
      el('div.fila', el('button.btn', { onclick: e => {
        if (e.currentTarget.dataset.seguro) { reiniciarPartida(); location.reload(); return; }
        e.currentTarget.dataset.seguro = '1';
        e.currentTarget.textContent = '¿Seguro? Tocá otra vez para borrar todo';
      } }, 'Empezar de cero'))),
  );
  void ctx;
}
