// 音楽堂 Sala de música: lectura de notas, oído, canciones (notas que caen), acordes y práctica real.
import { el, sfx, mezclar, elegir, esperar, toast, entero, hoy } from './util.js';
import { P, ganarXP, evento, guardar } from './progreso.js';
import { abrir } from './actividad.js';
import { entrada, escuchar, sonar, nombreNota, activarMIDI, activarMic, listarMics, calibrar, esNegra, clic } from './piano/entrada.js';
import { teclado, rangoPara, pentagrama, nota as dibujarNota } from './piano/vistas.js';
import { CANCIONES, ACORDES, PROGRESIONES } from './datos/canciones.js';
import { biblioteca } from './piano/canciones-ui.js';
import { preguntar, IA } from './ia.js';

const nn = m => nombreNota(m, P.piano.nombres);
const coincide = (ev, m) => ev.m === m || (ev.fuente !== 'midi' && ev.fuente !== 'pantalla' && ((ev.m - m) % 12 === 0));

export function abrirSalaMusica() {
  entrada.pcActivo = true;
  P.piano.mejores ??= {};
  P.piano.mic ??= { on: P.piano.instrumento === 'acustico', dispositivo: '', umbral: 0.006 };
  entrada.mic.umbral = P.piano.mic.umbral;
  entrada.mic.afinacion = P.piano.mic.afinacion || 0;
  if (P.piano.mic.on && !entrada.mic.activo) {
    activarMic(true, P.piano.mic.dispositivo).catch(() => toast('No pude abrir el micrófono. Revisá el permiso en Ajustes.'));
  }
  if (!entrada.midi.ok) activarMIDI();
  abrir('piano', '音楽堂 Sala de música de Rin', hub, {
    sub: 'piano',
    alCerrar: () => { entrada.pcActivo = false; activarMic(false); },
  });
}

/** Barra con el estado del micrófono: botón, nota detectada y nivel en vivo. */
function barraMic(ctx, conPrueba = false) {
  const nota = el('span.mediano', { style: { minWidth: '3.5em', color: 'var(--oro)' } }, '—');
  const medidor = el('div.hp', { style: { width: conPrueba ? '100%' : '8em', height: '10px', position: 'relative' } }, el('i', { style: { width: '0%', background: 'var(--bien)', transition: 'none' } }));
  const umbralMarca = el('div', { style: { position: 'absolute', top: 0, bottom: 0, width: '2px', background: 'var(--oro)' } });
  medidor.append(umbralMarca);
  const btn = el('button.btn' + (entrada.mic.activo ? '' : '.prim'), { onclick: async () => {
    try {
      const on = !entrada.mic.activo;
      await activarMic(on, P.piano.mic.dispositivo);
      P.piano.mic.on = on; guardar();
      if (on) toast('🎤 Te escucho. Con auriculares puestos, tocá de a una nota.');
    } catch { toast('No pude usar el micrófono: revisá el permiso del navegador (ícono 🔒 o 🎤 en la barra de direcciones).'); }
    ctx.rehacer();
  } }, entrada.mic.activo ? '🎤 Apagar micrófono' : '🎤 Escuchar mi piano');
  let vivo = true, sostener = 0;
  const desvio = el('span.suave', { style: { minWidth: '4.5em' } });
  const off = escuchar(ev => { if (ev.tipo === 'on' && ev.fuente === 'mic') { nota.textContent = nombreNota(ev.m, P.piano.nombres, true); sostener = performance.now() + 900; } });
  const escala = v => Math.min(100, Math.sqrt(v / 0.15) * 100); // escala perceptual 0..0.15 rms
  const tick = () => {
    if (!vivo) return;
    medidor.firstChild.style.width = (entrada.mic.activo ? escala(entrada.mic.nivel) : 0) + '%';
    umbralMarca.style.left = escala(entrada.mic.umbral) + '%';
    if (performance.now() > sostener && entrada.mic.nota == null) nota.textContent = entrada.mic.activo ? '…' : '—';
    if (conPrueba) { const c = Math.round(entrada.mic.cents || 0); desvio.textContent = entrada.mic.nota != null ? `${c > 0 ? '+' : ''}${c} cents` : ''; desvio.style.color = Math.abs(c) > 25 ? 'var(--oro)' : ''; }
    requestAnimationFrame(tick);
  };
  tick();
  const nodo = el('div.panel', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
    btn, entrada.mic.activo ? el('span.suave', 'oigo:') : null, nota, conPrueba ? desvio : null, medidor);
  return { nodo, limpiar: () => { vivo = false; off(); } };
}

