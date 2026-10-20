// Canciones de dominio público para mano derecha. Formato: "Nota:duración" (duración en pulsos),
// "|" separa compases (solo visual). dedos opcional (1 = pulgar ... 5 = meñique).
import { midiDe } from '../piano/entrada.js';

const C = [
  { id: 'escala', tit: 'Escala de Do', nivel: 1, bpm: 70, desc: 'Con digitación: el pulgar pasa por debajo en el Fa.',
    notas: 'C4:1 D4:1 E4:1 F4:1 G4:1 A4:1 B4:1 C5:2 B4:1 A4:1 G4:1 F4:1 E4:1 D4:1 C4:2',
    dedos: '1 2 3 1 2 3 4 5 4 3 2 1 3 2 1' },
  { id: 'cinco', tit: 'Cinco dedos', nivel: 1, bpm: 80, desc: 'Do-Re-Mi-Fa-Sol con un dedo por tecla. La base de todo.',
    notas: 'C4:1 D4:1 E4:1 F4:1 G4:2 F4:1 E4:1 D4:1 C4:2 | C4:1 E4:1 G4:1 E4:1 C4:2',
    dedos: '1 2 3 4 5 4 3 2 1 1 3 5 3 1' },
  { id: 'estrellita', tit: 'Estrellita', nivel: 1, bpm: 90, desc: 'Twinkle twinkle little star (Mozart variaciones).',
    notas: 'C4:1 C4:1 G4:1 G4:1 A4:1 A4:1 G4:2 | F4:1 F4:1 E4:1 E4:1 D4:1 D4:1 C4:2 | G4:1 G4:1 F4:1 F4:1 E4:1 E4:1 D4:2 | G4:1 G4:1 F4:1 F4:1 E4:1 E4:1 D4:2 | C4:1 C4:1 G4:1 G4:1 A4:1 A4:1 G4:2 | F4:1 F4:1 E4:1 E4:1 D4:1 D4:1 C4:2' },
  { id: 'martinillo', tit: 'Martinillo', nivel: 1, bpm: 100, desc: 'Frère Jacques — ¿dónde estás?',
    notas: 'C4:1 D4:1 E4:1 C4:1 | C4:1 D4:1 E4:1 C4:1 | E4:1 F4:1 G4:2 | E4:1 F4:1 G4:2 | G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:1 C4:1 | G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:1 C4:1 | C4:1 G3:1 C4:2 | C4:1 G3:1 C4:2' },
  { id: 'oda', tit: 'Oda a la alegría', nivel: 2, bpm: 100, desc: 'Beethoven, 9ª sinfonía.',
    notas: 'E4:1 E4:1 F4:1 G4:1 | G4:1 F4:1 E4:1 D4:1 | C4:1 C4:1 D4:1 E4:1 | E4:1.5 D4:0.5 D4:2 | E4:1 E4:1 F4:1 G4:1 | G4:1 F4:1 E4:1 D4:1 | C4:1 C4:1 D4:1 E4:1 | D4:1.5 C4:0.5 C4:2 | D4:1 D4:1 E4:1 C4:1 | D4:1 E4:0.5 F4:0.5 E4:1 C4:1 | D4:1 E4:0.5 F4:0.5 E4:1 D4:1 | C4:1 D4:1 G3:2 | E4:1 E4:1 F4:1 G4:1 | G4:1 F4:1 E4:1 D4:1 | C4:1 C4:1 D4:1 E4:1 | D4:1.5 C4:0.5 C4:2' },
  { id: 'feliz', tit: 'Cumpleaños feliz', nivel: 2, bpm: 90, desc: 'Para tocársela a alguien de verdad.',
    notas: 'G4:0.75 G4:0.25 A4:1 G4:1 C5:1 B4:2 | G4:0.75 G4:0.25 A4:1 G4:1 D5:1 C5:2 | G4:0.75 G4:0.25 G5:1 E5:1 C5:1 B4:1 A4:2 | F5:0.75 F5:0.25 E5:1 C5:1 D5:1 C5:2' },
  { id: 'sakura', tit: 'Sakura Sakura', nivel: 3, bpm: 72, desc: 'さくらさくら — canción tradicional japonesa (escala in).',
    notas: 'A4:1 A4:1 B4:2 | A4:1 A4:1 B4:2 | A4:1 B4:1 C5:1 B4:1 | A4:1 B4:0.5 A4:0.5 F4:2 | E4:1 C4:1 E4:1 F4:1 | E4:1 E4:0.5 C4:0.5 B3:2 | A4:1 B4:1 C5:1 B4:1 | A4:1 B4:0.5 A4:0.5 F4:2 | E4:1 C4:1 E4:1 F4:1 | E4:1 E4:0.5 C4:0.5 B3:2 | A4:1 A4:1 B4:2 | A4:1 A4:1 B4:2 | E4:1 F4:1 B4:0.5 A4:0.5 F4:1 | E4:4' },
  { id: 'elisa', tit: 'Para Elisa (inicio)', nivel: 3, bpm: 70, desc: 'Beethoven. Con teclas negras: Re# y Sol#.',
    notas: 'E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1.5 | C4:0.5 E4:0.5 A4:0.5 B4:1.5 | E4:0.5 G#4:0.5 B4:0.5 C5:1.5 | E4:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1.5 | C4:0.5 E4:0.5 A4:0.5 B4:1.5 | E4:0.5 C5:0.5 B4:0.5 A4:3' },
];

export const CANCIONES = C.map(c => {
  const dedos = c.dedos ? c.dedos.split(' ').map(Number) : [];
  let t = 0;
  const notas = c.notas.replace(/\|/g, ' ').trim().split(/\s+/).map((x, i) => {
    const [n, d] = x.split(':');
    const nota = { m: midiDe(n), t, d: +d, dedo: dedos[i] || null };
    t += +d;
    return nota;
  });
  return { ...c, notas, pulsos: t };
});

export const ACORDES = [
  { n: 'Do', i: 'C', notas: [60, 64, 67], tipo: 'mayor' },
  { n: 'Fa', i: 'F', notas: [65, 69, 72], tipo: 'mayor' },
  { n: 'Sol', i: 'G', notas: [67, 71, 74], tipo: 'mayor' },
  { n: 'Lam', i: 'Am', notas: [69, 72, 76], tipo: 'menor' },
  { n: 'Rem', i: 'Dm', notas: [62, 65, 69], tipo: 'menor' },
  { n: 'Mim', i: 'Em', notas: [64, 67, 71], tipo: 'menor' },
  { n: 'Re', i: 'D', notas: [62, 66, 69], tipo: 'mayor' },
  { n: 'La', i: 'A', notas: [69, 73, 76], tipo: 'mayor' },
  { n: 'Mi', i: 'E', notas: [64, 68, 71], tipo: 'mayor' },
];
// Progresiones clásicas para practicar cambios de acorde
export const PROGRESIONES = [
  { n: 'I – IV – V – I (Do)', acordes: ['Do', 'Fa', 'Sol', 'Do'] },
  { n: 'I – V – vi – IV (pop)', acordes: ['Do', 'Sol', 'Lam', 'Fa'] },
  { n: 'vi – IV – I – V', acordes: ['Lam', 'Fa', 'Do', 'Sol'] },
  { n: 'ii – V – I (jazz)', acordes: ['Rem', 'Sol', 'Do'] },
];
