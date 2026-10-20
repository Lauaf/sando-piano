// Digitación automática (1 = pulgar … 5 = meñique) por programación dinámica.
// Modelo: cada dedo tiene una posición "natural" (Do Re Mi Fa Sol con 1-2-3-4-5); pasar el
// pulgar por debajo (o un dedo por encima del pulgar) cuesta algo, otros cruces cuestan mucho,
// el pulgar en tecla negra se evita y cada par de dedos tiene una apertura cómoda máxima.

const esNegra = m => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
const CASA = [0, 0, 2, 4, 5, 7];                  // semitonos desde el pulgar, por dedo (índice 1..5)
const APERTURA = {                                // apertura cómoda máxima entre dedos (semitonos)
  '1,2': 8, '1,3': 10, '1,4': 11, '1,5': 12, '2,3': 4, '2,4': 6, '2,5': 8, '3,4': 3, '3,5': 5, '4,5': 3,
};

/** Costo de ir de la nota con dedo a a la siguiente con dedo b; d = intervalo (mano derecha: + = hacia arriba). */
function costo(d, a, b, mPrev, m) {
  let c = 0;
  if (b === 1 && esNegra(m)) c += 2.5;
  if (b === 5 && esNegra(m)) c += 0.8;
  if (d === 0) return c + (a === b ? 0 : 4);
  if (Math.abs(d) > 14) return c + 1;              // salto: la mano se reubica
  if (a === b) return c + 7 + Math.abs(d) * 0.3;
  const sube = d > 0;
  if ((b > a) === sube) {                          // dirección natural de los dedos
    const esperado = Math.abs(CASA[b] - CASA[a]);
    const ab = Math.abs(d);
    const max = APERTURA[[Math.min(a, b), Math.max(a, b)].join(',')];
    return c + Math.abs(ab - esperado) * 0.55 + Math.max(0, ab - max) * 3;
  }
  // cruces
  const ab = Math.abs(d);
  if (sube && b === 1 && a >= 2 && a <= 4) {      // pulgar por debajo
    return c + 2.2 + Math.max(0, ab - 2) * 0.6 + (a === 4 ? 2.5 : 0) + (esNegra(mPrev) ? -0.5 : 0.3);
  }
  if (!sube && a === 1 && b >= 2 && b <= 4) {     // dedo por encima del pulgar
    return c + 2.2 + Math.max(0, ab - 2) * 0.6 + (b === 4 ? 2.5 : 0) + (esNegra(m) ? -0.5 : 0.3);
  }
  return c + 15;
}

/** Digitación para una línea melódica de una mano. alturas = [midi…]; mano = 'd' | 'i'. */
export function digitarLinea(alturas, mano = 'd') {
  const n = alturas.length;
  if (!n) return [];
  const s = mano === 'i' ? -1 : 1;                 // la izquierda es el espejo de la derecha
  const INF = 1e9;
  const dp = Array.from({ length: n }, () => new Array(6).fill(INF));
  const de = Array.from({ length: n }, () => new Array(6).fill(0));
  for (let f = 1; f <= 5; f++) dp[0][f] = (f === 1 && esNegra(alturas[0])) ? 2.5 : (f === 3 ? 0 : 0.3);
  for (let i = 1; i < n; i++) {
    const d = (alturas[i] - alturas[i - 1]) * s;
    for (let b = 1; b <= 5; b++) for (let a = 1; a <= 5; a++) {
      const v = dp[i - 1][a] + costo(d, a, b, alturas[i - 1], alturas[i]);
      if (v < dp[i][b]) { dp[i][b] = v; de[i][b] = a; }
    }
  }
  let f = 1;
  for (let k = 2; k <= 5; k++) if (dp[n - 1][k] < dp[n - 1][f]) f = k;
  const out = new Array(n);
  for (let i = n - 1; i >= 0; i--) { out[i] = f; f = de[i][f]; }
  return out;
}

/** Dedos para un acorde de una mano (alturas ordenadas de grave a agudo). */
function digitarAcorde(alturas, mano) {
  const orden = [...alturas].sort((x, y) => x - y);
  const span = orden[orden.length - 1] - orden[0];
  let dedos;
  if (orden.length === 1) dedos = [null];
  else if (orden.length === 2) dedos = span >= 7 ? [1, 5] : span >= 5 ? [1, 4] : span >= 3 ? [1, 3] : [1, 2];
  else if (orden.length === 3) dedos = span >= 6 ? [1, 3, 5] : span >= 5 ? [1, 2, 4] : [1, 2, 3];
  else dedos = [1, 2, 3, 5, 5].slice(0, orden.length);
  if (mano === 'i') dedos = dedos.reverse();        // en la izquierda el pulgar va arriba
  return new Map(orden.map((m, i) => [m, dedos[i]]));
}

/**
 * Completa n.dedo en una lista de notas {m, t, d, mano?, dedo?} sin pisar las que ya traen digitación.
 * Agrupa acordes (mismo t y misma mano) y digita la melodía (agudo en la derecha, grave en la izquierda).
 */
export function digitar(notas) {
  for (const mano of ['d', 'i']) {
    const propias = notas.filter(n => (n.mano || 'd') === mano);
    if (!propias.length) continue;
    const grupos = new Map();
    for (const n of propias) {
      const k = Math.round(n.t * 48);
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(n);
    }
    const lista = [...grupos.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
    const guia = lista.map(g => (mano === 'd' ? Math.max : Math.min)(...g.map(n => n.m)));
    const dedosGuia = digitarLinea(guia, mano);
    lista.forEach((g, i) => {
      if (g.length === 1) { if (g[0].dedo == null) g[0].dedo = dedosGuia[i]; return; }
      const mapa = digitarAcorde(g.map(n => n.m), mano);
      for (const n of g) if (n.dedo == null) n.dedo = mapa.get(n.m);
    });
  }
  return notas;
}
