"""Beyer op. 101, ejercicios 8 y 9 (página 21 de la edición Ricordi en castellano), transcriptos a mano.

Ambos en posición de Do para la mano derecha (Do=1, Re=2, Mi=3, Fa=4, Sol=5) y la mano izquierda
en Sol4 (dedo 2 en el n.º 8, dedo 3 en el n.º 9). Los compases siguen la numeración de la partitura
(las repeticiones no se escriben dos veces: en el juego se usa el bucle).
Uso: python beyer_8_9.py <carpeta_salida>   -> genera beyer-08.musicxml y beyer-09.musicxml
"""
import sys
from pathlib import Path

from music21 import articulations, bar, layout, metadata, meter, note, stream, tempo

DEDO_MD = {'C5': 1, 'D5': 2, 'E5': 3, 'F5': 4, 'G5': 5}


def compases(texto):
    """'C5:1 E5:1 | G5:4' -> [[(altura, duración), ...], ...]"""
    return [[(n.split(':')[0], float(n.split(':')[1])) for n in c.split()] for c in texto.split('|')]


def armar(titulo, bpm, compas, md, mi, dedo_mi, repetir_desde, salida):
    s = stream.Score()
    s.metadata = metadata.Metadata(title=titulo)
    s.metadata.composer = 'Ferdinand Beyer'
    derecha, izquierda = stream.PartStaff(), stream.PartStaff()
    total = len(md)
    assert len(mi) == total, f'{titulo}: {len(md)} compases MD vs {len(mi)} MI'
    for i in range(total):
        for parte, contenido, mano in ((derecha, md, 'd'), (izquierda, mi, 'i')):
            m = stream.Measure(number=i + 1)
            if i == 0:
                m.append(meter.TimeSignature(compas))
                if mano == 'd':
                    m.insert(0, tempo.MetronomeMark(number=bpm))
            dur = sum(d for _, d in contenido[i])
            assert abs(dur - meter.TimeSignature(compas).barDuration.quarterLength) < 1e-6, f'{titulo} compás {i + 1} {mano}: {dur}'
            for alt, d in contenido[i]:
                n = note.Note(alt, quarterLength=d)
                dedo = DEDO_MD.get(alt) if mano == 'd' else dedo_mi
                if dedo:
                    n.articulations.append(articulations.Fingering(dedo))
                m.append(n)
            if repetir_desde and i + 1 == repetir_desde:
                m.leftBarline = bar.Repeat(direction='start')
            if repetir_desde and i + 1 == total:
                m.rightBarline = bar.Repeat(direction='end')
            parte.append(m)
    s.insert(0, derecha)
    s.insert(0, izquierda)
    s.insert(0, layout.StaffGroup([derecha, izquierda], symbol='brace'))
    s.write('musicxml', fp=str(salida))
    return s


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)

    # ---------- N.º 8 (4/4) ----------
    md8 = compases(
        'C5:1 E5:1 C5:1 E5:1 | G5:1 C5:1 C5:1 C5:1 | D5:1 D5:1 D5:1 D5:1 | E5:1 E5:1 E5:1 E5:1 |'
        'C5:1 E5:1 C5:1 E5:1 | G5:1 C5:1 C5:1 C5:1 | D5:1 D5:1 E5:1 D5:1 | C5:1 E5:1 C5:2 |'
        'G5:1 D5:1 D5:1 D5:1 | E5:1 C5:1 C5:1 C5:1 | G5:1 D5:1 D5:1 D5:1 | E5:1 C5:1 E5:1 D5:1 |'
        'C5:1 E5:1 C5:1 E5:1 | G5:1 C5:1 C5:1 C5:1 | D5:1 D5:1 E5:1 D5:1 | C5:1 E5:1 C5:2')
    redonda, blancas = 'G4:4', 'G4:2 G4:2'
    mi8 = compases(' | '.join([redonda] * 11 + [blancas] + [redonda] * 2 + [blancas] + [redonda]))
    armar('Beyer n.º 8', 80, '4/4', md8, mi8, 2, 9, out / 'beyer-08.musicxml')

    # ---------- N.º 9 (3/4, Allegretto) ----------
    md9 = compases(
        'C5:3 | E5:1 D5:1 C5:1 | D5:3 | G5:3 | C5:3 | E5:1 D5:1 C5:1 | D5:3 | D5:1 E5:1 D5:1 |'
        'C5:3 | E5:1 D5:1 C5:1 | D5:3 | G5:3 | C5:3 | E5:1 D5:1 C5:1 | D5:2 G5:1 | C5:3 |'
        'D5:3 | G5:3 | C5:3 | E5:3 | D5:3 | G5:3 | C5:3 | D5:1 E5:1 D5:1 |'
        'C5:3 | E5:1 D5:1 C5:1 | D5:3 | G5:3 | C5:3 | E5:1 D5:1 C5:1 | D5:2 G5:1 | C5:3')
    q, b = 'G4:1 G4:1 G4:1', 'G4:3'
    mi9_txt = [q, b, q, q, q, b, q, b,
               q, b, q, q, q, b, q, q,
               q, q, q, q, q, q, q, b,
               q, b, q, q, q, b, q, b]
    mi9 = compases(' | '.join(mi9_txt))
    armar('Beyer n.º 9 (Allegretto)', 100, '3/4', md9, mi9, 3, 17, out / 'beyer-09.musicxml')
    print('ok', out)


if __name__ == '__main__':
    main()