function estadoEntrada() {
  const partes = ['⌨️ teclado PC (A W S E D F T G Y H U J K…)'];
  if (entrada.midi.ok) partes.push(`🎹 MIDI: ${entrada.midi.nombres.join(', ')}`);
  if (entrada.mic.activo) partes.push('🎤 micrófono');
  return partes.join(' · ');
}

function hub(c, ctx) {
  const t = (ico, tit, desc, tag, fn) => el('button.tarjeta', { onclick: fn }, el('div.t-ico', ico), el('div.t-tit', tit), el('div.t-desc', desc), tag ? el('div.t-tag', tag) : null);
  const mins = (P.piano.practica || []).filter(p => p.fecha === hoy()).reduce((s, p) => s + p.min, 0);
  const bm = barraMic(ctx);
  c.append(
    bm.nodo,
    el('div.suave', `Entrada: ${estadoEntrada()}`),
    el('div.rejilla',
      t('🎼', 'Lectura de notas', 'Las notas avanzan por el pentagrama: tocalas antes de que lleguen. Clave de sol y de fa.', `${P.stats.nota_ok || 0} notas leídas`, () => ctx.ir('Lectura de notas', lecturaNotas)),
      t('🎹', 'Canciones y tarea', 'Tus canciones (YouTube, partituras, MuseScore) y la tarea de tus clases, con digitación, manos separadas y bucle.', `${CANCIONES.length} clásicas + las tuyas`, () => ctx.ir('Canciones y tarea', biblioteca)),
      t('👂', 'Oído', 'Repetí notas, reconocé intervalos y acordes mayores/menores.', null, () => ctx.ir('Oído', oido)),
      t('🎶', 'Acordes', 'Do, Fa, Sol, Lam… y las progresiones que suenan en todas las canciones.', null, () => ctx.ir('Acordes', acordes)),
      t('⏱️', 'Práctica real', 'Metrónomo, cronómetro y registro de lo que practicás en tu piano. Rin te arma un plan.', `${mins} min hoy`, () => ctx.ir('Práctica real', practicaReal)),
      t('⚙️', 'Ajustes y micrófono', 'Elegí el mic de tus auriculares, ajustá la sensibilidad y probalo. Nombres de notas.', P.piano.nombres === 'latino' ? 'Do Re Mi' : 'C D E', () => ctx.ir('Ajustes y micrófono', ajustes)),
    ));
  return bm.limpiar;
}

