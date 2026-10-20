"""三道 Sandō — servidor local del juego.

Sirve la web (carpeta web/), guarda la partida en datos/partida.json y hace de
puente hacia la IA local: primero Qwen (EXL3, :8888), si no Ollama (:11434).
Solo stdlib. Uso:  python server.py [--puerto 8770] [--no-abrir]
"""
import base64
import difflib
import json
import mimetypes
import subprocess
import uuid
import os
import re
import shutil
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
WEB = RAIZ / 'web'
DATOS = RAIZ / 'datos'
PARTIDA = DATOS / 'partida.json'
PUERTO = 8770

BACKENDS = [
    {'nombre': 'Qwen local (EXL3)', 'base': 'http://127.0.0.1:8888/v1',
     'extra': {'chat_template_kwargs': {'enable_thinking': False}}},
    {'nombre': 'Ollama', 'base': 'http://127.0.0.1:11434/v1',
     'extra': {'reasoning_effort': 'low'}, 'preferidos': ['gpt-oss:20b', 'qwen', 'gemma', 'llama']},
]
# Versión del código con la que arrancó el servidor: iniciar.pyw la compara con la de los archivos
# actuales y, si cambiaron (ej: después de un git pull), reinicia el servidor.
def version_codigo():
    archivos = [Path(__file__).resolve(), *sorted((Path(__file__).resolve().parent / 'herramientas').glob('*.py'))]
    return str(int(sum(f.stat().st_mtime for f in archivos if f.exists())))


VERSION = version_codigo()
_cache_modelos = {}  # base -> (instante, id_modelo | None)
_lock_partida = threading.Lock()
_locks_partitura = {}  # clave -> Lock (que dos pedidos iguales no generen la misma partitura a la vez)
VENV_PY = RAIZ / 'venv' / 'Scripts' / 'python.exe'
IMPORTAR = RAIZ / 'herramientas' / 'importar.py'
SUBTITULOS = RAIZ / 'herramientas' / 'subtitulos.py'
EXT_OK = {'.mid', '.midi', '.musicxml', '.xml', '.mxl', '.pdf', '.png', '.jpg', '.jpeg', '.webp',
          '.mp3', '.wav', '.m4a', '.ogg', '.flac', '.webm', '.opus', '.aac'}


def carpeta(nombre):
    c = DATOS / nombre
    c.mkdir(parents=True, exist_ok=True)
    return c


def id_valido(x):
    return isinstance(x, str) and re.fullmatch(r'[0-9a-f]{12}', x) is not None


def importar_en_fondo(job, url=None, archivo=None, titulo='', nombre=''):
    """Corre herramientas/importar.py en el venv y guarda la canción resultante."""
    prog = carpeta('trabajos') / f'{job}.json'
    salida = carpeta('trabajos') / f'{job}.salida.json'
    cmd = [str(VENV_PY), '-I', str(IMPORTAR), '--salida', str(salida), '--progreso', str(prog), '--titulo', titulo or '']
    cmd += ['--url', url] if url else ['--archivo', str(archivo), '--nombre', Path(nombre).stem]
    try:
        subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), timeout=3600)
    except Exception as e:
        prog.write_text(json.dumps({'estado': 'error', 'pct': 100, 'mensaje': str(e)}, ensure_ascii=False), encoding='utf-8')
    if salida.exists():
        datos = json.loads(salida.read_text(encoding='utf-8'))
        datos.update({'id': job, 'creado': time.strftime('%Y-%m-%d'), 'origen': url or (archivo.name if archivo else '')})
        (carpeta('canciones') / f'{job}.json').write_text(json.dumps(datos, ensure_ascii=False), encoding='utf-8')
        salida.unlink()
        estado = json.loads(prog.read_text(encoding='utf-8'))
        estado['cancion'] = job
        prog.write_text(json.dumps(estado, ensure_ascii=False), encoding='utf-8')


