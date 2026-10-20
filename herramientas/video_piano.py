"""Lee las notas de un video de piano estilo Synthesia (barras que caen sobre un teclado que se ilumina).

Mucho más fiel que transcribir el audio: cada tecla iluminada es una nota exacta y el color de la
barra dice qué mano la toca.
Uso como módulo:  notas_de_video(ruta_mp4) -> {'notas': [...], 'bpm': ..., 'manos_por_color': bool}
o por consola:   python video_piano.py video.mp4 salida.json
"""
import json
import sys

import numpy as np

ANCHO = 960  # escalamos el video a este ancho (88 teclas -> ~18 px por tecla blanca)
FPS = 30
# rangos de teclado comunes: (cantidad de teclas blancas, nota MIDI de la primera tecla blanca)
TECLADOS = {52: 21, 45: 28, 36: 36, 29: 36, 22: 48}
BLANCAS_EN_OCTAVA = [0, 2, 4, 5, 7, 9, 11]


def _ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def _cuadros(ruta, alto, recorte=None, fps=FPS):
    """Generador de cuadros RGB (numpy) escalados a ANCHO; recorte = (y0, y1) para leer solo esa franja."""
    import subprocess
    vf = f'fps={fps},scale={ANCHO}:{alto}'
    h = alto
    if recorte:
        vf += f',crop={ANCHO}:{recorte[1] - recorte[0]}:0:{recorte[0]}'
        h = recorte[1] - recorte[0]
    p = subprocess.Popen([_ffmpeg(), '-loglevel', 'quiet', '-i', str(ruta), '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                         stdout=subprocess.PIPE, stdin=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    n = ANCHO * h * 3
    try:
        while True:
            b = p.stdout.read(n)
            if len(b) < n:
                break
            yield np.frombuffer(b, np.uint8).reshape(h, ANCHO, 3)
    finally:
        p.kill()
        p.wait()


def _tamano(ruta):
    import imageio_ffmpeg
    gen = imageio_ffmpeg.read_frames(str(ruta))
    meta = next(gen)
    gen.close()
    w, h = meta['size']
    return int(round(h * ANCHO / w / 2) * 2), meta.get('duration') or 0


def _saturacion(rgb):
    rgb = rgb.astype(np.float32) / 255
    mx, mn = rgb.max(-1), rgb.min(-1)
    return np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0), mx


def _matiz(rgb):
    r, g, b = [rgb[..., i].astype(np.float32) / 255 for i in range(3)]
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4))
    return h * 60


def _tramos(fila, minimo=1, maximo=10_000):
    """Tramos True de una fila booleana -> [(inicio, ancho)]"""
    out, x, n = [], 0, len(fila)
    while x < n:
        if fila[x]:
            x0 = x
            while x < n and fila[x]:
                x += 1
            if minimo <= x - x0 <= maximo:
                out.append((x0, x - x0))
        x += 1
    return out


