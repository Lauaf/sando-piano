"""Convierte una canción a notas para Sando.

Entradas:
  --url <youtube>            baja el audio (yt-dlp) y lo transcribe (Basic Pitch)
  --archivo <ruta>           .mid/.midi/.musicxml/.xml/.mxl (directo, con digitación si la trae)
                             .pdf/.png/.jpg (lectura óptica de partitura con oemer)
                             .mp3/.wav/.m4a/.ogg/.flac/.webm (transcripción)
Salida: --salida <json> con {titulo, fuente, bpm, compas, notas:[{m,t,d,mano,dedo?}]}
Progreso: --progreso <json> con {estado, pct, mensaje}
Corre en L:\\Sando\\venv (ver server.py).
"""
import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

AUDIO = {'.mp3', '.wav', '.m4a', '.ogg', '.flac', '.webm', '.opus', '.aac'}
PARTITURA = {'.mid', '.midi', '.musicxml', '.xml', '.mxl'}
IMAGEN = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff'}

args = None


def progreso(mensaje, pct, estado='trabajando', **extra):
    datos = {'estado': estado, 'pct': pct, 'mensaje': mensaje, 'ts': time.time(), **extra}
    Path(args.progreso).write_text(json.dumps(datos, ensure_ascii=False), encoding='utf-8')


# ---------- audio ----------
def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def a_wav(origen, tmp):
    destino = Path(tmp) / 'audio.wav'
    subprocess.run([ffmpeg(), '-y', '-loglevel', 'error', '-i', str(origen), '-ac', '1', '-ar', '22050', str(destino)],
                   check=True, stdin=subprocess.DEVNULL)
    return destino


def bajar_youtube(url, tmp):
    """Baja el audio y, aparte, el video en baja resolución (para leer las teclas iluminadas)."""
    import yt_dlp
    progreso('Bajando el audio del video…', 6)
    base = {'noplaylist': True, 'quiet': True, 'no_warnings': True, 'noprogress': True, 'max_filesize': 300 * 1024 * 1024}
    with yt_dlp.YoutubeDL({**base, 'format': 'bestaudio/best', 'outtmpl': str(Path(tmp) / 'yt-audio.%(ext)s')}) as ydl:
        info = ydl.extract_info(url, download=True)
    if info.get('duration') and info['duration'] > 20 * 60:
        raise RuntimeError('El video dura más de 20 minutos; elegí uno más corto (una sola pieza).')
    audio = next(Path(tmp).glob('yt-audio.*'))
    video = None
    try:
        progreso('Bajando la imagen del video…', 12)
        with yt_dlp.YoutubeDL({**base, 'format': 'bv*[height<=480][ext=mp4]/bv*[height<=480]/bv*',
                               'outtmpl': str(Path(tmp) / 'yt-video.%(ext)s')}) as ydl:
            ydl.download([url])
        video = next(Path(tmp).glob('yt-video.*'), None)
    except Exception:
        video = None
    return audio, video, info.get('title') or 'Canción de YouTube'


def eventos_audio(wav):
    """Notas 'de oído' con Basic Pitch: (inicio s, fin s, altura, fuerza). Sin armónicos fantasma."""
    from basic_pitch import ICASSP_2022_MODEL_PATH
    from basic_pitch.inference import predict
    _, _, eventos = predict(str(wav), ICASSP_2022_MODEL_PATH, onset_threshold=0.55, frame_threshold=0.3,
                            minimum_note_length=90, minimum_frequency=27.5, maximum_frequency=4200,
                            melodia_trick=True)
    eventos = [(e[0], e[1], int(e[2]), e[3]) for e in eventos if e[3] >= 0.25 and e[1] - e[0] >= 0.07 and 21 <= e[2] <= 100]
    fantasmas = set()
    for i, (ini, fin, alto, amp) in enumerate(eventos):
        for j, (ini2, fin2, alto2, amp2) in enumerate(eventos):
            dif = alto - alto2
            # las octavas reales son comunes en piano: solo la descartamos si es mucho más débil
            if i != j and abs(ini - ini2) < 0.06 and ((dif == 12 and amp < amp2 * 0.7) or (dif in (19, 24, 28, 31) and amp < amp2 * 0.9)):
                fantasmas.add(i)
                break
    return [e for i, e in enumerate(eventos) if i not in fantasmas]


