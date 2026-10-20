"""三道 Sandō — servidor local del juego.

Sirve la web (carpeta web/), guarda la partida en datos/partida.json y hace de
puente hacia la IA local: primero Qwen (EXL3, :8888), si no Ollama (:11434).
Solo stdlib. Uso:  python server.py [--puerto 8770] [--no-abrir]
"""
import base64
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
_cache_modelos = {}  # base -> (instante, id_modelo | None)
_lock_partida = threading.Lock()
_locks_partitura = {}  # clave -> Lock (que dos pedidos iguales no generen la misma partitura a la vez)
VENV_PY = RAIZ / 'venv' / 'Scripts' / 'python.exe'
IMPORTAR = RAIZ / 'herramientas' / 'importar.py'
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

mimetypes.add_type('text/javascript', '.js')
mimetypes.add_type('text/css', '.css')


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


if __name__ == '__main__':
    main()
