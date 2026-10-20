// Puente con la IA local (vía server.py). Si no hay IA, quien llama usa su contenido offline.
import { $ } from './util.js';

export const IA = { disponible: false, modelo: '', backend: '' };

export async function revisarIA() {
  try {
    const r = await (await fetch('/api/ia/estado')).json();
    IA.disponible = !!r.ok;
    IA.modelo = r.modelo || '';
    IA.backend = r.backend || '';
  } catch {
    IA.disponible = false;
  }
  const b = $('#hud-ia');
  b.textContent = IA.disponible ? 'IA ● on' : 'IA ○ off';
  b.classList.toggle('on', IA.disponible);
  b.title = IA.disponible
    ? `Usando ${IA.backend} (${IA.modelo})`
    : 'IA local apagada: el juego usa contenido offline. Prendé "Iniciar IA" para conversaciones libres.';
  return IA.disponible;
}

/**
 * Pregunta a la IA. `sistema` = rol, `mensajes` = [{role, content}].
 * Con json=true devuelve el objeto parseado (o null si falla).
 */
export async function preguntar(sistema, mensajes, { json = false, temperatura = 0.7, max_tokens = 900 } = {}) {
  if (!IA.disponible && !(await revisarIA())) return null;
  try {
    const r = await (await fetch('/api/ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensajes: [{ role: 'system', content: sistema }, ...mensajes], json, temperatura, max_tokens }),
    })).json();
    if (!r.ok) {
      IA.disponible = false;
      revisarIA();
      return null;
    }
    return json ? r.json : r.texto;
  } catch {
    return null;
  }
}