def mapa_de_pulsos(wav):
    """Pulsos de la grabación (librosa). Devuelve (tiempos de pulso en s, bpm)."""
    import librosa
    import numpy as np
    y, sr = librosa.load(str(wav), sr=22050, mono=True)
    tempo, cuadros = librosa.beat.beat_track(y=y, sr=sr)
    tiempos = librosa.frames_to_time(cuadros, sr=sr)
    bpm = float(tempo[0] if hasattr(tempo, '__len__') else tempo) or 100.0
    if len(tiempos) >= 8:
        bpm = 60.0 / float(np.median(np.diff(tiempos)))
    # tutoriales lentos: el detector a veces toma la mitad del pulso; lo llevamos a un rango cómodo
    while bpm > 160:
        bpm /= 2
        tiempos = tiempos[::2]
    while bpm < 50:
        bpm *= 2
        tiempos = np.sort(np.concatenate([tiempos, (tiempos[:-1] + tiempos[1:]) / 2]))
    return tiempos, bpm


def a_pulsos(seg, tiempos, bpm):
    """Segundos -> posición en pulsos siguiendo los pulsos reales (así aguanta que el tutorial acelere o frene)."""
    import numpy as np
    if len(tiempos) < 4:
        return seg * bpm / 60
    idx = np.arange(len(tiempos), dtype=float)
    p = bpm / 60
    if seg <= tiempos[0]:
        return (seg - tiempos[0]) * p
    if seg >= tiempos[-1]:
        return idx[-1] + (seg - tiempos[-1]) * p
    return float(np.interp(seg, tiempos, idx))


def armar_notas(crudas, tiempos, bpm, aproximada):
    """crudas = [{'m', 'ini', 'fin', 'mano'}] en segundos -> (notas del juego en pulsos, compás).
    Alinea la grilla con donde caen las notas, detecta si va en 3 o en 4 y cuantiza."""
    import numpy as np
    if not crudas:
        return [], 4
    pos = np.array([a_pulsos(n['ini'], tiempos, bpm) for n in crudas])
    fin = np.array([a_pulsos(n['fin'], tiempos, bpm) for n in crudas])
    # fase: corremos la grilla para que la mayoría de los ataques caigan sobre el pulso
    # (donde se juntan más ataques; el promedio se deja arrastrar por las notas con swing)
    fr0 = pos - np.floor(pos)
    candidatas = np.arange(0, 1, 0.01)
    # cada ataque vota con peso = su duración (las notas largas suelen caer en el tiempo)
    peso = np.clip(fin - pos, 0.25, 4)
    votos = [np.sum(peso * (np.minimum(np.abs(fr0 - c), 1 - np.abs(fr0 - c)) < 0.06)) for c in candidatas]
    fase = float(candidatas[int(np.argmax(votos))])
    if fase > 0.5:
        fase -= 1
    pos, fin = pos - fase, fin - fase
    # compás: el bajo (notas graves de la izquierda) cambia en el tiempo fuerte
    izq = np.array([n['m'] for n in crudas])
    manos = np.array([n['mano'] for n in crudas])
    graves = (manos == 'i') & (izq <= np.median(izq[manos == 'i'])) if (manos == 'i').any() else izq <= np.median(izq)
    pb = np.round(pos[graves]).astype(int)
    alt = izq[graves]
    # solo los cambios de nota del bajo (una nota repetida no marca compás)
    orden = np.argsort(pb)
    pb, alt = pb[orden], alt[orden]
    cambios = pb[np.r_[True, alt[1:] != alt[:-1]]] if len(pb) else pb
    mejor = (0, 4, 0)
    for L in (4, 3):
        if len(cambios) < 6:
            break
        cuentas = np.bincount(cambios % L, minlength=L)
        f = int(np.argmax(cuentas))
        puntaje = cuentas[f] / len(cambios) * L * (1.1 if L == 4 else 1.0)  # ante la duda, 4/4
        if puntaje > mejor[0]:
            mejor = (puntaje, L, f)
    _, compas, fuerte = mejor
    pos, fin = pos - fuerte, fin - fuerte
    # grilla: semicorcheas, o tresillos si la pieza tiene swing (ataques cerca de 1/3 y 2/3 del pulso)
    frac = pos - np.floor(pos)
    cerca = lambda v: np.abs(frac - v) < 0.07
    votos3 = int(np.sum(cerca(1 / 3) | cerca(2 / 3)))
    votos4 = int(np.sum(cerca(0.25) | cerca(0.5) | cerca(0.75)))
    paso = 0.5 if aproximada else 0.25
    tresillos = not aproximada and votos3 > 1.5 * votos4 and votos3 > 0.1 * len(frac)
    if tresillos:
        paso = 1 / 3
    q = lambda x: round(round(float(x) / paso) * paso, 4)
    notas = []
    for n, a, b in zip(crudas, pos, fin):
        t = q(a)
        notas.append({'m': int(n['m']), 't': t, 'd': max(paso, q(b - a)), 'mano': n['mano']})
    # legato: si la nota se suelta apenas antes de la siguiente de la misma mano, dura hasta ella
    for mano in ('d', 'i'):
        propias = sorted((n for n in notas if n['mano'] == mano), key=lambda n: n['t'])
        inicios = sorted({n['t'] for n in propias})
        for n in propias:
            sig = next((x for x in inicios if x > n['t'] + 1e-6), None)
            if sig is not None and 0 < sig - (n['t'] + n['d']) <= max(0.5, 2 * paso) and sig - n['t'] <= 4:
                n['d'] = round(sig - n['t'], 4)
    t0 = min(n['t'] for n in notas)
    corr = -compas * np.floor(t0 / compas)  # que el primer compás (o la anacrusa) quede dentro del compás 1
    for n in notas:
        n['t'] = round(n['t'] + corr, 3)
    notas.sort(key=lambda n: (n['t'], n['m']))
    compas_txt = f'{compas}/4'
    if tresillos:
        # swing / compás compuesto: cada pulso es una negra con puntillo (3 corcheas) -> 6/8 o 12/8
        for n in notas:   # en tercios de pulso -> corcheas exactas (sin errores de redondeo)
            n['t'] = round(n['t'] * 3) / 2
            n['d'] = max(0.5, round(n['d'] * 3) / 2)
        paso = 0.5
        compas_txt = f'{compas * 3}/8'
        compas = compas * 1.5
    return notas, compas, paso, compas_txt


