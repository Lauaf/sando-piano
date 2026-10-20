"""Abre 三道 Sandō: levanta el servidor (si no está corriendo) y abre una ventana de Edge en modo app."""
import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
PUERTO = 8770
URL = f'http://127.0.0.1:{PUERTO}/'


def escuchando():
    try:
        with socket.create_connection(('127.0.0.1', PUERTO), timeout=0.3):
            return True
    except OSError:
        return False


def servidor_viejo():
    """True si el servidor que está corriendo arrancó con otra versión del código (ej: antes de un git pull)."""
    sys.path.insert(0, str(RAIZ))
    try:
        from server import version_codigo
        with urllib.request.urlopen(URL + 'api/version', timeout=2) as r:
            return json.loads(r.read().decode('utf-8')).get('version') != version_codigo()
    except Exception:
        return True  # sin /api/version: es anterior a esta función


if escuchando() and servidor_viejo():
    try:
        urllib.request.urlopen(urllib.request.Request(URL + 'api/apagar', data=b'{}', method='POST',
                                                      headers={'Content-Type': 'application/json'}), timeout=2)
    except Exception:
        pass
    for _ in range(30):
        if not escuchando():
            break
        time.sleep(0.1)
    if escuchando() and os.name == 'nt':  # servidores viejos no tienen /api/apagar: cerramos el proceso del puerto
        sin_ventana = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
        salida = subprocess.run(['netstat', '-ano', '-p', 'TCP'], capture_output=True, text=True, creationflags=sin_ventana).stdout
        for fila in salida.splitlines():
            partes = fila.split()
            if len(partes) >= 5 and partes[1].endswith(f':{PUERTO}') and partes[3].upper() in ('LISTENING', 'ESCUCHANDO'):
                subprocess.run(['taskkill', '/PID', partes[4], '/F'], capture_output=True, creationflags=sin_ventana)
        for _ in range(30):
            if not escuchando():
                break
            time.sleep(0.1)

if not escuchando():
    pythonw = Path(sys.executable).with_name('pythonw.exe')
    subprocess.Popen([str(pythonw if pythonw.exists() else sys.executable), str(RAIZ / 'server.py'), '--no-abrir'],
                     cwd=RAIZ, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP)
    for _ in range(50):
        if escuchando():
            break
        time.sleep(0.1)

edge = None
for base in (os.environ.get('ProgramFiles(x86)', ''), os.environ.get('ProgramFiles', ''), os.environ.get('LOCALAPPDATA', '')):
    cand = Path(base) / 'Microsoft' / 'Edge' / 'Application' / 'msedge.exe'
    if base and cand.exists():
        edge = cand
        break
if edge:
    subprocess.Popen([str(edge), f'--app={URL}', '--window-size=1280,880'])
else:
    import webbrowser
    webbrowser.open(URL)
