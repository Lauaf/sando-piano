"""Abre 三道 Sandō: levanta el servidor (si no está corriendo) y abre una ventana de Edge en modo app."""
import os
import socket
import subprocess
import sys
import time
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
