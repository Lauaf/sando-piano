// Canciones: biblioteca (tarea, canciones propias importadas, clásicas), importador y reproductor
// de notas que caen con acordes, dos manos, tempo, bucle por compases y digitación editable.
import { el, sfx, toast, hoy } from '../util.js';
import { P, ganarXP, evento, guardar } from '../progreso.js';
import { entrada, escuchar, sonar, nombreNota, esNegra, clic } from './entrada.js';
import { teclado, rangoPara } from './vistas.js';
import { digitar } from './digitacion.js';
import { CANCIONES } from '../datos/canciones.js';

const nn = m => nombreNota(m, P.piano.nombres);
const coincide = (ev, m) => ev.m === m || (ev.fuente !== 'midi' && ev.fuente !== 'pantalla' && ((ev.m - m) % 12 === 0));
const api = async (ruta, cuerpo) => {
  const r = await fetch(ruta, cuerpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) } : undefined);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};

/** Canción incluida -> formato común (con digitación guardada por el usuario si la editó). */
function clasica(s) {
  const propios = P.piano.dedosPropios?.[s.id];
  return { id: s.id, tit: s.tit, bpm: s.bpm, compas: 4, propia: false,
    notas: s.notas.map((n, i) => ({ m: n.m, t: n.t, d: n.d, mano: 'd', dedo: propios?.[i] ?? n.dedo ?? null })) };
}
async function propia(id) {
  const d = await api(`/api/cancion?id=${id}`);
  return { id: d.id, tit: d.titulo, bpm: d.bpm || 90, compas: d.compas || 4, compas_txt: d.compas_txt, paso: d.paso, propia: true, aproximada: d.aproximada, tarea: d.tarea, fuente: d.fuente, notas: d.notas };
}

// ---------- Biblioteca ----------
export function biblioteca(c, ctx) {
  P.piano.modoCancion ??= 'aprender';
  const zonaPropias = el('div', el('div.suave', 'Cargando tus canciones…'));
  c.append(
    el('div.chips', [['aprender', '🐢 Aprender (te espera)'], ['ritmo', '🥁 Con ritmo'], ['escuchar', '👂 Escuchar']].map(([v, t]) =>
      el('button.chip' + (P.piano.modoCancion === v ? '.sel' : ''), { onclick: () => { P.piano.modoCancion = v; guardar(); ctx.rehacer(); } }, t))),
    zonaPropias,
    el('div', { style: { marginTop: '6px' } }, '🎼 Clásicas para empezar'),
    el('div.rejilla', CANCIONES.map(s => {
      const mejor = P.piano.mejores[s.id];
      return el('button.tarjeta', { onclick: () => ctx.ir(s.tit, (cc, cx) => reproducir(cc, cx, clasica(s))) },
        el('div.t-tit', s.tit), el('div.t-desc', s.desc),
        el('div.t-tag', `${'★'.repeat(s.nivel)} · ${s.notas.length} notas${mejor ? ` · mejor ${mejor}%` : ''}`));
    })));
  api('/api/canciones').then(lista => {
    const tareas = lista.filter(x => x.tarea?.activa);
    const otras = lista.filter(x => !x.tarea?.activa);
    const ICO = { youtube: '▶️', audio: '🎧', partitura: '📄', musicxml: '🎼', midi: '🎹' };
    const tarjeta = x => {
      const min = Math.round(P.piano.minutos?.[x.id] || 0);
      const mejor = P.piano.mejores[x.id];
      return el('button.tarjeta', { onclick: async () => { try { const s = await propia(x.id); ctx.ir(s.tit, (cc, cx) => reproducir(cc, cx, s)); } catch (e) { toast(`No pude abrirla: ${e.message}`); } } },
        el('div.t-tit', `${ICO[x.fuente] || '🎵'} ${x.titulo}`),
        x.tarea?.activa ? el('div.t-desc', `📝 ${x.tarea.texto || 'tarea'}${x.tarea.fecha ? ` · para el ${x.tarea.fecha.slice(8)}/${x.tarea.fecha.slice(5, 7)}` : ''}`) : null,
        el('div.t-tag', `${x.notas} notas${mejor ? ` · mejor ${mejor}%` : ''}${min ? ` · ${min} min` : ''}${x.aproximada ? ' · transcripción automática' : ''}`));
    };
    zonaPropias.replaceChildren(
      tareas.length ? el('div', '📝 Tarea de piano') : null,
      tareas.length ? el('div.rejilla', tareas.map(tarjeta)) : null,
      el('div', { style: { marginTop: '6px' } }, '🎵 Mis canciones'),
      el('div.rejilla',
        el('button.tarjeta', { onclick: () => ctx.ir('Agregar canción', agregar) },
          el('div.t-ico', '➕'), el('div.t-tit', 'Agregar canción'), el('div.t-desc', 'Link de YouTube, audio, partitura (PDF/foto) o archivo de MuseScore / MIDI.')),
        ...otras.map(tarjeta)));
  }).catch(() => zonaPropias.replaceChildren(el('div.suave', 'No pude leer tus canciones (¿está corriendo el servidor?).')));
}