function ajustes(c, ctx) {
  const chips = (opts, actual, set) => el('div.chips', opts.map(([v, txt]) => el('button.chip' + (actual === v ? '.sel' : ''), { onclick: async () => { await set(v); guardar(); ctx.rehacer(); } }, txt)));
  const bm = barraMic(ctx, true);
  const selMic = el('select.entrada', { style: { maxWidth: '100%' }, onchange: async e => {
    P.piano.mic.dispositivo = e.target.value; guardar();
    if (entrada.mic.activo) { try { await activarMic(true, e.target.value); } catch { toast('No pude abrir ese micrófono'); } }
  } }, el('option', { value: '' }, 'Micrófono predeterminado de Windows'));
  listarMics().then(lista => {
    for (const m of lista) if (m.id && m.id !== 'default' && m.id !== 'communications') selMic.append(el('option', { value: m.id, selected: m.id === P.piano.mic.dispositivo }, m.nombre));
    if (lista.every(m => !m.nombre || m.nombre === 'Micrófono')) selMic.append(el('option', { disabled: true }, '(activá el micrófono una vez para ver los nombres)'));
  });
  const sens = el('input', { type: 'range', min: 0.0015, max: 0.04, step: 0.0005, value: P.piano.mic.umbral, style: { width: '100%' } });
  const sensVal = el('span.val');
  const pintarSens = () => { sensVal.textContent = P.piano.mic.umbral < 0.004 ? 'muy sensible' : P.piano.mic.umbral < 0.01 ? 'sensible' : P.piano.mic.umbral < 0.02 ? 'normal' : 'poco sensible'; };
  sens.addEventListener('input', () => { P.piano.mic.umbral = entrada.mic.umbral = +sens.value; pintarSens(); guardar(); });
  pintarSens();
  c.append(
    el('div.mediano', { style: { fontSize: '1.1em' } }, '🎤 Que el juego escuche tu piano'),
    el('div.fila', el('span', 'Micrófono:'), selMic),
    bm.nodo,
    el('div.slider', el('span', 'Umbral'), sens, sensVal),
    el('div.panel', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
      el('div', `🎯 Afinación de tu piano: ${P.piano.mic.afinacion ? `${P.piano.mic.afinacion > 0 ? '+' : ''}${P.piano.mic.afinacion} cents (calibrado)` : 'sin calibrar (se asume La = 440 Hz)'}`),
      el('div.suave', { style: { fontSize: '.8em' } }, 'Los pianos acústicos casi nunca están en 440 exacto. Si una nota sale como su vecina (Do → Do#) o los "cents" de arriba quedan cerca de ±50, calibrá: apretá el botón y tocá el Do central (o cualquier Do) varias veces, de a una, durante 8 segundos.'),
      el('div.fila',
        el('button.btn.prim', { disabled: !entrada.mic.activo, onclick: async e => {
          e.target.disabled = true; e.target.textContent = '🎹 Tocá Do varias veces… (8 s)';
          const r = await calibrar(8000, 60);
          if (r == null) toast('No escuché bien un Do. Probá de nuevo: solo Do, de a una nota y fuerte.');
          else { P.piano.mic.afinacion = r; guardar(); toast(`Listo: tu piano está ${r > 0 ? '+' : ''}${r} cents respecto de 440 Hz`); }
          ctx.rehacer();
        } }, entrada.mic.activo ? '🎯 Calibrar con mi piano' : '🎯 Calibrar (prendé el mic primero)'),
        P.piano.mic.afinacion ? el('button.btn', { onclick: () => { P.piano.mic.afinacion = entrada.mic.afinacion = 0; guardar(); ctx.rehacer(); } }, 'Restablecer') : null)),
    el('div.panel.suave', { style: { fontSize: '.8em', lineHeight: 1.6 } },
      '1) Elegí el micrófono de tus auriculares y apretá "Escuchar mi piano" (el navegador pide permiso una vez).', el('br'),
      '2) En silencio, la barra verde tiene que quedar a la IZQUIERDA de la rayita dorada. Si la pasa, mové el umbral a la derecha.', el('br'),
      '3) Tocá una nota fuerte: tiene que aparecer su nombre. Si no aparece, mové el umbral a la izquierda (más sensible).', el('br'),
      '4) Dejá los auriculares puestos para que el mic no escuche el sonido del juego. El mic oye de a una nota: los acordes, tocalos arpegiados.'),
    el('div', 'Nombres de las notas'), chips([['latino', 'Do Re Mi'], ['ingles', 'C D E']], P.piano.nombres, v => { P.piano.nombres = v; }),
    el('div.fila', el('button.btn', { onclick: async () => { const ok = await activarMIDI(); toast(ok ? `MIDI conectado: ${entrada.midi.nombres.join(', ')}` : 'No encontré ningún piano MIDI.'); ctx.rehacer(); } }, '🔌 Buscar piano MIDI'),
      el('span.suave', entrada.midi.ok ? `✓ ${entrada.midi.nombres.join(', ')}` : 'sin piano MIDI (no hace falta si usás el mic)')),
    el('div.suave', { style: { fontSize: '.75em' } }, 'Teclado de la compu: A=Do, W=Do#, S=Re, E=Re#, D=Mi, F=Fa, T=Fa#, G=Sol, Y=Sol#, H=La, U=La#, J=Si, K=Do agudo.'),
  );
  return bm.limpiar;
}

