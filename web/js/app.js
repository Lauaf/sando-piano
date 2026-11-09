// 音楽堂 Sala de música: Practicar piano: lectura de notas, canciones con digitación, oído, acordes y registro de práctica real (teclado, MIDI o micrófono).
// App independiente de una de las sendas de Sandō, sin el pueblo: abre directo en su pantalla principal.
import { $, audio } from './util.js';
import { cargar, P, pintarHUD, sincronizar } from './progreso.js';
import { actividad, ir, tituloActual } from './actividad.js';
import { dialogo } from './dialogo.js';
import { revisarIA } from './ia.js';
import { aplicarOpciones, pantallaOpciones } from './opciones.js';
import { montarMando } from './mando.js';
import { pantallaPerfil, pantallaMisiones } from './perfil.js';
import { abrirSalaMusica as abrirPrincipal } from './piano.js';

const GBA = { w: 240, h: 160 };

/** Escala la pantalla (proporción GBA, como en Sandō) al espacio libre. */
function ajustarTamano() {
  const alto = sel => { const n = $(sel); return n && getComputedStyle(n).display !== 'none' ? n.offsetHeight : 0; };
  const disponibleAlto = innerHeight - alto('#hud') - alto('#ayuda') - 34;
  const disponibleAncho = innerWidth - (innerWidth < 500 ? 16 : 40);
  let escala = Math.min(disponibleAncho / GBA.w, disponibleAlto / GBA.h);
  if (P.opciones?.escalaEntera && escala >= 2) escala = Math.floor(escala);
  else if (Math.floor(escala) >= 3 && Math.floor(escala) / escala > 0.86) escala = Math.floor(escala);
  escala = Math.max(1.4, escala);
  const r = document.documentElement.style;
  r.setProperty('--ancho', `${Math.round(GBA.w * escala)}px`);
  r.setProperty('--alto', `${Math.round(GBA.h * escala)}px`);
  r.setProperty('--px', `${escala}px`);
  requestAnimationFrame(() => {
    const p = $('#pantalla').getBoundingClientRect();
    r.setProperty('--pant-top', `${Math.max(8, p.top + 8)}px`);
    r.setProperty('--pant-right', `${Math.max(8, innerWidth - p.right + 8)}px`);
  });
}

/** Abre una pantalla de la barra de arriba encima de lo que estés haciendo (si no está abierta ya). */
function abrirEncima(titulo, render) {
  if (!actividad.abierta || dialogo.activo || tituloActual() === titulo) return;
  ir(titulo, render);
}

async function iniciar() {
  await cargar();
  aplicarOpciones();
  montarMando();
  ajustarTamano();
  addEventListener('resize', ajustarTamano);
  addEventListener('sando:opciones', ajustarTamano);
  pintarHUD();

  addEventListener('keydown', () => audio()); // el navegador exige un gesto para habilitar el audio
  addEventListener('pointerdown', () => audio(), { once: true });
  $('#hud-perfil').addEventListener('click', () => abrirEncima('Mi progreso', pantallaPerfil));
  $('#hud-misiones').addEventListener('click', () => abrirEncima('Misiones de hoy', pantallaMisiones));
  $('#btn-menu').addEventListener('click', () => abrirEncima('Opciones', pantallaOpciones));

  // otra ventana pudo haber guardado mientras esta estaba en segundo plano
  const alVolver = () => { if (!document.hidden && !dialogo.activo) sincronizar(); };
  document.addEventListener('visibilitychange', alVolver);
  addEventListener('focus', alVolver);

  revisarIA();
  setInterval(revisarIA, 30000);
  setInterval(pintarHUD, 60000);

  actividad.fija = true; // la pantalla principal no se cierra: es la app
  abrirPrincipal();
}

iniciar();
