"""Kass' Theme - FULL (The Champion's Ballad), arr. StefCopp (Mashibro). Transcripto a mano de las capturas.

3/4, negra = 170. Repeticiones: |: 2 … 17(1.ª) :| 18(2.ª) |: 19 … 34, 35-50 (1.ª) :| 51-68 (2.ª).
Formato por compás: 'mano derecha | mano izquierda'. Notas 'A4+C5:1.5' (acorde y duración en negras),
'r:1' silencio, '~' al final = ligada a la misma nota del compás siguiente, ' / ' separa dos voces.
Uso: python kass_theme.py salida.musicxml
"""
import sys

from music21 import bar, chord, layout, metadata, meter, note, spanner, stream, tempo, tie

C = {
    1: 'r:0.5 E4:0.75 F4:0.25 E4:0.25 D#4:0.25 E4:0.5 C5:0.5 | r:3',
    2: 'B4:3 | B2:1 B3+D4+F4:1 B3+D4+F4:1',
    3: 'r:0.5 E4:0.75 F4:0.25 E4:0.25 D#4:0.25 E4:0.5 B4:0.5 | E3:1 G#3+B3+D4:1 G#3+B3+D4:1',
    4: 'A4:3 | A2:1 A3+C4+E4:1 A3+C4+E4:1',
    5: 'r:0.5 A4:0.75 B4:0.25 A4:0.25 G#4:0.25 A4:0.5 E5+G5:0.5 | A2:1 C#4+E4+G4:1 C#4+E4+G4:1',
    6: 'D5+F5:1 r:0.5 D5+F5:0.5 D5+F5:1 | D3:1 A3+D4+F4:1 A3+D4+F4:1',
    7: 'D5+F5:1 E5+G5:1 D5+F5:1 | G3:1 B3+D4+F4:1 B3+D4+F4:1',
    8: 'D5+F5:1 C5+E5:2 | C3:1 G3+C4+E4:1 G3+C4+E4:1',
    9: 'r:1.5 C5:0.5 D5:0.5 E5:0.5 | C3:1 G3+C4+E4:1 G3+C4+E4:1',
    10: 'D5+F5:1.5 B-4+D5:0.5 B-4+D5:1~ | B-2:1 B-3+D4+F4:1 B-3+D4+F4:1',
    11: 'B-4+D5:1 r:0.5 D5:0.5 E5:0.5 D5:0.5 | B-2:1 B-3+D4+F4:1 B-3+D4+F4:1',
    12: 'B4+D5:1.5 A4+C5:0.5 A4+C5:1~ | A2:1 A3+C4+E4:1 A3+C4+E4:1',
    13: 'A4+C5:1 r:1 A4:0.5 B4:0.5 | G2:1 A3+C4+E4:1 A3+C4+E4:1',
    14: 'A4+C5:1.5 D5:0.5 A4+C5:1 | F3:1 A3+C4+F4:1 A3+C4+F4:1',
    15: 'G#4+B4:1 E5:1 C5:1 | E3+B3+E4:1 r:2',
    16: 'A4:3 | A2:1 E3:1 C3:1',
    17: 'r:0.5 E4:0.75 F4:0.25 E4:0.25 D#4:0.25 E4:0.5 C5:0.5 | A2:1 r:2',
    18: 'r:2 A4:0.25 B4:0.25 C#5:0.25 D5:0.25 | A2:1.5 r:1.5',
    19: 'E5:1.5 A4:0.5 A4:1~ | A2:1 A3+C#4+E4:1 A3+C#4+E4:1',
    20: 'A4:1 C#5:1 C#5+E5:1 | A2:1 A3+C#4+E4:1 A3+C#4+E4:1',
    21: 'D5+G5:1 D5+F5:1.5 C#5+E5:0.5 | D3:1 A3+D4+F4:1 A3+D4+F4:1',
    22: 'D5+F5:3 | D3:1 A3+D4+F4:1 C3:1',
    23: 'B4+D5:1.5 G4:0.5 G4:1~ | B2:1 D3+G3+B3:1 D3+G3+B3:1',
    24: 'G4:1 B4:1 B4+D5:1 | G2:1 G3+B3+D4+F4:1 G3+B3+D4+F4:1',
    25: 'D5+F5:1 C5+E5:1.5 B4+D#5:0.5 | C3:1 G3+C4+E4:1 G3+C4+E4:1',
    26: 'C5+E5:3 | C3:1 D3:1 E3:1',
    27: 'A4:1.5 B4:0.5 C5:1 / F4:3 | F3+C4:3',
    28: 'E4+G4:2 C5+E5:1 | E3+C4:3',
    29: 'B4+F5:1.5 E5:0.5 B4:1 | E3+G#3:3',
    30: 'C5:1.5 D5:0.5 E5:1 | A2:1 E3+C4:1 G2:1',
    31: 'F4+A4:2 A5:1 | F2:1 F3+A3+C4:2',
    32: 'F5+A5:1.5 G#5:0.5 A5:1 | F2:1 G3+B3+D#4:2',
    33: 'B4+G#5:1.5 B5:0.5 B4+G#5:1 | E2:1 G#3+B3+D4:2',
    34: 'E5:3 | E2:1 F#2:1 G#2:1',
    35: 'E4+A4:1.5 E4:0.5 E4:1~ | A2:1 C#3+E3:1 C#3+E3:1',
    36: 'E4:1 A4:0.5 B4:0.5 C#5:0.5 D5:0.5 | A2:1 C#3+E3:1 C#3+E3:1',
    37: 'E5:3 | G2:1 E3+A3+C#4:1 E3+A3+C#4:1',
    38: 'E5:1.5 E5:0.5 F5:0.5 G5:0.5 | G2:1 E3+A3+C#4:1 E3+A3+C#4:1',
    39: 'F5+A5:3 | F2:1 F3+A3+C4:1 F3+A3+C4:1',
    40: 'G5+A5:2 G5:0.25 A5:0.25 G5:0.25 F5:0.25 | G2:1 D3+G3+B3:1 D3+G3+B3:1',
    41: 'E5+G5:2 G5:0.5 F5:0.5 | E2:1 E3+G3+B3:1 E3+G3+B3:1',
    42: 'A4+E5:3 | A2:1 E3+A3+C#4:1 E3+A3+C#4:1',
    43: 'D5:1.5 E5:0.5 F5:1 | B2:1 E3+G3+B3:2',
    44: 'F5:1 E5:1 D5:1 | G#2:1 E3+G#3+B3:2',
    45: 'C5:2 D5:1 | A2:1 A3+C4+E4:1 A-2:1',
    46: 'E5:1 A5:1 C6:1 / E5:3 | G2:1 C3+E3+A3:1 G-2:1',
    47: 'B5:2 A5:1 | F2:1 G3+B3+D#4:2',
    48: 'G#5:1.5 F#5:0.5 G#5:1 / E5:3 | E2:1 G#3+B3+D4:2',
    49: 'A5:3 | A2:1 E3:1 C3:1',
    50: 'r:2 A4:0.25 B4:0.25 C#5:0.25 D5:0.25 | A2:1.5 r:1.5',
    51: 'E4+A4:1.5 E4:0.5 E4:1~ | A1+A2:1 C#3+E3:1 C#3+E3:1',
    52: 'E4:1 A4:0.5 B4:0.5 C#5:0.5 D5:0.5 | A1+A2:1 C#3+E3:1 C#3+E3:1',
    53: 'E5:3 | G1+G2:1 E3+A3+C#4:1 E3+A3+C#4:1',
    54: 'E5:1.5 E5:0.5 F5:0.5 G5:0.5 | G1+G2:1 E3+A3+C#4:1 E3+A3+C#4:1',
    55: 'F5+A5:3 | F1+F2:1 F3+A3+C4:1 F3+A3+C4:1',
    56: 'G5+A5:2 G5:0.25 A5:0.25 G5:0.25 F5:0.25 | G1+G2:1 D3+G3+B3:1 D3+G3+B3:1',
    57: 'E5+G5:2 G5:0.5 F5:0.5 | E1+E2:1 E3+G3+B3:1 E3+G3+B3:1',
    58: 'A4+E5:3 | A1+A2:1 E3+A3+C#4:1 E3+A3+C#4:1',
    59: 'D5:1.5 E5:0.5 F5:1 | B1+B2:1 E3+G3+B3:2',
    60: 'F5:1 E5:1 D5:1 | G#1+G#2:1 E3+G#3+B3:2',
    61: 'C5:2 D5:1 | A1+A2:1 A3+C4+E4:1 A-1+A-2:1',
    62: 'E5:1 A5:1 C6:1 / E5:3 | G1+G2:1 C3+E3+A3:1 G-1+G-2:1',
    63: 'B5:2 A5:1 | F1+F2:1 G3+B3+D#4:2',
    64: 'G#5:1.5 F#5:0.5 G#5:1 / E5:3 | E1+E2:1 G#3+B3+D4:2',
    65: 'A4+C5+E5+A5:1 A3+C4+E4:1 A3+C4+E4:1 | A1+A2:3',
    66: 'r:1 A3+D4+F#4:2 | A1+A2:3',
    67: 'r:1 A3+C4+E4:1 r:1 | A1+A2:2 E1+E2:1',
    68: 'C4+E4+A4:3 | A0+A1:3',
}
DEDOS = {}  # la partitura no trae digitación: la calcula el juego