// ---------- Lectura de notas (juego de pentagrama) ----------
const blancasEntre = (a, b) => { const r = []; for (let m = a; m <= b; m++) if (!esNegra(m)) r.push(m); return r; };
const NIVELES_LECTURA = [
  { n: 'Sol · Do–Sol', clave: 'sol', notas: blancasEntre(60, 67) },
  { n: 'Sol · Do–Do', clave: 'sol', notas: blancasEntre(60, 72) },
  { n: 'Sol · hasta La5', clave: 'sol', notas: blancasEntre(60, 81) },
  { n: 'Fa · Do3–Do4', clave: 'fa', notas: blancasEntre(48, 60) },
  { n: 'Fa · Mi2–Do4', clave: 'fa', notas: blancasEntre(40, 60) },
  { n: 'Sol con ♯', clave: 'sol', notas: Array.from({ length: 13 }, (_, i) => 60 + i) },
];

function lecturaNotas(c, ctx) {
  P.piano.nivelLectura ??= 0;
  let nivel = NIVELES_LECTURA[P.piano.nivelLectura];
  const cv = el('canvas', { style: { width: '100%', height: 'calc(var(--px) * 58)', background: 'var(--crema)', borderRadius: '10px' } });
  const marcador = el('div.fila');
  const chips = el('div.chips', NIVELES_LECTURA.map((nv, i) => el('button.chip' + (i === P.piano.nivelLectura ? '.sel' : ''), { onclick: () => { P.piano.nivelLectura = i; guardar(); ctx.rehacer(); } }, nv.n)));
  const tec = teclado(60, 83, { etiquetas: 'pc' });
  entrada.base = nivel.clave === 'fa' ? 48 : 60;
  c.append(chips, marcador, cv, tec.nodo, el('div.suave', 'Tocá la nota que está más a la izquierda. Con el teclado de la PC vale cualquier octava.'));
  const g = cv.getContext('2d');
  let notas = [], vidas = 3, puntos = 0, combo = 0, vel = 26, prox = 0, ultimo = performance.now(), activo = true, fin = false;
  let destello = 0, fallo = null, escuchado = null; // fallo: nota que se pasó (queda congelada en rojo)

  function pintarMarcador() {
    marcador.replaceChildren(el('span', '♥'.repeat(vidas) + '♡'.repeat(3 - vidas)), el('span', `✓ ${puntos}`), combo > 2 ? el('span', `🔥 x${combo}`) : '', el('span.suave', `velocidad ${Math.round(vel)}`));
  }
  function frame(t) {
    if (!activo) return;
    const dt = Math.min(50, t - ultimo) / 1000;
    ultimo = t;
    const W = cv.clientWidth, H = cv.clientHeight;
    const bw = Math.round(W * devicePixelRatio), bh = Math.round(H * devicePixelRatio);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    g.clearRect(0, 0, W, H);
    const esp = H / 11, y0 = H / 2 - 2 * esp;
    const opts = { x: 0, y: y0, w: W, esp, clave: nivel.clave };
    pentagrama(g, opts);
    const xLinea = esp * 6;
    g.fillStyle = destello > 0 ? 'rgba(217,74,74,.25)' : 'rgba(91,123,213,.15)';
    g.fillRect(xLinea - esp, 0, esp * 2, H);
    destello -= dt;
    if (!fin) {
      prox -= dt;
      if (prox <= 0 && notas.length < 6) {
        let m;
        do { m = elegir(nivel.notas); } while (notas.length && notas[notas.length - 1].m === m && nivel.notas.length > 1);
        notas.push({ m, x: W + esp });
        prox = Math.max(0.7, 2.4 - puntos * 0.03) * (30 / vel) * 1.5;
      }
      if (fallo) {
        // todo quieto mientras mostramos cuál era la nota fallada
        if (t > fallo.hasta) {
          notas.shift();
          tec.marcar(fallo.m, 'guia', false);
          fallo = null;
          if (vidas <= 0) terminar();
        }
      } else {
        for (const n of notas) n.x -= vel * esp / 10 * dt;
        if (notas[0] && notas[0].x < xLinea) {
          notas[0].x = xLinea;
          fallo = { m: notas[0].m, hasta: t + 1600 };
          tec.marcar(fallo.m, 'guia');
          vidas--; combo = 0; destello = 0.3; sfx.mal();
          pintarMarcador();
        }
      }
    }
    notas.forEach((n, i) => {
      const fallada = fallo && i === 0;
      dibujarNota(g, n.m, n.x, { ...opts, color: fallada ? '#d94a4a' : i === 0 ? '#2a2140' : '#6d5a86', etiqueta: fallada ? `era ${nn(n.m)}` : null });
    });
    if (escuchado && t < escuchado.hasta && notas[0] && !fallo) {
      g.fillStyle = '#d94a4a'; g.font = `${esp * 1.1}px DotGothic16`; g.textBaseline = 'top'; g.textAlign = 'center';
      g.fillText(`tocaste ${nn(escuchado.m)}`, notas[0].x, esp * 0.4);
      g.textAlign = 'left';
    }
    requestAnimationFrame(frame);
  }
  function terminar() {
    fin = true;
    notas = [];
    const xp = Math.round(puntos * 1.2) + 3;
    ganarXP('piano', xp, 'lectura de notas');
    marcador.replaceChildren(el('span', `Fin: ${puntos} notas · +${xp} XP`),
      el('button.btn.prim', { onclick: () => ctx.rehacer() }, 'Jugar de nuevo'));
    if (puntos >= 25 && P.piano.nivelLectura < NIVELES_LECTURA.length - 1 && P.piano.nivelLectura === NIVELES_LECTURA.indexOf(nivel)) {
      toast('Desbloqueaste el siguiente nivel de lectura 🎼');
      P.piano.nivelLectura++;
      guardar();
    }
  }
  const off = escuchar(ev => {
    if (ev.tipo !== 'on' || fin || !notas.length || fallo) return;
    if (coincide(ev, notas[0].m)) {
      escuchado = null;
      notas.shift();
      puntos++; combo++;
      if (puntos % 8 === 0) vel += 4;
      evento('nota_ok');
      pintarMarcador();
    } else {
      combo = 0; destello = 0.2;
      escuchado = { m: ev.m, hasta: performance.now() + 1100 };
      tec.marcar(ev.m, 'mal'); setTimeout(() => tec.marcar(ev.m, 'mal', false), 250);
      pintarMarcador();
    }
  });
  pintarMarcador();
  requestAnimationFrame(frame);
  return () => { activo = false; off(); tec.destruir(); entrada.base = 60; };
}