// ---------- Agregar ----------
function agregar(c, ctx) {
  const url = el('input.entrada', { placeholder: 'https://www.youtube.com/watch?v=…', style: { flex: 1 } });
  const titulo = el('input.entrada', { placeholder: 'Nombre (opcional)', style: { width: '16em' } });
  const archivo = el('input', { type: 'file', accept: '.mid,.midi,.musicxml,.xml,.mxl,.pdf,.png,.jpg,.jpeg,.webp,.mp3,.wav,.m4a,.ogg,.flac', style: { display: 'none' } });
  const estado = el('div');
  const zona = el('div.panel', { style: { textAlign: 'center', borderStyle: 'dashed', cursor: 'pointer', padding: '1.2em' } },
    '📄 Arrastrá acá una partitura (PDF, foto), un archivo MuseScore/MusicXML/MIDI o un audio', el('div.suave', 'o hacé clic para elegirlo'));
  for (const i of [url, titulo]) i.addEventListener('keydown', e => e.stopPropagation());
  zona.onclick = () => archivo.click();
  zona.ondragover = e => { e.preventDefault(); zona.style.borderColor = 'var(--acento)'; };
  zona.ondragleave = () => { zona.style.borderColor = ''; };
  zona.ondrop = e => { e.preventDefault(); zona.style.borderColor = ''; if (e.dataTransfer.files[0]) subirArchivo(e.dataTransfer.files[0]); };
  archivo.onchange = () => archivo.files[0] && subirArchivo(archivo.files[0]);

  async function seguir(id) {
    let ultimo = '';
    for (;;) {
      await new Promise(r => setTimeout(r, 1200));
      if (!c.isConnected) return;
      let j;
      try { j = await api(`/api/trabajo?id=${id}`); } catch { continue; }
      if (j.mensaje !== ultimo) { ultimo = j.mensaje; }
      estado.replaceChildren(el('div', j.mensaje), el('div.hp', { style: { marginTop: '6px' } }, el('i', { style: { width: (j.pct || 1) + '%', background: 'var(--oro)' } })));
      if (j.estado === 'error') { sfx.mal(); estado.append(el('div.no', '✗ No se pudo convertir.')); return; }
      if (j.estado === 'listo' && j.cancion) {
        sfx.bien();
        const s = await propia(j.cancion);
        estado.append(el('div.fila', { style: { marginTop: '8px' } },
          el('button.btn.prim', { onclick: () => ctx.ir(s.tit, (cc, cx) => reproducir(cc, cx, s)) }, `▶ Practicar "${s.tit}"`),
          el('button.btn', { onclick: () => ctx.volver() }, 'Volver a la biblioteca')));
        return;
      }
    }
  }
  async function enviar(cuerpo) {
    estado.replaceChildren(el('div.escribiendo-ia', 'Enviando'));
    try {
      const { id } = await api('/api/importar', { ...cuerpo, titulo: titulo.value.trim() });
      seguir(id);
    } catch (e) { estado.replaceChildren(el('div.no', `✗ ${e.message}`)); }
  }
  function subirArchivo(f) {
    if (f.size > 60e6) return toast('El archivo es muy grande (máx 60 MB)');
    const lector = new FileReader();
    lector.onload = () => enviar({ nombre: f.name, datos: String(lector.result).split(',')[1] });
    lector.readAsDataURL(f);
  }
  c.append(
    el('div.panel',
      el('div', '▶️ Desde YouTube (o cualquier link de audio/video)'),
      el('div.fila', { style: { marginTop: '6px' } }, url, el('button.btn.prim', { onclick: () => url.value.trim() && enviar({ url: url.value.trim() }) }, 'Convertir'))),
    zona, archivo,
    el('div.fila', titulo),
    estado,
    el('div.panel.suave', { style: { fontSize: '.78em', lineHeight: 1.6 } },
      '💡 Lo más fiel para la tarea: pedile a tu profe el archivo de MuseScore (o bajalo de musescore.com) y exportalo como MusicXML o MIDI: trae las dos manos, los compases y la digitación escrita.', el('br'),
      '📄 Las partituras escaneadas y las fotos se leen con visión automática: funcionan con piezas simples y fotos derechas y nítidas, pero pueden tener errores.', el('br'),
      '🎧 YouTube y los audios se transcriben "de oído" (como un dictado): sale bien la melodía y aproximado el resto. Usá 👂 Escuchar para comparar y el tempo para ir lento.'));
}