def elemento(txt):
    ligada = txt.endswith('~')
    txt = txt.rstrip('~')
    alturas, dur = txt.split(':')
    dur = float(dur)
    if alturas == 'r':
        return note.Rest(quarterLength=dur), False
    ps = alturas.split('+')
    el = note.Note(ps[0], quarterLength=dur) if len(ps) == 1 else chord.Chord(ps, quarterLength=dur)
    return el, ligada


def voces(txt):
    return [v.split() for v in txt.split(' / ')]


def main():
    s = stream.Score()
    s.metadata = metadata.Metadata(title="Kass' Theme (BotW)")
    s.metadata.composer = 'Manaka Kataoka, Yasuaki Iwata · arr. StefCopp (Mashibro)'
    der, izq = stream.PartStaff(), stream.PartStaff()
    pendientes = {'d': {}, 'i': {}}
    medidas = {'d': {}, 'i': {}}
    for n in range(1, 69):
        md, mi = C[n].split(' | ')
        for parte, txt, mano in ((der, md, 'd'), (izq, mi, 'i')):
            m = stream.Measure(number=n)
            if n == 1:
                m.append(meter.TimeSignature('3/4'))
                if mano == 'd':
                    m.insert(0, tempo.MetronomeMark(number=170))
            vs = voces(txt)
            destinos = [m] if len(vs) == 1 else [stream.Voice(id=str(k + 1)) for k in range(len(vs))]
            for v, dest in zip(vs, destinos):
                total = 0
                for tok in v:
                    el, ligada = elemento(tok)
                    total += el.quarterLength
                    # ligaduras con el compás anterior
                    clave = tuple(p.nameWithOctave for p in getattr(el, 'pitches', []))
                    if clave and clave in pendientes[mano]:
                        el.tie = tie.Tie('stop')
                        del pendientes[mano][clave]
                    if ligada:
                        el.tie = tie.Tie('start')
                        pendientes[mano][clave] = True
                    dest.append(el)
                assert abs(total - 3) < 1e-6, f'compás {n} {mano}: suma {total}'
            if len(vs) > 1:
                for dest in destinos:
                    m.insert(0, dest)
            medidas[mano][n] = m
            parte.append(m)
    for mano in 'di':
        M = medidas[mano]
        M[2].leftBarline = bar.Repeat(direction='start')
        M[17].rightBarline = bar.Repeat(direction='end')
        M[19].leftBarline = bar.Repeat(direction='start')
        M[50].rightBarline = bar.Repeat(direction='end')
        parte = der if mano == 'd' else izq
        parte.insert(0, spanner.RepeatBracket([M[17]], number=1))
        parte.insert(0, spanner.RepeatBracket([M[18]], number=2))
        parte.insert(0, spanner.RepeatBracket([M[k] for k in range(35, 51)], number=1))
        parte.insert(0, spanner.RepeatBracket([M[k] for k in range(51, 69)], number=2))
        M[68].rightBarline = bar.Barline('final')
    s.insert(0, der)
    s.insert(0, izq)
    s.insert(0, layout.StaffGroup([der, izq], symbol='brace'))
    s.write('musicxml', fp=sys.argv[1])
    print('ok')


if __name__ == '__main__':
    main()
