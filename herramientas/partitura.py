"""Graba una canción de Sando como partitura (SVG con Verovio) y devuelve el mapa de tiempos.

Uso: python partitura.py <cancion.json> <salida.json> [ancho]
Se arma desde las MISMAS notas que usa el juego (con las repeticiones ya desplegadas), así que
cada nota del juego tiene su nota en el papel: salida = {svg, eventos: [{q, notas: [{id, m}]}], compases}.
"""
import json
import sys
from fractions import Fraction

import verovio
from music21 import articulations, chord, clef, key, metadata, meter, note, stream, tempo, layout

PASO = Fraction(1, 4)  # semicorcheas; las transcripciones de audio se simplifican a corcheas


def q(x, paso=None):
    paso = paso or PASO
    return Fraction(round(Fraction(x).limit_denominator(64) / paso)) * paso


def sin_becuadro(el):
    # al crear notas desde número MIDI music21 les pone becuadro explícito: lo sacamos
    for p in getattr(el, 'pitches', [el.pitch] if hasattr(el, 'pitch') else []):
        if p.accidental is not None and p.accidental.name == 'natural':
            p.accidental = None
    return el


def construir(c):
    notas = c['notas']
    compas = float(c.get('compas') or 4)
    num = int(round(compas)) if abs(compas - round(compas)) < 1e-6 else int(round(compas * 2))
    den = 4 if abs(compas - round(compas)) < 1e-6 else 8
    if c.get('compas_txt'):
        num, den = (int(x) for x in c['compas_txt'].split('/'))
    s = stream.Score()
    s.metadata = metadata.Metadata(title=c.get('titulo') or '')
    partes = []
    for mano in ('d', 'i'):
        propias = [n for n in notas if (n.get('mano') or 'd') == mano]
        if not propias:
            continue
        p = stream.PartStaff()
        media = sum(n['m'] for n in propias) / len(propias)
        p.insert(0, clef.TrebleClef() if mano == 'd' or media >= 55 else clef.BassClef())
        p.insert(0, meter.TimeSignature(f'{num}/{den}'))
        if mano == 'd':
            if den == 8 and num % 3 == 0:  # compás compuesto: el pulso es la negra con puntillo
                p.insert(0, tempo.MetronomeMark(number=round((c.get('bpm') or 90) / 1.5), referent=note.Note(type='quarter', dots=1)))
            else:
                p.insert(0, tempo.MetronomeMark(number=c.get('bpm') or 90))
        paso = Fraction(c['paso']).limit_denominator(12) if c.get('paso') else (Fraction(1, 2) if c.get('aproximada') else PASO)
        # un acorde por instante; cada uno dura hasta el siguiente como máximo (sin voces encimadas)
        por_t = {}
        for n in propias:
            por_t.setdefault(q(n['t'], paso), []).append(n)
        instantes = sorted(por_t)
        grupos = {}
        for k, t in enumerate(instantes):
            d = max(paso, min(q(n['d'], paso) for n in por_t[t]))
            if k + 1 < len(instantes):
                d = min(d, instantes[k + 1] - t)
            grupos[(t, d)] = por_t[t]
        for (t, d), g in sorted(grupos.items()):
            if len(g) == 1:
                el = note.Note(g[0]['m'], quarterLength=d)
                if g[0].get('dedo'):
                    el.articulations.append(articulations.Fingering(g[0]['dedo']))
            else:
                g = sorted(g, key=lambda x: x['m'])
                el = chord.Chord([x['m'] for x in g], quarterLength=d)
                for x in reversed(g):  # en MusicXML la digitación de acordes va de arriba hacia abajo
                    if x.get('dedo'):
                        el.articulations.append(articulations.Fingering(x['dedo']))
            p.insert(float(t), sin_becuadro(el))
        partes.append(p)
    # tonalidad: armadura de clave y alteraciones escritas como corresponde (Lab y no Sol# en Mib)
    try:
        todas = stream.Stream()
        for p in partes:
            for el in p.recurse().notes:
                todas.append(note.Note(el.pitches[0]) if hasattr(el, 'pitches') else el)
        # armadura: la que deja menos alteraciones escritas (más claro para leer que el análisis tonal)
        from collections import Counter
        clases = Counter(int(x.pitch.midi) % 12 for x in todas.notes)
        ESCALA = [0, 2, 4, 5, 7, 9, 11]
        def costo(sost):
            tonica = (7 * sost) % 12
            dentro = {(tonica + g) % 12 for g in ESCALA}
            return sum(n for pc, n in clases.items() if pc not in dentro), abs(sost)
        k = key.KeySignature(min(range(-6, 7), key=costo))
        for p in partes:
            p.insert(0, key.KeySignature(k.sharps))
            for el in p.recurse().notes:
                for pt in el.pitches:
                    if pt.accidental is None:
                        continue
                    if k.sharps < 0 and pt.accidental.name == 'sharp':
                        nuevo = pt.getEnharmonic()
                        pt.step, pt.octave, pt.accidental = nuevo.step, nuevo.octave, nuevo.accidental
                    elif k.sharps > 0 and pt.accidental.name == 'flat':
                        nuevo = pt.getEnharmonic()
                        pt.step, pt.octave, pt.accidental = nuevo.step, nuevo.octave, nuevo.accidental
    except Exception:
        pass
    for p in partes:
        s.insert(0, p)
    if len(partes) == 2:
        s.insert(0, layout.StaffGroup(partes, symbol='brace'))
    return s.makeNotation()


def main():
    origen, salida = sys.argv[1], sys.argv[2]
    ancho = int(sys.argv[3]) if len(sys.argv) > 3 else 2200
    c = json.load(open(origen, encoding='utf-8'))
    xml = construir(c).write('musicxml')
    tk = verovio.toolkit()
    tk.setOptions({
        'pageWidth': ancho, 'pageHeight': 60000, 'adjustPageHeight': True, 'scale': 42,
        'breaks': 'auto', 'header': 'none', 'footer': 'none', 'pageMarginTop': 30, 'pageMarginBottom': 30,
        'pageMarginLeft': 40, 'pageMarginRight': 40, 'spacingSystem': 14, 'svgViewBox': True,
    })
    tk.loadFile(str(xml))
    svg = tk.renderToSVG(1)
    eventos = []
    for ev in tk.renderToTimemap({'includeMeasures': True}):
        if not ev.get('on'):
            continue
        notas = []
        for nid in ev['on']:
            midi = tk.getMIDIValuesForElement(nid)  # la altura real (respeta armadura y alteraciones)
            if midi and midi.get('pitch') is not None:
                notas.append({'id': nid, 'm': int(midi['pitch'])})
        if notas:
            eventos.append({'q': ev['qstamp'], 'notas': notas})
    json.dump({'svg': svg, 'eventos': eventos}, open(salida, 'w', encoding='utf-8'), ensure_ascii=False)
    print('ok', len(eventos), 'eventos')


if __name__ == '__main__':
    main()