def detectar_teclado(ruta, alto, duracion):
    """Busca el teclado en una imagen 'promedio' del video (mediana de varios cuadros, sin teclas apretadas).
    Funciona con teclado completo o con un tramo con zoom (nombra las teclas por el dibujo de las negras)."""
    muestras = []
    for f in _cuadros(ruta, alto, fps=0.25):
        muestras.append(f)
        if len(muestras) >= 15:
            break
    if not muestras:
        return None
    med = np.median(np.stack(muestras), axis=0).astype(np.uint8)
    gris = med.mean(-1)
    oscuro, claro = gris < 90, gris > 170
    # franja de teclas negras: filas con muchas transiciones y mezcla de claro y oscuro
    ok = []
    for y in range(alto // 4, alto):
        fila = oscuro[y]
        ok.append(np.count_nonzero(fila[1:] != fila[:-1]) >= 24 and 0.2 < fila.mean() < 0.7 and claro[y].mean() > 0.25)
    mejor, ini_mejor, actual, ini = 0, 0, 0, 0
    for i, c in enumerate(ok):
        if c:
            ini = i if actual == 0 else ini
            actual += 1
            if actual > mejor:
                mejor, ini_mejor = actual, ini
        else:
            actual = 0
    if mejor < 8:
        return None
    yb0 = alto // 4 + ini_mejor
    yb1 = yb0 + mejor
    yw1 = yb1
    while yw1 + 1 < alto and claro[yw1 + 1].mean() > 0.5:
        yw1 += 1
    if yw1 - yb1 < 4:
        return None
    y_blanca = int(yb1 + (yw1 - yb1) * 0.3)
    # --- teclas negras (se detectan siempre bien: son anchas y oscuras) ---
    y_negra = int(yb0 + (yb1 - yb0) * 0.45)
    tramos = _tramos(oscuro[y_negra], 3, ANCHO // 20)
    if len(tramos) < 8:
        return None
    anchos_n = np.array([bw for _, bw in tramos])
    tipico = np.median(anchos_n)
    negras = [x0 + bw / 2 for x0, bw in tramos if 0.5 * tipico <= bw <= 1.6 * tipico]
    # las que tocan el borde del cuadro pueden estar cortadas: igual sirven de referencia
    gaps = np.diff(negras)
    # huecos chicos (dentro de un grupo) y grandes (Mi-Fa / Si-Do): dos grupos 1D
    a, b = gaps.min(), gaps.max()
    for _ in range(10):
        corte = (a + b) / 2
        chicos, grandes = gaps[gaps <= corte], gaps[gaps > corte]
        if not len(chicos) or not len(grandes):
            return None
        a, b = chicos.mean(), grandes.mean()
    corte = (a + b) / 2
    # grupos de negras consecutivas
    grupos = [[negras[0]]]
    for g, x in zip(gaps, negras[1:]):
        if g <= corte:
            grupos[-1].append(x)
        else:
            grupos.append([x])
    # período de octava = distancia entre grupos de 2 (Do#) consecutivos completos
    internos = grupos[1:-1] if len(grupos) > 2 else grupos
    dos = [g[0] for g in internos if len(g) == 2]
    tres = [g[0] for g in internos if len(g) == 3]
    periodos = [y - x for lista in (dos, tres) for x, y in zip(lista, lista[1:])]
    if not periodos:
        return None
    w = float(np.median(periodos)) / 7
    # índice de "borde entre blancas" para cada negra, relativo al primer Do# completo
    if not dos:
        return None
    ref = dos[0]
    OFF_EN_OCTAVA = {0: 1, 1: 2, 2: 4, 3: 5, 4: 6}   # Do#, Re#, Fa#, Sol#, La# -> borde (Do|Re=1 ... La|Si=6)
    pares_x, pares_k = [], []
    for g in grupos:
        for j, x in enumerate(g):
            octava_rel = int(np.floor((x - ref + w) / (7 * w)))   # Do# abre la octava; La# es la última
            base = ref + octava_rel * 7 * w
            # qué negra de la octava es, según su posición dentro de la octava
            pos = (x - base) / w + 1          # en unidades de blanca desde el Do
            k = min(OFF_EN_OCTAVA.values(), key=lambda v: abs(v - pos))
            pares_x.append(x)
            pares_k.append(octava_rel * 7 + k)
    pares_x, pares_k = np.array(pares_x), np.array(pares_k)
    # borde(k) = b0 + k*w; ajustamos b0 con todas las negras (cuadrados mínimos)
    b0 = float(np.median(pares_x - pares_k * w))
    # bordes del Do de la octava de referencia: Do ocupa [b0, b0+w]
    k_ini = int(np.floor((0 - b0) / w))
    k_fin = int(np.ceil((ANCHO - b0) / w))
    teclas = []
    blancas = {}
    for k in range(k_ini, k_fin):
        izq, der = b0 + k * w, b0 + (k + 1) * w
        visible = min(der, ANCHO) - max(izq, 0)
        if visible < 0.45 * w:
            continue
        oct_, idx = divmod(k, 7)
        m = 12 * (oct_ + 5) + BLANCAS_EN_OCTAVA[idx]   # octava provisoria (Do de referencia = Do4); se ajusta después
        blancas[k] = m
        teclas.append({'m': m, 'x': (max(izq, 0) + min(der, ANCHO)) / 2, 'negra': False})
    for x, k in zip(pares_x, pares_k):
        if k - 1 in blancas or k in blancas:
            m_izq = blancas.get(k - 1, (blancas.get(k) or 0) - 2)
            teclas.append({'m': m_izq + 1, 'x': float(x), 'negra': True})
    n_blancas = len(blancas)
    teclas.sort(key=lambda k: k['m'])
    completo = n_blancas == 52
    if completo:  # teclado de 88: la primera blanca es La0
        corr = 21 - teclas[0]['m']
        for k in teclas:
            k['m'] += corr
    return {'y_negra': y_negra, 'y_blanca': y_blanca, 'y_barra': max(0, yb0 - max(12, int(alto * 0.08))), 'yb0': yb0,
            'ancho_blanca': w, 'teclas': teclas, 'octava_segura': completo}


def notas_de_video(ruta, progreso=lambda msg, pct: None, corregir_octava=True):
    alto, duracion = _tamano(ruta)
    progreso('Buscando el teclado en el video…', 25)
    tec = detectar_teclado(ruta, alto, duracion)
    if not tec:
        return None
    y0 = max(0, tec['y_barra'] - 2)
    y1 = tec['y_blanca'] + 2
    filas = {'barra': tec['y_barra'] - y0, 'negra': tec['y_negra'] - y0, 'blanca': tec['y_blanca'] - y0}
    teclas = tec['teclas']
    xs = np.array([k['x'] for k in teclas])
    w = tec['ancho_blanca']
    # 5 puntos por columna (para que las letras blancas dentro de las barras no confundan)
    offs = np.array([-0.3, -0.15, 0, 0.15, 0.3])
    anchos = np.array([w * (0.5 if k['negra'] else 0.6) for k in teclas])
    cols = np.clip((xs[:, None] + offs[None, :] * anchos[:, None]).round().astype(int), 0, ANCHO - 1)
    fila_tecla = np.array([filas['negra'] if k['negra'] else filas['blanca'] for k in teclas])
    prendida, barra, matices, matices_barra = [], [], [], []
    total = max(1, int((duracion or 60) * FPS))
    for i, f in enumerate(_cuadros(ruta, alto, recorte=(y0, y1))):
        pix = f[fila_tecla[:, None], cols]                    # (teclas, 5, 3)
        sat, val = _saturacion(pix)
        on = ((sat > 0.25) & (val > 0.3)).sum(1) >= 1
        pb = f[filas['barra'], cols]
        sb, vb = _saturacion(pb)
        bon = ((sb > 0.35) & (vb > 0.3)).sum(1) >= 1
        mb = _matiz(pb)
        okb = (sb > 0.35) & (vb > 0.3)
        matices_barra.append(np.array([mb[j][okb[j]].mean() if okb[j].any() else np.nan for j in range(len(okb))]))
        prendida.append(on)
        barra.append(bon)
        mt = _matiz(pix).mean(1)
        matices.append(np.where(on, mt, np.nan))
        if i % 300 == 0:
            progreso(f'Leyendo el video: {i // FPS} s de {int(duracion or 0)} s…', 25 + int(55 * min(1, i / total)))
    P = np.array(prendida)   # (cuadros, teclas)
    B = np.array(barra)
    H = np.array(matices)
    HB = np.array(matices_barra)
    if P.size == 0:
        return None
    # Las notas salen de las BARRAS que caen (justo encima del teclado): tienen color pleno aunque la
    # nota sea cortísima, y entre dos notas iguales siempre hay un hueco. La tecla iluminada solo confirma
    # (así descartamos animaciones de la intro y carteles, que no iluminan teclas).
    n_cuadros = len(B)
    # demora entre que la barra pasa por la fila de muestreo y la tecla se ilumina
    demoras = []
    for k in range(len(teclas)):
        b, p = B[:, k], P[:, k]
        for u in np.where(b[1:] & ~b[:-1])[0][:40] + 1:
            prox = np.where(p[u:u + 60])[0]
            if len(prox):
                demoras.append(prox[0])
    demora = int(np.median(demoras)) if demoras else 1
    notas = []
    for k, tk in enumerate(teclas):
        b, p = B[:, k], P[:, k]
        # La TECLA dice cuándo empieza y termina cada nota: entre dos notas iguales se apaga 1 cuadro.
        # La BARRA confirma que de verdad cayó una nota (las animaciones de intro no tienen barra)
        # y da el color de la mano.
        u = 0
        while u < n_cuadros:
            if not p[u]:
                u += 1
                continue
            c = u
            while u < n_cuadros and p[u]:
                u += 1
            f2 = u
            if f2 - c < 2:
                continue  # destello de un cuadro
            a_ = c - demora
            ventana_b = b[max(0, a_ - 4):max(0, a_ + 5)]
            if not ventana_b.any():
                continue  # sin barra que caiga: no es una nota
            vb_ = HB[max(0, a_ - 2):max(1, a_ + min(f2 - c, 10)), k]
            hue = float(np.nanmedian(vb_)) if np.isfinite(vb_).any() else np.nan
            notas.append({'m': tk['m'], 'ini': c / FPS, 'fin': f2 / FPS, 'hue': hue})
    # animaciones (intro, final, carteles): muchas teclas que arrancan en el mismo cuadro
    from collections import Counter
    por_cuadro = Counter(round(n['ini'] * FPS) for n in notas)
    notas = [n for n in notas if por_cuadro[round(n['ini'] * FPS)] < 8]
    notas.sort(key=lambda n: (n['m'], n['ini']))
    limpias = []
    for n in notas:
        if limpias and limpias[-1]['m'] == n['m'] and n['ini'] - limpias[-1]['fin'] < 0.04 and n['ini'] - limpias[-1]['ini'] < 0.12:
            limpias[-1]['fin'] = max(limpias[-1]['fin'], n['fin'])
            continue
        limpias.append(n)
    notas = limpias
    if len(notas) < 8:
        return None
    # manos por color: dos grupos de matiz; el de notas más graves es la izquierda
    hues = np.array([n['hue'] for n in notas])
    validos = np.isfinite(hues)
    manos_por_color = False
    if validos.sum() > 10:
        ang = np.deg2rad(hues[validos])
        pts = np.stack([np.cos(ang), np.sin(ang)], 1)
        c1, c2 = pts[np.argmin(pts[:, 0])], pts[np.argmax(pts[:, 0])]
        for _ in range(20):
            g = np.linalg.norm(pts - c1, axis=1) > np.linalg.norm(pts - c2, axis=1)
            if g.all() or (~g).all():
                break
            c1, c2 = pts[~g].mean(0), pts[g].mean(0)
        sep = np.linalg.norm(c1 - c2)
        if sep > 0.5 and 0.05 < g.mean() < 0.95:
            manos_por_color = True
            alturas = np.array([n['m'] for n in notas])[validos]
            izq_es_g = alturas[g].mean() < alturas[~g].mean()
            idx = np.where(validos)[0]
            for j, i in enumerate(idx):
                notas[i]['mano'] = 'i' if (g[j] == izq_es_g) else 'd'
    if corregir_octava and not tec['octava_segura']:
        d = [n['m'] for n in notas if n.get('mano') == 'd']
        i = [n['m'] for n in notas if n.get('mano') == 'i']
        if d and i:
            md_, mi_ = float(np.median(d)), float(np.median(i))
            corr = min((12 * k for k in range(-3, 4)), key=lambda c: abs(md_ + c - 67) + abs(mi_ + c - 46))
        else:
            corr = 12 * round((62 - float(np.median([n['m'] for n in notas]))) / 12)
        for n in notas:
            n['m'] += corr
    for n in notas:
        n.setdefault('mano', 'd' if n['m'] >= 60 else 'i')
    # colores dudosos (teclas negras en tonos intermedios): una nota muy lejos del registro de su mano cambia de mano
    d = [n['m'] for n in notas if n['mano'] == 'd']
    i = [n['m'] for n in notas if n['mano'] == 'i']
    if d and i:
        medio = (float(np.median(d)) + float(np.median(i))) / 2
        for n in notas:
            if n['mano'] == 'd' and n['m'] < medio - 6:
                n['mano'] = 'i'
            elif n['mano'] == 'i' and n['m'] > medio + 6:
                n['mano'] = 'd'
    notas.sort(key=lambda n: (n['ini'], n['m']))
    return {'notas': notas, 'manos_por_color': manos_por_color, 'teclado': len(teclas), 'octava_segura': tec['octava_segura']}


if __name__ == '__main__':
    r = notas_de_video(sys.argv[1], lambda m, p: print(p, m))
    json.dump(r, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
    print('notas:', len(r['notas']) if r else None)