def ajustar_octava(video, audio):
    """El video da las notas exactas pero no la octava (si el teclado está con zoom); el audio sí.
    Probamos corrimientos de octava y elegimos el que más coincide con lo que se escucha."""
    import bisect
    inicios = sorted((e[0], e[2]) for e in audio)
    tiempos_a = [x[0] for x in inicios]
    mejor, mejor_k = -1, 0
    for k in (-36, -24, -12, 0, 12, 24, 36):
        aciertos = 0
        for n in video:
            m = n['m'] + k
            j = bisect.bisect_left(tiempos_a, n['ini'] - 0.15)
            while j < len(inicios) and inicios[j][0] <= n['ini'] + 0.15:
                if inicios[j][1] == m:
                    aciertos += 1
                    break
                j += 1
        if aciertos > mejor:
            mejor, mejor_k = aciertos, k
    return mejor_k, mejor


def transcribir(wav, video=None):
    """Si hay video de tutorial (teclas que se iluminan) lo leemos; si no, transcribimos el audio."""
    import numpy as np
    crudas = None
    manos_color = False
    if video:
        try:
            sys.path.insert(0, str(Path(__file__).resolve().parent))
            import video_piano
            r = video_piano.notas_de_video(video, progreso, corregir_octava=False)
            if r and len(r['notas']) >= 16:
                crudas = r['notas']
                manos_color = r['manos_por_color']
                octava_segura = r['octava_segura']
        except Exception as e:  # noqa: BLE001
            print('video falló:', e, file=sys.stderr)
            crudas = None
    progreso('Escuchando la grabación (para la octava y el tempo)…' if crudas else 'Escuchando la grabación y anotando cada nota (1–3 min)…', 82 if crudas else 30)
    eventos = eventos_audio(wav)
    progreso('Buscando el pulso de la canción…', 92)
    tiempos, bpm = mapa_de_pulsos(wav)
    if crudas:
        if not octava_segura:
            k, aciertos = ajustar_octava(crudas, eventos)
            for n in crudas:
                n['m'] += k
        notas, compas, paso, compas_txt = armar_notas(crudas, tiempos, bpm, aproximada=False)
        negras = bpm * (1.5 if compas_txt.endswith('/8') else 1)   # el juego cuenta en negras
        return {'bpm': round(negras), 'compas': compas, 'compas_txt': compas_txt, 'paso': paso, 'notas': notas, 'aproximada': False, 'metodo': 'video',
                'manos_por_color': manos_color}
    crudas = [{'m': a, 'ini': i, 'fin': f, 'mano': 'd' if a >= 60 else 'i'} for i, f, a, _ in eventos]
    notas, compas, paso, compas_txt = armar_notas(crudas, tiempos, bpm, aproximada=True)
    return {'bpm': round(bpm), 'compas': compas, 'compas_txt': compas_txt, 'paso': paso, 'notas': notas, 'aproximada': True, 'metodo': 'audio'}