// ---------- Oído ----------
const INTERVALOS = [
  { s: 2, n: '2ª mayor' }, { s: 3, n: '3ª menor' }, { s: 4, n: '3ª mayor' }, { s: 5, n: '4ª justa' },
  { s: 7, n: '5ª justa' }, { s: 9, n: '6ª mayor' }, { s: 12, n: 'Octava' },
];
function oido(c, ctx) {
  P.piano.modoOido ??= 'nota';
  const modo = P.piano.modoOido;
  const chips = el('div.chips', [['nota', 'Repetí la nota'], ['intervalo', 'Intervalos'], ['acorde', 'Mayor o menor']].map(([v, t]) =>
    el('button.chip' + (modo === v ? '.sel' : ''), { onclick: () => { P.piano.modoOido = v; ctx.rehacer(); } }, t)));
  const zona = el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' } });
  const tec = teclado(60, 83);
  c.append(chips, zona, tec.nodo);
  let ronda = 0, ok = 0, actual = null, esperandoNota = false;
  const total = 10;
  const tocar = async () => {
    if (!actual) return;
    if (actual.tipo === 'nota') sonar(actual.m, 0.9, 1.2);
    else if (actual.tipo === 'intervalo') { sonar(actual.a, 0.9, 0.8); await esperar(700); sonar(actual.b, 0.9, 1); }
    else { actual.notas.forEach(m => sonar(m, 0.7, 1.6)); }
  };
  function siguiente() {
    if (ronda >= total) {
      const xp = ok * 3 + 2;
      ganarXP('piano', xp, 'oído');
      zona.replaceChildren(el('div.mediano', `${ok}/${total}`), el('button.btn.prim', { onclick: () => ctx.rehacer() }, 'Otra ronda'));
      return;
    }
    ronda++;
    zona.replaceChildren(el('div.suave', `Ronda ${ronda}/${total}`));
    if (modo === 'nota') {
      const pool = (P.stats.oido_ok || 0) < 15 ? [60, 62, 64, 65, 67] : blancasEntre(60, 72);
      actual = { tipo: 'nota', m: elegir(pool) };
      esperandoNota = true;
      zona.append(el('div', 'Escuchá y tocá la misma nota en el teclado'));
    } else if (modo === 'intervalo') {
      const pool = (P.stats.oido_ok || 0) < 20 ? INTERVALOS.filter(i => [4, 7, 12].includes(i.s)) : INTERVALOS;
      const iv = elegir(pool);
      const a = entero(60, 72 - Math.min(iv.s, 7));
      actual = { tipo: 'intervalo', a, b: a + iv.s, iv };
      zona.append(el('div', '¿Qué intervalo es?'), el('div.opciones4', pool.map(x => el('button.btn', { onclick: e => resp(x.s === iv.s, e.currentTarget, `${iv.n} (${nn(a)} → ${nn(a + iv.s)})`) }, x.n))));
    } else {
      const ac = elegir(ACORDES);
      actual = { tipo: 'acorde', notas: ac.notas, ac };
      zona.append(el('div', '¿Mayor (alegre) o menor (triste)?'), el('div.opciones4',
        el('button.btn', { onclick: e => resp(ac.tipo === 'mayor', e.currentTarget, `${ac.n} (${ac.tipo})`) }, '😊 Mayor'),
        el('button.btn', { onclick: e => resp(ac.tipo === 'menor', e.currentTarget, `${ac.n} (${ac.tipo})`) }, '😢 Menor')));
    }
    zona.append(el('button.btn', { onclick: tocar }, '🔊 Escuchar de nuevo'));
    setTimeout(tocar, 300);
  }
  async function resp(bien, boton, explic) {
    esperandoNota = false;
    zona.querySelectorAll('.opciones4 button').forEach(b => { b.disabled = true; });
    boton?.classList.add(bien ? 'correcta' : 'incorrecta');
    if (bien) { ok++; sfx.bien(); evento('oido_ok'); } else sfx.mal();
    zona.append(el('div' + (bien ? '.ok' : '.no'), (bien ? '✓ ' : '✗ ') + explic));
    if (!bien && actual.tipo !== 'nota') { await esperar(400); await tocar(); }
    await esperar(bien ? 900 : 1800);
    siguiente();
  }
  const off = escuchar(ev => {
    if (ev.tipo !== 'on' || !esperandoNota || actual?.tipo !== 'nota') return;
    resp((ev.m - actual.m) % 12 === 0, null, `Era ${nn(actual.m)}${ev.m % 12 !== actual.m % 12 ? `, tocaste ${nn(ev.m)}` : ''}`);
  });
  siguiente();
  return () => { off(); tec.destruir(); };
}

