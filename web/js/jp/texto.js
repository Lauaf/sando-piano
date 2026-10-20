// Texto japonés interactivo: tokens con lectura y significado, furigana, romaji,
// globo de traducción al hacer clic (como Emulingo) y conversión romaji <-> kana.
import { el, hablar, $ } from '../util.js';

// ---------- kana -> romaji ----------
const aHira = s => [...s].map(c => {
  const n = c.charCodeAt(0);
  return n >= 0x30a1 && n <= 0x30f6 ? String.fromCharCode(n - 0x60) : c;
}).join('');

const BASE = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so', た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no', は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', を: 'wo', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do', ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po', ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
};
const COMBI = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo', しゃ: 'sha', しゅ: 'shu', しょ: 'sho', ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo', ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo', みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo', ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo', じゃ: 'ja', じゅ: 'ju', じょ: 'jo',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo', ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
  ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo', てぃ: 'ti', でぃ: 'di', うぃ: 'wi', うぇ: 'we', うぉ: 'wo',
  ちぇ: 'che', しぇ: 'she', じぇ: 'je', つぁ: 'tsa',
};

export function aRomaji(texto) {
  const s = aHira(texto);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i], par = s.slice(i, i + 2);
    if (c === 'っ') {
      const sig = COMBI[s.slice(i + 1, i + 3)] || BASE[s[i + 1]] || '';
      out += sig.startsWith('ch') ? 't' : (sig[0] || '');
      continue;
    }
    if (c === 'ー') { out += out.match(/[aeiou](?!.*[aeiou])/)?.[0] || '-'; continue; }
    if (COMBI[par]) { out += COMBI[par]; i++; continue; }
    if (c === 'ん' && /[aiueoy]/.test(BASE[s[i + 1]]?.[0] || '')) { out += "n'"; continue; }
    out += BASE[c] ?? c;
  }
  return out.replace(/。/g, '.').replace(/、/g, ',').replace(/？/g, '?').replace(/！/g, '!');
}
export const tieneKanji = s => /[一-龯㐀-䶿]/.test(s);
export const esKana = s => /^[぀-ヿー]+$/.test(s);