# ---------- partituras ----------
def extraer_score(score):
    from music21 import articulations, meter, tempo as m21tempo, stream, note, chord
    try:
        score = score.expandRepeats()
    except Exception:
        pass
    bpm = 90.0
    for mm in score.recurse().getElementsByClass(m21tempo.MetronomeMark):
        if mm.number:
            bpm = float(mm.getQuarterBPM() or mm.number)
            break
    compas = 4.0
    for ts in score.recurse().getElementsByClass(meter.TimeSignature):
        compas = float(ts.barDuration.quarterLength)
        break
    partes = list(score.parts) if hasattr(score, 'parts') and len(score.parts) else [score]
    def altura_media(p):
        alts = [x.pitch.midi if isinstance(x, note.Note) else x.pitches[0].midi for x in p.flatten().notes]
        return sum(alts) / len(alts) if alts else 0
    # piano: dos pentagramas (MusicXML) o dos pistas (MIDI) donde la primera es la más aguda
    piano = len(partes) == 2 and (all(isinstance(p, stream.PartStaff) for p in partes)
                                  or altura_media(partes[0]) > altura_media(partes[1]))
    notas = []
    for ip, parte in enumerate(partes):
        try:
            parte = parte.stripTies()
        except Exception:
            pass
        for el in parte.flatten().notes:
            if el.duration.quarterLength == 0:  # adornos
                continue
            t = float(el.getOffsetInHierarchy(parte)) if hasattr(el, 'getOffsetInHierarchy') else float(el.offset)
            d = float(el.duration.quarterLength)
            dedos = [a.fingerNumber for a in el.articulations if isinstance(a, articulations.Fingering)]
            alturas = [el.pitch.midi] if isinstance(el, note.Note) else sorted(p.midi for p in el.pitches)
            for k, m in enumerate(alturas):
                mano = ('d' if ip == 0 else 'i') if piano else ('d' if m >= 60 else 'i')
                n = {'m': int(m), 't': round(t, 4), 'd': round(d, 4), 'mano': mano}
                dedo = dedos[k] if len(dedos) == len(alturas) else (dedos[0] if len(alturas) == 1 and dedos else None)
                if isinstance(dedo, int) and 1 <= dedo <= 5:
                    n['dedo'] = dedo
                notas.append(n)
    notas.sort(key=lambda n: (n['t'], n['m']))
    if not notas:
        raise RuntimeError('No encontré notas en la partitura.')
    t0 = notas[0]['t']
    for n in notas:
        n['t'] = round(n['t'] - t0, 4)
    titulo = None
    if score.metadata:
        titulo = score.metadata.bestTitle or score.metadata.title
        if titulo and titulo.lower() in ('music21', 'untitled', 'sin título', 'title'):
            titulo = None
    return {'bpm': round(bpm), 'compas': compas, 'notas': notas, 'titulo_partitura': titulo}


def leer_partitura(ruta):
    from music21 import converter
    progreso('Leyendo la partitura…', 40)
    return extraer_score(converter.parse(str(ruta)))