// ---------- Tarea ----------
function editorTarea(c, ctx, s, alGuardar) {
  const t = s.tarea || {};
  const texto = el('textarea.entrada', { rows: 3, style: { width: '100%' }, placeholder: 'Qué pidió el profe (ej: compases 1 a 8, manos separadas, a 60 bpm)' }, t.texto || '');
  const fecha = el('input.entrada', { type: 'date', value: t.fecha || '' });
  const desde = el('input.entrada', { type: 'number', min: 1, value: t.desde || '', style: { width: '5em' } });
  const hasta = el('input.entrada', { type: 'number', min: 1, value: t.hasta || '', style: { width: '5em' } });
  for (const i of [texto, fecha, desde, hasta]) i.addEventListener('keydown', e => e.stopPropagation());
  c.append(
    el('div', 'Qué hay que practicar'), texto,
    el('div.fila', 'Para el', fecha, 'Compases', desde, 'a', hasta),
    el('div.fila',
      el('button.btn.prim', { onclick: async () => {
        s.tarea = { activa: true, texto: texto.value.trim(), fecha: fecha.value, desde: +desde.value || null, hasta: +hasta.value || null };
        await api('/api/cancion', { id: s.id, tarea: s.tarea });
        toast('📝 Tarea guardada'); alGuardar?.(); ctx.volver();
      } }, '💾 Guardar tarea'),
      t.activa ? el('button.btn', { onclick: async () => {
        s.tarea = { ...t, activa: false, terminada: hoy() };
        await api('/api/cancion', { id: s.id, tarea: s.tarea });
        sfx.subir(); toast('✅ ¡Tarea cumplida!'); ganarXP('piano', 25, 'tarea cumplida'); alGuardar?.(); ctx.volver();
      } }, '✅ Ya la cumplí') : null));
}