def resumen_cancion(d):
    return {'id': d.get('id'), 'titulo': d.get('titulo'), 'fuente': d.get('fuente'), 'notas': len(d.get('notas', [])),
            'tarea': d.get('tarea'), 'creado': d.get('creado'), 'aproximada': d.get('aproximada', False)}

# ---------- 映画館 Cine: videos con subtítulos japoneses analizados por la IA ----------
_lock_cine = threading.Lock()
_analizando = set()   # ids con un análisis corriendo
_prioridad = {}       # id -> línea por donde está mirando (se analiza primero lo que viene)
LOTE = 6


def video_cine(vid):
    return carpeta('cine') / f'{vid}.json'


def leer_cine(vid):
    return json.loads(video_cine(vid).read_text(encoding='utf-8'))


def escribir_cine(vid, datos):
    f = video_cine(vid)
    tmp = f.with_suffix('.tmp')
    tmp.write_text(json.dumps(datos, ensure_ascii=False), encoding='utf-8')
    tmp.replace(f)


def actualizar_cine(vid, cambio):
    """Lee, aplica `cambio(datos)` y guarda, sin pisar lo que escribió otro hilo."""
    with _lock_cine:
        d = leer_cine(vid)
        cambio(d)
        escribir_cine(vid, d)
        return d


def resumen_cine(d):
    lineas = d.get('lineas', [])
    return {'id': d.get('id'), 'titulo': d.get('titulo'), 'video': d.get('video'), 'canal': d.get('canal'),
            'duracion': d.get('duracion'), 'creado': d.get('creado'), 'estado': d.get('estado'), 'mensaje': d.get('mensaje'),
            'lineas': len(lineas), 'analizadas': sum(1 for x in lineas if x.get('toks')), 'visto': d.get('visto', 0)}


def id_youtube(url):
    m = re.search(r'(?:v=|youtu\.be/|shorts/|embed/|live/)([\w-]{11})', url or '')
    return m.group(1) if m else None


def bajar_subtitulos(vid, url):
    salida = carpeta('trabajos') / f'{vid}.subs.json'
    try:
        subprocess.run([str(VENV_PY), '-I', str(SUBTITULOS), '--url', url, '--salida', str(salida)],
                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), timeout=300)
        res = json.loads(salida.read_text(encoding='utf-8'))
        salida.unlink()
    except Exception as e:
        res = {'error': f'no pude bajar los subtítulos: {e}'}
    if res.get('error') or not res.get('lineas'):
        msg = res.get('error') or 'El video no trae subtítulos en japonés.'
        actualizar_cine(vid, lambda d: d.update(estado='error', mensaje=msg))
        return
    actualizar_cine(vid, lambda d: d.update({k: v for k, v in res.items() if k != 'idioma'}, estado='listo', mensaje=''))
    analizar_cine(vid)


def _parecido(a, b):
    a, b = re.sub(r'\s', '', a), re.sub(r'\s', '', b)
    return difflib.SequenceMatcher(None, a, b).ratio() if a and b else 0