// ---------- romaji -> hiragana (para escribir sin IME) ----------
const INVERSO = (() => {
  const m = {};
  for (const [k, v] of Object.entries(BASE)) if (!/[ぁぃぅぇぉゔ]/.test(k) && !(v in m)) m[v] = k;
  for (const [k, v] of Object.entries(COMBI)) m[v] ??= k;
  Object.assign(m, { si: 'し', ti: 'ち', tu: 'つ', hu: 'ふ', zi: 'じ', di: 'ぢ', du: 'づ', o: 'お', wo: 'を', jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ', sya: 'しゃ', syu: 'しゅ', syo: 'しょ', tya: 'ちゃ', tyu: 'ちゅ', tyo: 'ちょ', "n'": 'ん', nn: 'ん', '-': 'ー', '.': '。', ',': '、', '?': '？', '!': '！' });
  return m;
})();
export function aKana(romaji, katakana = false) {
  const s = romaji.toLowerCase();
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === s[i + 1] && /[bcdfghjkmpqrstvwxyz]/.test(c) && c !== 'n') { out += 'っ'; i++; continue; }
    if (c === 'n' && (i + 1 >= s.length || /[^aiueoyn']/.test(s[i + 1]))) { out += 'ん'; i++; continue; }
    let hecho = false;
    for (const len of [3, 2, 1]) {
      const sub = s.slice(i, i + len);
      if (INVERSO[sub]) { out += INVERSO[sub]; i += len; hecho = true; break; }
    }
    if (!hecho) { out += c; i++; }
  }
  if (!katakana) return out;
  return [...out].map(c => {
    const n = c.charCodeAt(0);
    return n >= 0x3041 && n <= 0x3096 ? String.fromCharCode(n + 0x60) : c;
  }).join('');
}

// ---------- tokens ----------
/** "[今日|きょう|hoy][は|(tema)]。" -> [{t,r,s}] */
export function parsear(markup) {
  const toks = [];
  const re = /\[([^\]]+)\]|([^[]+)/g;
  let m;
  while ((m = re.exec(markup))) {
    if (m[1]) {
      const p = m[1].split('|');
      toks.push(p.length >= 3 ? { t: p[0], r: p[1] || p[0], s: p[2] } : { t: p[0], r: p[0], s: p[1] || '' });
    } else {
      toks.push({ t: m[2], r: m[2], s: '' });
    }
  }
  return toks;
}
export const textoPlano = toks => toks.map(t => t.t).join('');
export const lecturaPlana = toks => toks.map(t => t.r || t.t).join('');

/** Normaliza tokens que vienen de la IA ({t,r,s} o {w,reading,meaning}). */
export function normalizar(toks) {
  return (toks || []).map(x => ({
    t: String(x.t ?? x.w ?? x.word ?? x.surface ?? ''),
    r: String(x.r ?? x.reading ?? x.kana ?? x.t ?? ''),
    s: String(x.s ?? x.meaning ?? x.es ?? ''),
  })).filter(x => x.t);
}

/**
 * Renderiza tokens como spans clicables. opciones: {furigana, romaji (línea extra), escribir: cb por letra}
 * Devuelve {nodo, romajiNodo}.
 */
export function renderTokens(toks, { furigana = true, romaji = false, alGuardar = null } = {}) {
  const nodo = el('span.jp');
  for (const tok of toks) {
    const conInfo = tok.s && tok.s.trim();
    let contenido;
    if (furigana && tieneKanji(tok.t) && tok.r && tok.r !== tok.t) {
      contenido = el('ruby', tok.t, el('rt', tok.r));
    } else {
      contenido = document.createTextNode(tok.t);
    }
    if (conInfo) {
      const s = el('span.pal', { onclick: e => { e.stopPropagation(); mostrarGlobo(tok, e.currentTarget, alGuardar); } }, contenido);
      nodo.append(s);
    } else {
      nodo.append(contenido);
    }
  }
  const rom = toks.map(t => aRomaji(t.r || t.t)).join(' ').replace(/\s+([.,!?「」])/g, '$1').replace(/\s+/g, ' ').trim();
  const romajiNodo = romaji ? el('div.suave', { style: { fontSize: '.7em', marginTop: '4px' } }, rom) : null;
  return { nodo, romajiNodo };
}

// ---------- globo de traducción ----------
/** alGuardar(tok): si viene, el globo ofrece guardar la palabra (devuelve true si ya estaba). */
export function mostrarGlobo(tok, ancla, alGuardar = null) {
  const g = $('#globo');
  document.querySelectorAll('.pal.activa').forEach(x => x.classList.remove('activa'));
  ancla.classList.add('activa');
  // replaceChildren escribe "null" para los null: se filtran
  g.replaceChildren(...[
    el('div.g-pal', tok.t),
    tok.r && tok.r !== tok.t ? el('div.g-lect', tok.r) : null,
    el('div.g-lect', aRomaji(tok.r || tok.t)),
    el('div.g-sig', tok.s),
    tok.b ? el('div.g-nota', `forma de diccionario: ${tok.b}`) : null,
    el('div.fila', { style: { gap: '6px' } },
      el('button.btn.chico', { onclick: e => { e.stopPropagation(); hablar(tok.r || tok.t); } }, '🔊 escuchar'),
      alGuardar ? el('button.btn.chico', { onclick: e => {
        e.stopPropagation();
        e.currentTarget.textContent = alGuardar(tok) ? '⭐ ya estaba en tu mazo' : '⭐ ¡guardada!';
        e.currentTarget.disabled = true;
      } }, '☆ guardar') : null),
  ].filter(Boolean));
  g.classList.remove('oculto');
  const cont = $('#pantalla').getBoundingClientRect();
  const r = ancla.getBoundingClientRect();
  const gw = g.offsetWidth, gh = g.offsetHeight;
  let x = r.left - cont.left + r.width / 2 - gw / 2;
  let y = r.top - cont.top - gh - 10;
  if (y < 4) y = r.bottom - cont.top + 10;
  x = Math.max(4, Math.min(cont.width - gw - 4, x));
  g.style.left = x + 'px';
  g.style.top = y + 'px';
  hablar(tok.r || tok.t);
}
export function ocultarGlobo() {
  $('#globo').classList.add('oculto');
  document.querySelectorAll('.pal.activa').forEach(x => x.classList.remove('activa'));
}
document.addEventListener('click', ocultarGlobo);
