// Mi progreso: nivel, misiones del día, las últimas dos semanas, logros y opciones de esta senda.
import { el, hoy } from './util.js';
import { P, SKILLS, SENDA, nivelDe, xpDeNivel, tituloDe, misionesDeHoy, listaLogros, rachaViva } from './progreso.js';
import { pantallaOpciones } from './opciones.js';

const COLOR = { jp: 'var(--sakura)', piano: 'var(--azul)', cafe: '#d39a62' };

export function pantallaMisiones(c) {
  c.append(el('div.suave', 'Se renuevan cada día. Cada una da +30 XP.'),
    ...misionesDeHoy().map(m => el('div.panel', el('div.fila',
      el('span', { style: { fontSize: '1.4em' } }, m.hecha ? '✓' : SKILLS[SENDA].ico),
      el('div', { style: { flex: 1 } }, el('div', m.texto), el('div.hp', { style: { marginTop: '6px' } }, el('i', { style: { width: (m.prog / m.meta * 100) + '%', background: m.hecha ? 'var(--bien)' : 'var(--oro)' } }))),
      el('span.suave', `${m.prog}/${m.meta}`)))));
}

function resumen() {
  const s = SKILLS[SENDA], xp = P.skills[SENDA].xp, n = nivelDe(xp);
  const pct = (xp - xpDeNivel(n)) / (xpDeNivel(n + 1) - xpDeNivel(n)) * 100;
  return el('div.dos-col',
    el('div.panel', el('div', `${s.ico} ${s.nombre} — Nv ${n}`), el('div.suave', tituloDe(SENDA)),
      el('div.hp', { style: { marginTop: '6px' } }, el('i', { style: { width: pct + '%', background: 'var(--oro)' } })),
      el('div.suave', { style: { fontSize: '.7em' } }, `${xp} XP · faltan ${xpDeNivel(n + 1) - xp} para Nv ${n + 1}`)),
    el('div.panel', el('div', `Racha: ${rachaViva()} días`), el('div.suave', `Mejor racha: ${P.racha.mejor}`)));
}

function semanas() {
  const dias = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); dias.push(hoy(d)); }
  const xpDe = d => P.historial[d]?.[SENDA] || 0;
  const max = Math.max(30, ...dias.map(xpDe));
  return el('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '6px', height: 'calc(var(--px) * 44)', padding: '10px', background: '#0003', borderRadius: '10px' } },
    dias.map(d => el('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }, title: `${d}: ${xpDe(d)} XP` },
      el('div', { style: { width: '100%', height: `calc(var(--px) * ${xpDe(d) / max * 34})`, background: COLOR[SENDA], borderRadius: '3px 3px 0 0' } }),
      el('div.suave', { style: { fontSize: '.55em' } }, d.slice(8)))));
}

function logros() {
  const lista = listaLogros();
  return el('div.ac-seccion',
    el('div.logros-cab', el('h3.ac-h3', `Logros · ${lista.filter(l => l.tiene).length} de ${lista.length}`),
      el('div.suave', 'Se ganan con habilidades reales, no con tiempo jugado.')),
    el('div.logros', lista.map(l => {
      const [act, meta] = l.prog();
      return el('div.logro' + (l.tiene ? '.tiene' : ''),
        el('div.logro-ico', l.ico), el('div.logro-txt', l.txt),
        el('div.logro-prog', l.tiene ? el('span.ok', '✓ conseguido') : [
          el('div.hp', el('i', { style: { width: `${Math.min(100, act / meta * 100)}%`, background: 'var(--oro)' } })),
          el('span', `${Math.min(act, meta)}/${meta}`)]));
    })));
}

export function pantallaPerfil(c, ctx) {
  c.append(resumen(),
    el('div.ac-seccion', el('div.fila', el('h3.ac-h3', 'Misiones de hoy')), el('div.ac-recs', misionesDeHoy().map(m =>
      el('div.fila', { style: { fontSize: '.85em' } }, el('span', m.hecha ? '✓' : '·'), el('span', { style: { flex: 1 } }, m.texto), el('span.suave', `${m.prog}/${m.meta}`))))),
    el('div.ac-seccion', el('h3.ac-h3', 'Tus últimas dos semanas'), semanas()),
    logros(),
    el('div.fila', el('button.btn', { onclick: () => ctx.ir('Opciones', pantallaOpciones) }, 'Opciones y respaldo')));
}