def analizar_lote(d, idx):
    """Pide a la IA tokens (lectura + significado en contexto) y traducción para las líneas idx."""
    lineas = d['lineas']
    previas = ' / '.join(lineas[j]['t'] for j in range(max(0, idx[0] - 3), idx[0]))
    lista = '\n'.join(f'{n + 1}. {lineas[i]["t"]}' for n, i in enumerate(idx))
    pedido = f"""Analizá estos subtítulos del video japonés «{d.get('titulo', '')}».
Para cada línea: separala en tokens (palabras y partículas; un verbo o adjetivo conjugado va junto con su terminación, ej. 食べました).
Cada token: t = el texto exacto, r = lectura en hiragana, s = significado corto en castellano rioplatense SEGÚN EL CONTEXTO de esa oración, b = forma de diccionario (solo si t está conjugado).
La puntuación y los símbolos van como token con s vacío. Para la partícula は usá r:"わ"; para へ, r:"え".
Además traducí cada línea completa al castellano natural (es). Los t de cada línea, juntos, tienen que reproducir la línea exacta.
{('Contexto anterior: ' + previas) if previas else ''}
Líneas:
{lista}
Formato exacto: {{"lineas":[{{"n":1,"toks":[{{"t":"食べました","r":"たべました","s":"comí","b":"食べる"}},{{"t":"。","r":"。","s":""}}],"es":"Comí."}}]}}"""
    r = preguntar_ia([{'role': 'system', 'content': 'Sos un profesor de japonés para hispanohablantes. Respondés SOLO JSON válido.'},
                      {'role': 'user', 'content': pedido}], quiere_json=True, temperatura=0.2, max_tokens=3500)
    if not r.get('ok'):
        return None
    hechas = {}
    for item in (r['json'] or {}).get('lineas') or []:
        try:
            i = idx[int(item.get('n')) - 1]
        except (TypeError, ValueError, IndexError):
            continue
        toks = []
        for x in item.get('toks') or []:
            if not isinstance(x, dict) or not str(x.get('t', '')):
                continue
            tok = {'t': str(x['t']), 'r': str(x.get('r') or x['t']), 's': str(x.get('s') or '')}
            if x.get('b') and x.get('b') != x['t']:
                tok['b'] = str(x['b'])
            toks.append(tok)
        if toks and _parecido(''.join(t['t'] for t in toks), lineas[i]['t']) >= 0.85:
            hechas[i] = {'toks': toks, 'es_ia': str(item.get('es') or '')}
    return hechas


def analizar_cine(vid):
    with _lock_cine:
        if vid in _analizando:
            return
        _analizando.add(vid)
    try:
        fallos = 0
        while True:
            d = leer_cine(vid)
            faltan = [i for i, ln in enumerate(d['lineas']) if not ln.get('toks') and not ln.get('sin_analisis')]
            if not faltan:
                break
            desde = _prioridad.get(vid, 0)
            faltan.sort(key=lambda i: (i < desde, i))  # primero lo que viene desde donde está mirando
            idx = sorted(faltan[:LOTE])
            hechas = analizar_lote(d, idx)
            if hechas is None:  # IA apagada: queda para cuando vuelva
                break
            fallos = 0 if hechas else fallos + 1
            rendirse = fallos >= 2  # dos intentos sin nada útil: esas líneas quedan con el diccionario

            def aplicar(dd):
                for i in idx:
                    if i in hechas:
                        dd['lineas'][i]['toks'] = hechas[i]['toks']
                        if hechas[i]['es_ia'] and not dd['lineas'][i].get('es'):
                            dd['lineas'][i]['es'] = hechas[i]['es_ia']
                    elif rendirse:
                        dd['lineas'][i]['sin_analisis'] = True
            actualizar_cine(vid, aplicar)
            if rendirse:
                fallos = 0
    finally:
        with _lock_cine:
            _analizando.discard(vid)


mimetypes.add_type('text/javascript', '.js')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/manifest+json', '.webmanifest')


def _get_json(url, timeout=2.5):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


def modelo_de(backend):
    """Devuelve el id de modelo disponible en ese backend (o None). Cachea 20 s."""
    base = backend['base']
    hit = _cache_modelos.get(base)
    if hit and time.time() - hit[0] < 20:
        return hit[1]
    modelo = None
    try:
        ids = [m.get('id') for m in _get_json(base + '/models').get('data', [])]
        ids = [i for i in ids if i and 'minilm' not in i and 'embed' not in i]
        for pref in backend.get('preferidos', []):
            match = [i for i in ids if i.startswith(pref)]
            if match:
                modelo = match[0]
                break
        if not modelo and ids:
            modelo = ids[0]
    except Exception:
        modelo = None
    _cache_modelos[base] = (time.time(), modelo)
    return modelo


def limpiar(texto):
    texto = re.sub(r'<think>.*?</think>', '', texto or '', flags=re.S)
    if '</think>' in texto:
        texto = texto.split('</think>', 1)[1]
    return texto.strip()