// ---------- Acordes ----------
function acordes(c, ctx) {
  P.piano.progresion ??= 0;
  const prog = PROGRESIONES[P.piano.progresion];
  let ayuda = P.piano.ayudaAcordes ?? true;
  const zona = el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' } });
  const tec = teclado(60, 83);
  c.append(
    el('div.chips', PROGRESIONES.map((p, i) => el('button.chip' + (i === P.piano.progresion ? '.sel' : ''), { onclick: () => { P.piano.progresion = i; ctx.rehacer(); } }, p.n))),
    el('label.suave', el('input', { type: 'checkbox', checked: ayuda, onchange: e => { P.piano.ayudaAcordes = ayuda = e.target.checked; mostrar(); } }), ' mostrar qué teclas'),
    zona, tec.nodo,
    el('div.suave', entrada.mic.activo ? 'Con micrófono: tocá las 3 notas del acorde arpegiadas (una tras otra, en menos de 2 segundos).' : 'Mantené apretadas las 3 notas a la vez. En el teclado de la PC: Do = A D G · Fa = F H K · Sol = G J L'));
  let i = 0, vueltas = 0, inicio = performance.now();
  const ac = () => ACORDES.find(a => a.n === prog.acordes[i]);
  function mostrar() {
    const a = ac();
    tec.limpiar('guia');
    if (ayuda) a.notas.forEach(m => tec.marcar(m, 'guia'));
    zona.replaceChildren(
      el('div.fila', prog.acordes.map((n, k) => el('span' + (k === i ? '.mediano' : '.suave'), { style: { color: k === i ? 'var(--oro)' : '' } }, n))),
      el('div.suave', `${a.i} · ${a.tipo} · ${a.notas.map(nn).join(' – ')}`),
      el('div.suave', `vueltas: ${vueltas}`));
  }
  const recientes = new Map(); // clase de nota -> instante (acordes arpegiados con el mic)
  const off = escuchar(ev => {
    if (ev.tipo !== 'on') return;
    const a = ac();
    const ahora = performance.now();
    recientes.set(ev.m % 12, ahora);
    for (const [k, t] of recientes) if (ahora - t > 2500) recientes.delete(k);
    const clases = new Set([...entrada.apretadas].map(m => m % 12));
    if (ev.fuente === 'mic') for (const k of recientes.keys()) clases.add(k);
    if (a.notas.every(m => clases.has(m % 12))) {
      sfx.bien();
      i++;
      recientes.clear();
      if (i >= prog.acordes.length) {
        i = 0; vueltas++;
        const seg = (performance.now() - inicio) / 1000;
        ganarXP('piano', ayuda ? 4 : 7, `progresión en ${seg.toFixed(1)} s`);
        inicio = performance.now();
      }
      setTimeout(mostrar, 120);
    }
  });
  mostrar();
  return () => { off(); tec.destruir(); };
}