def omr(imagenes, tmp):
    """Lectura óptica (oemer) de cada página -> MusicXML -> notas, encadenando páginas."""
    from music21 import converter
    resultado = None
    # oemer vive en su propio entorno (necesita numpy 2, que rompe TensorFlow/Basic Pitch)
    py_omr = Path(__file__).resolve().parent.parent / 'venv-omrgpu' / 'Scripts' / 'python.exe'
    oemer = Path(__file__).resolve().parent / 'omr.py'
    if not oemer.exists():
        raise RuntimeError('Falta instalar el lector de partituras (oemer).')
    for i, img in enumerate(imagenes):
        progreso(f'Leyendo la partitura con visión: página {i + 1}/{len(imagenes)} (puede tardar 1–2 min por página)…',
                 20 + int(60 * i / len(imagenes)))
        salida = Path(tmp) / f'omr{i}'
        salida.mkdir(exist_ok=True)
        subprocess.run([str(py_omr), '-I', str(oemer), str(img), str(salida)], check=True, stdin=subprocess.DEVNULL,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        xml = next(salida.glob('*.musicxml'), None)
        if not xml:
            continue
        parcial = extraer_score(converter.parse(str(xml)))
        if resultado is None:
            resultado = parcial
        else:
            fin = max(n['t'] + n['d'] for n in resultado['notas'])
            for n in parcial['notas']:
                n['t'] = round(n['t'] + fin, 4)
            resultado['notas'] += parcial['notas']
    if not resultado:
        raise RuntimeError('No pude leer notas en la partitura. Probá con una foto más derecha y nítida, o pedí el archivo MusicXML.')
    resultado['aproximada'] = True
    return resultado


def pdf_a_imagenes(pdf, tmp):
    import pymupdf
    imgs = []
    with pymupdf.open(str(pdf)) as doc:
        for i, pag in enumerate(doc):
            if i >= 8:
                break
            ruta = Path(tmp) / f'pag{i}.png'
            pag.get_pixmap(dpi=250).save(str(ruta))
            imgs.append(ruta)
    return imgs


def main():
    global args
    ap = argparse.ArgumentParser()
    ap.add_argument('--url')
    ap.add_argument('--archivo')
    ap.add_argument('--titulo', default='')
    ap.add_argument('--nombre', default='', help='nombre original del archivo (para el título)')
    ap.add_argument('--salida', required=True)
    ap.add_argument('--progreso', required=True)
    args = ap.parse_args()
    tmp = tempfile.mkdtemp(prefix='sando-')
    try:
        progreso('Preparando…', 2)
        if args.url:
            audio, video, titulo = bajar_youtube(args.url, tmp)
            progreso('Convirtiendo el audio…', 18)
            datos = transcribir(a_wav(audio, tmp), video)
            fuente = 'youtube'
        else:
            ruta = Path(args.archivo)
            ext = ruta.suffix.lower()
            titulo = ruta.stem
            if ext in PARTITURA:
                datos = leer_partitura(ruta)
                fuente = 'midi' if ext in ('.mid', '.midi') else 'musicxml'
            elif ext == '.pdf':
                progreso('Pasando el PDF a imágenes…', 10)
                datos = omr(pdf_a_imagenes(ruta, tmp), tmp)
                fuente = 'partitura'
            elif ext in IMAGEN:
                datos = omr([ruta], tmp)
                fuente = 'partitura'
            elif ext in AUDIO:
                progreso('Convirtiendo el audio…', 10)
                datos = transcribir(a_wav(ruta, tmp))
                fuente = 'audio'
            else:
                raise RuntimeError(f'No sé leer archivos {ext}')
        del_archivo = datos.pop('titulo_partitura', None)
        if del_archivo and args.archivo and del_archivo.strip().lower() == Path(args.archivo).stem.lower():
            del_archivo = None  # music21 usa el nombre del archivo cuando la partitura no trae título
        titulo = args.titulo or del_archivo or args.nombre or titulo
        datos.pop('titulo_partitura', None)
        datos.update({'titulo': titulo, 'fuente': fuente})
        Path(args.salida).write_text(json.dumps(datos, ensure_ascii=False), encoding='utf-8')
        progreso(f'¡Listo! {len(datos["notas"])} notas.', 100, estado='listo')
    except subprocess.CalledProcessError as e:
        progreso(f'Falló un paso externo ({Path(e.cmd[0]).name}).', 100, estado='error')
    except Exception as e:
        progreso(str(e) or e.__class__.__name__, 100, estado='error')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