def extraer_json(texto):
    """Saca el primer objeto JSON de la respuesta (tolera ```json ... ```)."""
    texto = limpiar(texto)
    m = re.search(r'```(?:json)?\s*(.*?)```', texto, re.S)
    if m:
        texto = m.group(1)
    ini = texto.find('{')
    if ini < 0:
        return None
    prof = 0
    en_str = esc = False
    for i in range(ini, len(texto)):
        c = texto[i]
        if en_str:
            if esc:
                esc = False
            elif c == '\\':
                esc = True
            elif c == '"':
                en_str = False
        elif c == '"':
            en_str = True
        elif c == '{':
            prof += 1
        elif c == '}':
            prof -= 1
            if prof == 0:
                try:
                    return json.loads(texto[ini:i + 1])
                except json.JSONDecodeError:
                    return None
    return None


def preguntar_ia(mensajes, quiere_json=False, temperatura=0.7, max_tokens=900):
    errores = []
    for b in BACKENDS:
        modelo = modelo_de(b)
        if not modelo:
            errores.append(f"{b['nombre']}: apagado")
            continue
        cuerpo = {'model': modelo, 'messages': mensajes, 'temperature': temperatura,
                  'max_tokens': max_tokens, 'stream': False, **b['extra']}
        req = urllib.request.Request(b['base'] + '/chat/completions', method='POST',
                                     data=json.dumps(cuerpo).encode('utf-8'),
                                     headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                resp = json.loads(r.read().decode('utf-8'))
            texto = resp['choices'][0]['message'].get('content') or ''
            salida = {'ok': True, 'backend': b['nombre'], 'modelo': modelo, 'texto': limpiar(texto)}
            if quiere_json:
                salida['json'] = extraer_json(texto)
                if salida['json'] is None:
                    errores.append(f"{b['nombre']}: respuesta sin JSON")
                    continue
            return salida
        except (urllib.error.URLError, TimeoutError, KeyError, ValueError) as e:
            _cache_modelos.pop(b['base'], None)
            errores.append(f"{b['nombre']}: {e}")
    return {'ok': False, 'error': '; '.join(errores) or 'sin IA'}


class Manejador(BaseHTTPRequestHandler):
    server_version = 'Sando/1.0'

    def log_message(self, fmt, *args):  # silencioso
        pass

    def _responder(self, codigo, cuerpo, tipo='application/json; charset=utf-8', extra=None):
        if isinstance(cuerpo, (dict, list)):
            cuerpo = json.dumps(cuerpo, ensure_ascii=False).encode('utf-8')
        self.send_response(codigo)
        self.send_header('Content-Type', tipo)
        self.send_header('Content-Length', str(len(cuerpo)))
        self.send_header('Cache-Control', 'no-cache')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(cuerpo)

    def _leer_json(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n > 80_000_000:
            raise ValueError('demasiado grande')
        return json.loads(self.rfile.read(n).decode('utf-8') or '{}')

    def _mismo_origen(self):
        # Solo aceptamos POST desde la propia página (evita que otra web toque la partida o la IA).
        origen = self.headers.get('Origin')
        return origen is None or origen in (f'http://127.0.0.1:{PUERTO}', f'http://localhost:{PUERTO}')

    def do_GET(self):
        ruta = self.path.split('?', 1)[0]
        if ruta == '/api/partida':
            if PARTIDA.exists():
                return self._responder(200, PARTIDA.read_bytes())
            return self._responder(200, {})
        if ruta == '/api/canciones':
            lista = []
            for f in sorted(carpeta('canciones').glob('*.json'), key=lambda x: x.stat().st_mtime, reverse=True):
                try:
                    lista.append(resumen_cancion(json.loads(f.read_text(encoding='utf-8'))))
                except Exception:
                    pass
            return self._responder(200, lista)
        if ruta == '/api/partitura':
            q = dict(x.split('=', 1) for x in (self.path.split('?', 1)[1:] or [''])[0].split('&') if '=' in x)
            if not id_valido(q.get('id')):
                return self._responder(400, {'error': 'id inválido'})
            ancho = max(800, min(4000, int(q.get('ancho', '2200') or 2200) // 100 * 100))
            fuente = carpeta('canciones') / f"{q['id']}.json"
            if not fuente.exists():
                return self._responder(404, {'error': 'no existe'})
            cache = carpeta('partituras') / f"{q['id']}-{ancho}.json"
            if not cache.exists() or cache.stat().st_mtime < fuente.stat().st_mtime:
                try:
                    subprocess.run([str(VENV_PY), '-I', str(RAIZ / 'herramientas' / 'partitura.py'), str(fuente), str(cache), str(ancho)],
                                   stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), timeout=180, check=True)
                except Exception as e:
                    return self._responder(500, {'error': f'no pude grabar la partitura: {e}'})
            return self._responder(200, cache.read_bytes())
        if ruta in ('/api/cancion', '/api/trabajo'):
            q = dict(x.split('=', 1) for x in (self.path.split('?', 1)[1:] or [''])[0].split('&') if '=' in x)
            if not id_valido(q.get('id')):
                return self._responder(400, {'error': 'id inválido'})
            f = carpeta('canciones' if ruta == '/api/cancion' else 'trabajos') / f"{q['id']}.json"
            if not f.exists():
                return self._responder(404, {'error': 'no existe'})
            return self._responder(200, f.read_bytes())
        if ruta == '/api/cine':
            lista = []
            for f in sorted(carpeta('cine').glob('*.json'), key=lambda x: x.stat().st_mtime, reverse=True):
                try:
                    lista.append(resumen_cine(json.loads(f.read_text(encoding='utf-8'))))
                except Exception:
                    pass
            return self._responder(200, lista)
        if ruta == '/api/cine/video':
            q = dict(x.split('=', 1) for x in (self.path.split('?', 1)[1:] or [''])[0].split('&') if '=' in x)
            if not id_valido(q.get('id')) or not video_cine(q['id']).exists():
                return self._responder(404, {'error': 'no existe'})
            d = leer_cine(q['id'])
            d['analizando'] = q['id'] in _analizando
            return self._responder(200, d)
        if ruta == '/api/version':
            return self._responder(200, {'version': VERSION})
        if ruta == '/api/ia/estado':
            for b in BACKENDS:
                m = modelo_de(b)
                if m:
                    return self._responder(200, {'ok': True, 'backend': b['nombre'], 'modelo': m})
            return self._responder(200, {'ok': False})
        if ruta == '/':
            ruta = '/index.html'
        archivo = (WEB / ruta.lstrip('/')).resolve()
        if WEB not in archivo.parents or not archivo.is_file():
            return self._responder(404, {'error': 'no existe'})
        tipo = mimetypes.guess_type(str(archivo))[0] or 'application/octet-stream'
        if tipo.startswith('text/') or tipo.endswith('javascript'):
            tipo += '; charset=utf-8'
        self._responder(200, archivo.read_bytes(), tipo)

    def do_POST(self):
        if not self._mismo_origen():
            return self._responder(403, {'error': 'origen no permitido'})
        ruta = self.path.split('?', 1)[0]
        try:
            datos = self._leer_json()
        except Exception as e:
            return self._responder(400, {'error': str(e)})
        if ruta == '/api/apagar':
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return self._responder(200, {'ok': True})
        if ruta == '/api/partida':
            with _lock_partida:
                DATOS.mkdir(exist_ok=True)
                if PARTIDA.exists():  # respaldo diario
                    resp = DATOS / f"partida-{time.strftime('%Y%m%d')}.json"
                    if not resp.exists():
                        shutil.copy2(PARTIDA, resp)
                tmp = PARTIDA.with_suffix('.tmp')
                tmp.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding='utf-8')
                tmp.replace(PARTIDA)
            return self._responder(200, {'ok': True})
        if ruta == '/api/partitura':
            # cualquier canción (también las clásicas del juego): se cachea por contenido
            import hashlib
            cancion = {k: datos.get(k) for k in ('titulo', 'bpm', 'compas', 'compas_txt', 'paso', 'notas', 'aproximada')}
            if not isinstance(cancion['notas'], list) or not cancion['notas']:
                return self._responder(400, {'error': 'faltan notas'})
            ancho = max(800, min(4000, int(datos.get('ancho') or 2200) // 100 * 100))
            clave = hashlib.sha1(json.dumps(cancion, sort_keys=True).encode()).hexdigest()[:16]
            cache = carpeta('partituras') / f'{clave}-{ancho}.json'
            with _lock_partida:
                candado = _locks_partitura.setdefault(f'{clave}-{ancho}', threading.Lock())
            with candado:
                if not cache.exists():
                    fuente = carpeta('partituras') / f'{clave}.cancion.json'
                    fuente.write_text(json.dumps(cancion, ensure_ascii=False), encoding='utf-8')
                    try:
                        subprocess.run([str(VENV_PY), '-I', str(RAIZ / 'herramientas' / 'partitura.py'), str(fuente), str(cache), str(ancho)],
                                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), timeout=180, check=True)
                    except Exception as e:
                        return self._responder(500, {'error': f'no pude grabar la partitura: {e}'})
            return self._responder(200, cache.read_bytes())
        if ruta == '/api/importar':
            if not VENV_PY.exists():
                return self._responder(500, {'error': 'Falta el entorno L:\\Sando\\venv'})
            job = uuid.uuid4().hex[:12]
            url = (datos.get('url') or '').strip()
            archivo = None
            if url:
                if not re.match(r'https?://', url):
                    return self._responder(400, {'error': 'link inválido'})
            else:
                ext = Path(datos.get('nombre') or '').suffix.lower()
                if ext not in EXT_OK or not datos.get('datos'):
                    return self._responder(400, {'error': f'formato no soportado: {ext or "?"}'})
                archivo = carpeta('subidas') / f'{job}{ext}'
                archivo.write_bytes(base64.b64decode(datos['datos']))
            (carpeta('trabajos') / f'{job}.json').write_text(json.dumps({'estado': 'trabajando', 'pct': 1, 'mensaje': 'En cola…'}), encoding='utf-8')
            threading.Thread(target=importar_en_fondo, args=(job, url or None, archivo, datos.get('titulo', ''), datos.get('nombre', '')), daemon=True).start()
            return self._responder(200, {'id': job})
        if ruta == '/api/cancion':
            if not id_valido(datos.get('id')):
                return self._responder(400, {'error': 'id inválido'})
            f = carpeta('canciones') / f"{datos['id']}.json"
            if not f.exists():
                return self._responder(404, {'error': 'no existe'})
            actual = json.loads(f.read_text(encoding='utf-8'))
            for k in ('titulo', 'notas', 'tarea', 'bpm', 'compas'):
                if k in datos:
                    actual[k] = datos[k]
            f.write_text(json.dumps(actual, ensure_ascii=False), encoding='utf-8')
            return self._responder(200, {'ok': True})
        if ruta == '/api/cancion_borrar':
            if not id_valido(datos.get('id')):
                return self._responder(400, {'error': 'id inválido'})
            f = carpeta('canciones') / f"{datos['id']}.json"
            if f.exists():
                papelera = carpeta('papelera')
                shutil.move(str(f), str(papelera / f.name))
            return self._responder(200, {'ok': True})
        if ruta == '/api/cine/importar':
            url = (datos.get('url') or '').strip()
            video = id_youtube(url)
            texto = datos.get('texto')
            if not video and not texto:
                return self._responder(400, {'error': 'Pegá un link de YouTube (o subí un archivo de subtítulos).'})
            vid = uuid.uuid4().hex[:12]
            base = {'id': vid, 'video': video, 'titulo': datos.get('titulo') or 'Video', 'canal': '', 'creado': time.strftime('%Y-%m-%d'),
                    'origen': url, 'lineas': [], 'visto': 0}
            if texto:
                sys.path.insert(0, str(RAIZ / 'herramientas'))
                try:
                    import subtitulos
                    lineas = subtitulos.leer_archivo(datos.get('nombre') or '', texto)
                except Exception as e:
                    return self._responder(400, {'error': f'no pude leer los subtítulos: {e}'})
                finally:
                    sys.path.pop(0)
                if not lineas:
                    return self._responder(400, {'error': 'El archivo no tiene subtítulos que pueda leer (.srt / .vtt).'})
                base.update(titulo=datos.get('titulo') or Path(datos.get('nombre') or 'Video').stem, lineas=lineas, estado='listo', mensaje='')
                with _lock_cine:
                    escribir_cine(vid, base)
                threading.Thread(target=analizar_cine, args=(vid,), daemon=True).start()
                return self._responder(200, {'id': vid})
            if not VENV_PY.exists():
                return self._responder(500, {'error': 'Falta el entorno L:\\Sando\\venv (con yt-dlp). Podés subir un .srt/.vtt.'})
            base.update(estado='bajando', mensaje='Buscando los subtítulos japoneses…')
            with _lock_cine:
                escribir_cine(vid, base)
            threading.Thread(target=bajar_subtitulos, args=(vid, url), daemon=True).start()
            return self._responder(200, {'id': vid})
        if ruta in ('/api/cine/analizar', '/api/cine/visto', '/api/cine/borrar'):
            vid = datos.get('id')
            if not id_valido(vid) or not video_cine(vid).exists():
                return self._responder(404, {'error': 'no existe'})
            if ruta == '/api/cine/borrar':
                shutil.move(str(video_cine(vid)), str(carpeta('papelera') / f'cine-{vid}.json'))
                return self._responder(200, {'ok': True})
            linea = int(datos.get('linea') or 0)
            _prioridad[vid] = linea
            if ruta == '/api/cine/visto':
                actualizar_cine(vid, lambda d: d.update(visto=max(d.get('visto', 0), linea)))
            elif vid not in _analizando:
                if datos.get('reintentar'):
                    actualizar_cine(vid, lambda d: [ln.pop('sin_analisis', None) for ln in d['lineas']])
                threading.Thread(target=analizar_cine, args=(vid,), daemon=True).start()
            return self._responder(200, {'ok': True})
        if ruta == '/api/ia':
            msgs = datos.get('mensajes') or []
            if not msgs:
                return self._responder(400, {'error': 'faltan mensajes'})
            r = preguntar_ia(msgs, bool(datos.get('json')), float(datos.get('temperatura', 0.7)),
                             int(datos.get('max_tokens', 900)))
            return self._responder(200, r)
        self._responder(404, {'error': 'ruta desconocida'})


def avisar(txt):
    # con pythonw no hay consola (stdout es None); en consolas cp1252 los kanji fallan
    if sys.stdout:
        try:
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
            print(txt, flush=True)
        except Exception:
            pass


def main():
    global PUERTO
    args = sys.argv[1:]
    if os.environ.get('PORT', '').isdigit():
        PUERTO = int(os.environ['PORT'])
    if '--datos' in args:  # carpeta de partida alternativa (para pruebas)
        global DATOS, PARTIDA
        DATOS = Path(args[args.index('--datos') + 1]).resolve()
        PARTIDA = DATOS / 'partida.json'
    if '--puerto' in args:
        PUERTO = int(args[args.index('--puerto') + 1])
    try:
        srv = ThreadingHTTPServer(('127.0.0.1', PUERTO), Manejador)
    except OSError:
        avisar(f'Ya hay algo en el puerto {PUERTO}; abro el navegador igual.')
        srv = None
    url = f'http://127.0.0.1:{PUERTO}/'
    if '--no-abrir' not in args:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    if srv:
        avisar(f'三道 Sandō en {url}')
        srv.serve_forever()
        srv.server_close()


if __name__ == '__main__':
    main()