// ---------- Reproductor ----------
export function reproducir(c, ctx, s) {
  P.piano.ajustesCancion ??= {};
  P.piano.minutos ??= {};
  const aj = P.piano.ajustesCancion[s.id] ??= { manos: 'ambas', tempo: 1, acompanar: true, bucle: null };
  // la tarea y las partituras se practican leyendo la partitura; lo demás arranca en cascada
  aj.vista ??= (s.tarea?.activa || ['musicxml', 'midi', 'partitura'].includes(s.fuente)) ? 'partitura' : 'cascada';
  const enPartitura = aj.vista === 'partitura';
  if (s.tarea?.activa && s.tarea.desde && !aj.bucle) aj.bucle = [s.tarea.desde, s.tarea.hasta || s.tarea.desde];
  const modo = P.piano.modoCancion || 'aprender';
  const compas = s.compas || 4;
  const hayDos = s.notas.some(n => n.mano === 'i') && s.notas.some(n => (n.mano || 'd') === 'd');
  if (!hayDos) aj.manos = 'ambas';
  const notas = s.notas.map((n, i) => ({ ...n, mano: n.mano || 'd', i, estado: 'pend' }));
  digitar(notas);
  const activa = n => aj.manos === 'ambas' || n.mano === aj.manos;
  const totalPulsos = Math.max(...notas.map(n => n.t + n.d));
  const totalCompases = Math.max(1, Math.ceil(totalPulsos / compas - 1e-6));
  const ini = () => aj.bucle ? (aj.bucle[0] - 1) * compas : 0;
  const fin = () => aj.bucle ? Math.min(totalPulsos, aj.bucle[1] * compas) : totalPulsos;

  const [lo, hi] = rangoPara(notas.map(n => n.m), 14);
  const derecha = notas.filter(n => n.mano === 'd').map(n => n.m);
  const baseRef = Math.min(...(aj.manos === 'i' ? notas.filter(n => n.mano === 'i').map(n => n.m) : derecha.length ? derecha : notas.map(n => n.m)));
  entrada.base = Math.max(lo, baseRef - (((baseRef % 12) + 12) % 12));
  const cv = el('canvas', { style: { width: '100%', height: '100%', display: 'block' } });
  const cascada = el('div.cascada', cv);
  const hoja = el('div.partitura', el('div.suave', { style: { padding: '1em', color: '#6d5a86' } }, 'Preparando la partitura…'));
  const cuenta = el('div.cuenta.oculto');
  const tec = teclado(lo, hi);
  if (enPartitura) tec.nodo.classList.add('bajo');
  const info = el('div.fila', { style: { fontSize: '.85em' } });
  const controles = el('div.fila', { style: { fontSize: '.78em', gap: '10px' } });
  c.style.gap = '6px';
  c.append(controles, info, enPartitura ? el('div.marco-partitura', hoja, cuenta) : cascada, tec.nodo);
  const g = cv.getContext('2d');
  let pos = ini() - compas, ultimo = performance.now(), activo = true, terminado = false, errores = 0, empezado = false, vueltas = 0;
  let editando = false, segundos = 0, sucio = false, ultimaNota = 0;
  const VENT = 0.35;
  const rects = [];

  // --- controles ---
  const chips = (opts, actual, set) => el('div.chips', opts.map(([v, t]) => el('button.chip' + (actual === v ? '.sel' : ''), { onclick: () => { set(v); guardar(); ctx.rehacer(); } }, t)));
  const tempo = el('input', { type: 'range', min: 0.25, max: 1.5, step: 0.05, value: aj.tempo, style: { width: '7em' } });
  const vTempo = el('span', `${Math.round(aj.tempo * 100)}% (${Math.round(s.bpm * aj.tempo)} bpm)`);
  tempo.oninput = () => { aj.tempo = +tempo.value; vTempo.textContent = `${Math.round(aj.tempo * 100)}% (${Math.round(s.bpm * aj.tempo)} bpm)`; guardar(); };
  const bDesde = el('input.entrada', { type: 'number', min: 1, max: totalCompases, value: aj.bucle?.[0] || 1, style: { width: '4em', padding: '.1em .3em' } });
  const bHasta = el('input.entrada', { type: 'number', min: 1, max: totalCompases, value: aj.bucle?.[1] || Math.min(4, totalCompases), style: { width: '4em', padding: '.1em .3em' } });
  for (const i of [bDesde, bHasta]) i.addEventListener('keydown', e => e.stopPropagation());
  controles.append(...[
    chips([['partitura', '🎼 Partitura'], ['cascada', '🎹 Cascada']], aj.vista, v => { aj.vista = v; }),
    chips([['aprender', '🐢'], ['ritmo', '🥁'], ['escuchar', '👂']], modo, v => { P.piano.modoCancion = v; }),
    hayDos ? chips([['d', 'Mano der.'], ['i', 'Mano izq.'], ['ambas', 'Ambas']], aj.manos, v => { aj.manos = v; }) : null,
    el('label', 'Tempo ', tempo, ' ', vTempo),
    el('label', el('input', { type: 'checkbox', checked: !!aj.bucle, onchange: e => { aj.bucle = e.target.checked ? [+bDesde.value || 1, Math.max(+bDesde.value || 1, +bHasta.value || 1)] : null; guardar(); ctx.rehacer(); } }),
      ' 🔁 compases ', bDesde, '–', bHasta, el('span.suave', ` de ${totalCompases}`)),
    hayDos && aj.manos !== 'ambas' ? el('label', el('input', { type: 'checkbox', checked: aj.acompanar, onchange: e => { aj.acompanar = e.target.checked; guardar(); } }), ' la otra mano suena') : null,
    el('button.btn.chico', { onclick: e => { editando = !editando; e.target.classList.toggle('prim', editando); pintarInfo(); } }, '✏️ dedos'),
    s.propia ? el('button.btn.chico', { onclick: () => ctx.ir('📝 Tarea', (cc, cx) => editorTarea(cc, cx, s)) }, s.tarea?.activa ? '📝 Tarea' : '📝 Marcar como tarea') : null,
    s.propia ? el('button.btn.chico', { onclick: async e => {
      if (!e.target.dataset.seguro) { e.target.dataset.seguro = 1; e.target.textContent = '¿Borrar? clic otra vez'; return; }
      await api('/api/cancion_borrar', { id: s.id }); toast('Canción borrada'); ctx.volver();
    } }, '🗑️') : null].filter(Boolean));
  for (const i of [bDesde, bHasta]) i.onchange = () => { if (aj.bucle) { aj.bucle = [+bDesde.value || 1, Math.max(+bDesde.value || 1, +bHasta.value || 1)]; guardar(); ctx.rehacer(); } };

  function pintarInfo() {
    const act = notas.filter(n => activa(n) && n.t >= ini() - 1e-6 && n.t < fin() - 1e-6);
    const hechos = act.filter(n => n.estado === 'ok').length;
    info.replaceChildren(
      el('span', `${hechos}/${act.length}`),
      modo !== 'escuchar' ? el('span.suave', `errores ${errores}`) : '',
      aj.bucle ? el('span.suave', `vueltas ${vueltas}`) : '',
      s.aproximada ? el('span.suave', '· transcripción automática: puede tener errores') : '',
      editando ? el('span.ok', '✏️ Clic en una nota: cambia el dedo (1→5) · clic derecho: la borra · rueda: mover') : !empezado ? el('span.ok', 'Tocá cualquier nota o Espacio para empezar') : '',
      sucio ? el('button.btn.chico.prim', { onclick: guardarDedos }, '💾 Guardar cambios') : '');
  }
  async function guardarDedos() {
    if (s.propia) await api('/api/cancion', { id: s.id, notas: notas.map(({ m, t, d, mano, dedo }) => ({ m, t, d, mano, dedo })) });
    else { P.piano.dedosPropios ??= {}; P.piano.dedosPropios[s.id] = notas.map(n => n.dedo); guardar(); } // (las clásicas no se pueden borrar notas)
    sucio = false; toast('Digitación guardada ✓'); pintarInfo();
  }
  const empezar = () => { if (!empezado && !editando) { empezado = true; ultimo = performance.now(); pintarInfo(); } };
  const onEsp = e => { if (e.code === 'Space' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) { e.preventDefault(); empezar(); } };
  addEventListener('keydown', onEsp);

  const grupoSig = () => {
    let t0 = Infinity;
    for (const n of notas) if (n.estado === 'pend' && activa(n) && n.t >= ini() - 1e-6 && n.t < fin() - 1e-6 && n.t < t0) t0 = n.t;
    if (t0 === Infinity) return [];
    return notas.filter(n => n.estado === 'pend' && activa(n) && Math.abs(n.t - t0) < 0.06);
  };

  function reiniciarBucle() {
    for (const n of notas) if (n.t >= ini() - 1e-6 && n.t < fin()) n.estado = 'pend';
    pos = ini() - compas;
    vueltas++;
    pintarInfo();
  }

  function frame(t) {
    if (!activo) return;
    const dt = Math.min(50, t - ultimo) / 1000;
    ultimo = t;
    const bps = s.bpm / 60 * aj.tempo;
    const grupo = grupoSig();
    if (empezado && !terminado && !editando) {
      if (performance.now() - ultimaNota < 20000) segundos += dt; // solo cuenta si estás tocando
      let avance = dt * bps;
      if (modo === 'aprender' && grupo.length) avance = Math.min(avance, Math.max(0, grupo[0].t - pos));
      const antes = pos;
      pos += avance;
      for (const n of notas) {
        if (n.estado !== 'pend' || n.t > pos || n.t < ini() - 1e-6 || n.t >= fin()) continue;
        if (modo === 'escuchar' || !activa(n)) {   // la otra mano (o todo, en Escuchar) suena sola
          n.estado = 'auto';
          if (modo === 'escuchar' || aj.acompanar) sonar(n.m, activa(n) ? 0.8 : 0.5, n.d / bps);
        }
      }
      if (modo === 'ritmo') for (const n of notas) if (n.estado === 'pend' && activa(n) && n.t >= ini() - 1e-6 && pos > n.t + VENT) { n.estado = 'fallo'; pintarInfo(); }
      if (pos < ini() && Math.floor(pos) !== Math.floor(antes)) clic(Math.floor(pos - ini()) % compas === 0);
      const finTramo = fin();
      if (pos >= finTramo + 0.2 && !grupoSig().length) {
        if (aj.bucle) reiniciarBucle(); else terminar();
      }
    }
    tec.limpiar('guia');
    for (const k of tec.teclas.values()) delete k.dataset.dedo;
    if (modo !== 'escuchar') for (const n of grupoSig()) {
      tec.marcar(n.m, 'guia');
      const k = tec.teclas.get(n.m);
      if (k && n.dedo) k.dataset.dedo = n.dedo;
    }
    if (enPartitura) pintarPartitura(); else dibujar();
    requestAnimationFrame(frame);
  }

  // ---------- partitura (Verovio, generada en el servidor con las mismas notas) ----------
  let ultimoSistema = null;
  async function cargarPartitura() {
    const ancho = Math.round(Math.max(600, hoja.clientWidth || 900) / 0.62); // más chico = notas más grandes
    try {
      const r = await api('/api/partitura', { titulo: s.tit, bpm: s.bpm, compas, compas_txt: s.compas_txt, paso: s.paso, aproximada: !!s.aproximada, ancho,
        notas: notas.map(({ m, t, d, mano, dedo }) => ({ m, t, d, mano, dedo })) });
      if (!activo) return;
      hoja.innerHTML = r.svg;
      const tol = s.aproximada ? 0.3 : 0.07;
      const porQ = r.eventos;
      for (const n of notas) {
        let mejor = null;
        for (const ev of porQ) {
          if (Math.abs(ev.q - n.t) > tol) continue;
          const x = ev.notas.find(z => z.m === n.m && !z.usada);
          if (x) { mejor = x; break; }
        }
        if (mejor) {
          mejor.usada = true;
          n.svg = hoja.querySelector(`[id="${mejor.id}"]`);
          if (n.svg) n.svg.dataset.i = n.i;
        }
      }
      hoja.addEventListener('click', e => {
        if (!editando) return;
        const g = e.target.closest('g.note');
        const n = g && notas.find(x => x.svg === g);
        if (!n) return;
        n.dedo = (n.dedo || 0) % 5 + 1;
        sucio = true; sfx.cursor(); pintarInfo();
        toast(`Dedo ${n.dedo} para ${nn(n.m)} (se ve en la partitura al guardar)`, 1500);
      });
    } catch (e) {
      hoja.replaceChildren(el('div.no', { style: { padding: '1em' } }, `No pude dibujar la partitura (${e.message}). Probá la vista 🎹 Cascada.`));
    }
  }
  function pintarPartitura() {
    const actuales = new Set(modo === 'aprender' ? grupoSig() : notas.filter(n => n.t <= pos && pos < n.t + n.d && n.t >= ini() - 1e-6));
    let primera = null;
    for (const n of notas) {
      if (!n.svg) continue;
      const fuera = n.t < ini() - 1e-6 || n.t >= fin() - 1e-6 || !activa(n) && modo !== 'escuchar';
      const clase = actuales.has(n) ? 'actual' : n.estado === 'ok' ? 'bien' : n.estado === 'fallo' ? 'mal' : fuera ? 'fuera' : '';
      if (n.svgClase !== clase) {
        n.svg.classList.remove('actual', 'bien', 'mal', 'fuera');
        if (clase) n.svg.classList.add(clase);
        n.svgClase = clase;
      }
      if (clase === 'actual' && !primera) primera = n.svg;
    }
    // que el sistema que estás tocando quede a la vista
    const sistema = primera?.closest('g.system');
    if (sistema && sistema !== ultimoSistema) {
      ultimoSistema = sistema;
      const r = sistema.getBoundingClientRect(), cr = hoja.getBoundingClientRect();
      if (r.top < cr.top || r.bottom > cr.bottom) hoja.scrollBy({ top: r.top - cr.top - 12, behavior: 'smooth' });
    }
    const falta = Math.ceil(ini() - pos);
    cuenta.classList.toggle('oculto', !(empezado && pos < ini()));
    cuenta.textContent = falta > 0 ? String(falta) : '';
  }

  function dibujar() {
    const W = cv.clientWidth, H = cv.clientHeight;
    const bw = Math.round(W * devicePixelRatio), bh = Math.round(H * devicePixelRatio);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    g.clearRect(0, 0, W, H);
    const ppb = H / Math.max(4, 4.5 / Math.max(0.6, aj.tempo) * 0.9);
    // compases
    g.font = '11px DotGothic16'; g.textAlign = 'left'; g.textBaseline = 'bottom';
    for (let b = Math.ceil(pos); b < pos + H / ppb + 1; b++) {
      const y = H - (b - pos) * ppb;
      const esCompas = b % compas === 0;
      g.strokeStyle = esCompas ? '#ffffff30' : '#ffffff0c';
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      if (esCompas && b >= 0) { g.fillStyle = '#ffffff55'; g.fillText(String(b / compas + 1), 3, y - 1); }
    }
    for (const [m, p] of tec.posiciones) if (esNegra(m)) { g.fillStyle = '#ffffff06'; g.fillRect(p.x / 100 * W, 0, p.w / 100 * W, H); }
    if (aj.bucle) {
      for (const b of [ini(), fin()]) { const y = H - (b - pos) * ppb; g.strokeStyle = '#f2c14e'; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); g.setLineDash([]); }
    }
    rects.length = 0;
    g.textAlign = 'center';
    for (const n of notas) {
      const yInf = H - (n.t - pos) * ppb;
      const yTop = yInf - n.d * ppb + 2;
      if (yInf < -2 || yTop > H) continue;
      const p = tec.posiciones.get(n.m);
      if (!p) continue;
      const x = p.x / 100 * W + 1.5, w = p.w / 100 * W - 3;
      const act = activa(n);
      const base = n.mano === 'i' ? (esNegra(n.m) ? '#2c8a83' : '#3fa7a0') : (esNegra(n.m) ? '#3f5bb0' : '#5b7bd5');
      g.fillStyle = n.estado === 'ok' ? '#4caf6a' : n.estado === 'fallo' ? '#d94a4a' : base;
      g.globalAlpha = !act ? 0.28 : (n.estado === 'ok' || n.estado === 'auto') ? 0.45 : 1;
      const r = Math.min(7, w / 3);
      g.beginPath(); g.roundRect(x, yTop, w, Math.max(5, yInf - yTop), r); g.fill();
      g.globalAlpha = 1;
      rects.push({ n, x, y: yTop, w, h: Math.max(5, yInf - yTop) });
      const alto = yInf - yTop;
      if (act && n.dedo && alto > 14) {
        const rr = Math.min(9, w * 0.42);
        g.fillStyle = '#f2c14e'; g.beginPath(); g.arc(x + w / 2, yInf - rr - 3, rr, 0, 7); g.fill();
        g.fillStyle = '#241a2e'; g.font = `${Math.round(rr * 1.5)}px DotGothic16`; g.textBaseline = 'middle';
        g.fillText(n.dedo, x + w / 2, yInf - rr - 2.5);
      }
      if (act && alto > 2 * Math.min(9, w * 0.42) + 20) {
        g.fillStyle = '#fff'; g.font = `${Math.min(14, w * 0.4)}px DotGothic16`; g.textBaseline = 'top';
        g.fillText(nn(n.m), x + w / 2, yTop + 3);
      }
    }
    g.fillStyle = '#f2c14e'; g.fillRect(0, H - 2, W, 2);
    if (pos < ini() && empezado) {
      g.fillStyle = '#fff'; g.font = '40px DotGothic16'; g.textBaseline = 'middle';
      g.fillText(String(Math.ceil(ini() - pos)), W / 2, H / 2);
    }
  }

  cv.addEventListener('click', e => {
    if (!editando) return;
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = rects.find(q => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    if (!hit) return;
    hit.n.dedo = (hit.n.dedo || 0) % 5 + 1;
    sucio = true;
    sfx.cursor();
    pintarInfo();
  });
  cv.addEventListener('contextmenu', e => {
    if (!editando) return;
    e.preventDefault();
    if (!s.propia) return toast('En las clásicas solo se cambia la digitación');
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = rects.find(q => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    if (!hit) return;
    notas.splice(notas.indexOf(hit.n), 1);   // nota equivocada de la transcripción
    sucio = true;
    sfx.golpe();
    pintarInfo();
  });
  cv.addEventListener('wheel', e => { if (!editando && empezado) return; e.preventDefault(); pos = Math.max(ini() - compas, pos - e.deltaY / 120); }, { passive: false });

  const off = escuchar(ev => {
    if (ev.tipo !== 'on' || terminado || editando) return;
    ultimaNota = performance.now();
    if (!empezado) { empezar(); return; }
    if (modo === 'escuchar') return;
    const mal = () => { errores++; tec.marcar(ev.m, 'mal'); setTimeout(() => tec.marcar(ev.m, 'mal', false), 250); };
    if (modo === 'aprender') {
      const grupo = grupoSig();
      if (!grupo.length) return;
      const cand = grupo.find(n => coincide(ev, n.m));
      if (!cand) return mal();
      if (ev.fuente === 'mic') grupo.forEach(n => { n.estado = 'ok'; }); // el mic oye de a una nota: alcanza con una del acorde
      else cand.estado = 'ok';
      if (!grupoSig().length || grupoSig()[0].t !== grupo[0].t) pos = Math.max(pos, grupo[0].t);
    } else {
      const cand = notas.find(n => n.estado === 'pend' && activa(n) && Math.abs(n.t - pos) <= VENT && coincide(ev, n.m));
      if (cand) {
        if (ev.fuente === 'mic') notas.filter(n => n.estado === 'pend' && activa(n) && Math.abs(n.t - cand.t) < 0.06).forEach(n => { n.estado = 'ok'; });
        else cand.estado = 'ok';
      } else mal();
    }
    pintarInfo();
  });

  function terminar() {
    terminado = true;
    const act = notas.filter(n => activa(n));
    const ok = act.filter(n => n.estado === 'ok').length;
    const pct = modo === 'escuchar' ? 0 : Math.round(100 * ok / Math.max(1, act.length + errores));
    if (modo !== 'escuchar') {
      P.piano.mejores[s.id] = Math.max(P.piano.mejores[s.id] || 0, pct);
      const xp = Math.round((10 + Math.min(act.length, 200) * 0.5) * (pct / 100) * (modo === 'ritmo' ? 1.4 : 1));
      evento('cancion_fin');
      ganarXP('piano', xp, `"${s.tit}"`);
      if (pct >= 90) sfx.subir();
    }
    info.replaceChildren(
      el('span.mediano', modo === 'escuchar' ? '¡Ahora te toca!' : `${pct}% ${pct >= 95 ? '★★★' : pct >= 80 ? '★★' : pct >= 60 ? '★' : ''}`),
      el('button.btn.prim', { onclick: () => ctx.rehacer() }, 'Otra vez'),
      modo === 'aprender' && pct >= 85 ? el('button.btn', { onclick: () => { P.piano.modoCancion = 'ritmo'; ctx.rehacer(); } }, 'Probar con ritmo 🥁') : '',
      modo === 'escuchar' ? el('button.btn', { onclick: () => { P.piano.modoCancion = 'aprender'; ctx.rehacer(); } }, 'Aprenderla 🐢') : '');
  }

  pintarInfo();
  if (modo === 'escuchar') empezar();
  if (enPartitura) requestAnimationFrame(cargarPartitura);
  requestAnimationFrame(frame);
  return () => {
    activo = false; off(); tec.destruir(); removeEventListener('keydown', onEsp); entrada.base = 60;
    const min = segundos / 60;
    P.piano.minutos[s.id] = (P.piano.minutos[s.id] || 0) + min;
    // con el piano de verdad (mic o MIDI) cuenta como práctica real
    if (min >= 1 && (entrada.mic.activo || entrada.midi.ok)) {
      P.piano.practica ??= [];
      P.piano.practica.unshift({ fecha: hoy(), min: Math.round(min), temas: [s.tarea?.activa ? 'tarea' : 'canción'], nota: s.tit });
      evento('practica_real', Math.round(min));
      ganarXP('piano', Math.min(60, Math.round(min) * 2), `${Math.round(min)} min con "${s.tit}"`);
    }
    guardar();
  };
}