// ---------- Práctica real: metrónomo + cronómetro + registro + plan ----------
const PLANES = [
  ['5 min: escala de Do con manos separadas (digitación 1-2-3-1-2-3-4-5)', '5 min: acordes Do–Fa–Sol con la izquierda', '5 min: una canción lenta con metrónomo a 60', '2 min: tocá lo que quieras, sin juzgarte'],
  ['3 min: calentamiento cinco dedos, notas largas y parejas', '6 min: lectura a primera vista (Lectura de notas, nivel actual)', '6 min: una frase difícil de tu canción, 5 veces perfecta', '3 min: tocá la canción completa sin parar'],
  ['5 min: escala de Sol (Fa#) y de Fa (Sib)', '5 min: progresión I–V–vi–IV en Do con ritmo de negras', '5 min: melodía con la derecha + acorde con la izquierda en el 1er pulso', '3 min: improvisá con las teclas blancas sobre Lam'],
];

function practicaReal(c, ctx) {
  P.piano.practica ??= [];
  let bpm = P.piano.bpm || 80, compas = 4, metro = null, beat = 0;
  const vBpm = el('span.mediano', bpm);
  const luz = el('div', { style: { width: '24px', height: '24px', borderRadius: '50%', background: '#ffffff22' } });
  const metroBtn = el('button.btn.prim', { onclick: () => alternarMetro() }, '▶ Metrónomo');
  let taps = [];
  function alternarMetro() {
    if (metro) { clearInterval(metro); metro = null; metroBtn.textContent = '▶ Metrónomo'; luz.style.background = '#ffffff22'; return; }
    beat = 0;
    const tick = () => {
      const acento = beat % compas === 0;
      clic(acento);
      luz.style.background = acento ? 'var(--oro)' : 'var(--azul)';
      setTimeout(() => { luz.style.background = '#ffffff22'; }, 90);
      beat++;
    };
    tick();
    metro = setInterval(tick, 60000 / bpm);
    metroBtn.textContent = '■ Parar';
  }
  const setBpm = v => { bpm = Math.max(30, Math.min(220, Math.round(v))); vBpm.textContent = bpm; P.piano.bpm = bpm; if (metro) { alternarMetro(); alternarMetro(); } };

  // cronómetro
  let inicio = null, acumulado = 0, reloj = null;
  const vReloj = el('span.mediano', '00:00');
  const cronoBtn = el('button.btn.prim', { onclick: () => alternarCrono() }, '▶ Empezar práctica');
  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const segs = () => acumulado + (inicio ? (Date.now() - inicio) / 1000 : 0);
  function alternarCrono() {
    if (inicio) { acumulado = segs(); inicio = null; cronoBtn.textContent = '▶ Seguir'; clearInterval(reloj); return; }
    inicio = Date.now();
    cronoBtn.textContent = '❚❚ Pausa';
    reloj = setInterval(() => { vReloj.textContent = fmt(segs()); }, 500);
  }
  const temas = new Set();
  const notaInp = el('input.entrada', { placeholder: '¿Qué practicaste? (ej: Para Elisa compases 1-8, a 70 bpm)', style: { width: '100%' } });
  notaInp.addEventListener('keydown', e => e.stopPropagation());
  const registrar = () => {
    const min = Math.round(segs() / 60);
    if (min < 1) return toast('Practicá al menos 1 minuto 🙂');
    if (inicio) alternarCrono();
    P.piano.practica.unshift({ fecha: hoy(), min, temas: [...temas], nota: notaInp.value.trim() });
    P.piano.practica = P.piano.practica.slice(0, 200);
    evento('practica_real', min);
    ganarXP('piano', Math.min(60, min * 2), `${min} min de práctica real`);
    acumulado = 0; vReloj.textContent = '00:00';
    ctx.rehacer();
  };
  const plan = el('div.panel', el('div', '🗒️ Plan de hoy de Rin'), el('ol', { style: { margin: '6px 0 0', paddingLeft: '1.3em', fontSize: '.85em', lineHeight: 1.5 } },
    (P.piano.planHoy?.fecha === hoy() ? P.piano.planHoy.pasos : PLANES[new Date().getDate() % PLANES.length]).map(p => el('li', p))),
  IA.disponible ? el('button.btn.chico', { onclick: async e => {
    e.target.disabled = true; e.target.textContent = 'Rin está pensando…';
    const ultimos = P.piano.practica.slice(0, 6).map(p => `${p.fecha}: ${p.min} min ${p.temas.join(',')} ${p.nota}`).join('\n') || 'sin registros';
    const r = await preguntar('Sos Rin, una profesora de piano cálida y concreta. Respondés SOLO JSON.', [{ role: 'user', content:
      `Armá un plan de práctica de 15-20 minutos para hoy, para un alumno de piano adulto que está empezando (nivel de juego ${Math.floor(Math.sqrt(P.skills.piano.xp / 40)) + 1}, notas leídas: ${P.stats.nota_ok || 0}, canciones: ${Object.entries(P.piano.mejores).map(([k, v]) => k + ' ' + v + '%').join(', ') || 'ninguna'}). Últimas prácticas:\n${ultimos}\nVariá respecto a lo anterior. Formato: {"pasos":["4 min: ...","..."],"consejo":"un consejo técnico corto"}` }], { json: true, max_tokens: 700 });
    if (r?.pasos) { P.piano.planHoy = { fecha: hoy(), pasos: [...r.pasos, r.consejo ? `💡 ${r.consejo}` : ''].filter(Boolean) }; guardar(); }
    ctx.rehacer();
  } }, '✨ Pedirle un plan nuevo a Rin') : null);

  const historial = P.piano.practica.slice(0, 6);
  c.append(
    el('div.dos-col',
      el('div.panel', el('div', 'Metrónomo'),
        el('div.fila', el('button.btn', { onclick: () => setBpm(bpm - 5) }, '−'), vBpm, el('span.suave', 'bpm'), el('button.btn', { onclick: () => setBpm(bpm + 5) }, '+'), luz),
        el('div.fila', el('div.chips', [2, 3, 4].map(n => el('button.chip' + (n === compas ? '.sel' : ''), { onclick: e => { compas = n; e.target.parentNode.querySelectorAll('.chip').forEach(x => x.classList.toggle('sel', x === e.target)); } }, `${n}/4`))),
          el('button.btn.chico', { onclick: () => { const t = performance.now(); taps = taps.filter(x => t - x < 3000); taps.push(t); if (taps.length > 2) setBpm(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1))); } }, 'tap')),
        metroBtn),
      el('div.panel', el('div', 'Sesión en tu piano'), el('div.fila', vReloj, cronoBtn),
        el('div.chips', ['escalas', 'acordes', 'lectura', 'canción', 'técnica', 'improvisar'].map(t => el('button.chip', { onclick: e => { temas.has(t) ? temas.delete(t) : temas.add(t); e.target.classList.toggle('sel'); } }, t))),
        notaInp, el('button.btn', { onclick: registrar }, '✔ Registrar sesión'))),
    plan,
    historial.length ? el('div.panel', el('div', 'Últimas sesiones'), el('table.tabla', el('tr', el('th', 'día'), el('th', 'min'), el('th', 'qué')),
      historial.map(p => el('tr', el('td', p.fecha.slice(5)), el('td', p.min), el('td', [p.temas.join(', '), p.nota].filter(Boolean).join(' — ')))))) : null,
  );
  return () => { if (metro) clearInterval(metro); clearInterval(reloj); };
}
