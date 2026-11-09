# 音楽堂 Sandō · Piano

La sala de música de Rin: practicar piano con el teclado de la compu, un piano digital por USB (MIDI) o el micrófono si tenés piano acústico.

| | |
|---|---|
| 🎼 **Lectura de notas** | Las notas avanzan por el pentagrama: tocalas antes de que lleguen. Clave de sol y de fa. |
| 🎹 **Canciones y tarea** | Clásicas incluidas y las tuyas (YouTube, partituras, MuseScore), con digitación, manos separadas y bucle. |
| 👂 **Oído** | Repetí notas, reconocé intervalos y acordes mayores/menores. |
| 🎶 **Acordes** | Do, Fa, Sol, Lam… y las progresiones que suenan en todas partes. |
| ⏱️ **Práctica real** | Metrónomo, cronómetro y registro de lo que practicás en tu piano. |

Teclado de la compu: `A`=Do, `W`=Do#, `S`=Re, `E`=Re#, `D`=Mi, `F`=Fa…

## Cómo correrla

Necesitás Python 3 (solo la biblioteca estándar).

```bash
python server.py            # abre http://127.0.0.1:8773 en el navegador
python server.py --no-abrir --puerto 8773
```

En Windows, `iniciar.pyw` levanta el servidor (o lo reinicia si el código cambió) y abre la app en una ventana de Edge. Cada senda usa su propio puerto, así que podés tener varias abiertas a la vez.

### Controles

Todo se puede usar con mouse, con el teclado (flechas para moverse entre opciones, Enter para elegir, Esc o X para volver) o con un joystick (A elegir, B volver). Arriba: tu nivel y progreso (clic en el nombre), las misiones del día y las opciones.

### Importar canciones y ver partituras (opcional)

Importar canciones propias y dibujar las partituras usa scripts de Python con bibliotecas pesadas, en un entorno virtual en `venv/` dentro de la carpeta de la app (el servidor lo busca en `venv/Scripts/python.exe`, la ruta de Windows):

```bash
python -m venv venv
venv/Scripts/pip install music21 verovio yt-dlp basic-pitch librosa numpy imageio-ffmpeg pymupdf oemer onnxruntime
```

Sin ese entorno la sala funciona igual con las canciones incluidas.

## Partida y respaldo

El progreso (nivel, racha, misiones del día, logros) se guarda solo en `datos/partida.json` (con una copia por día) y en el navegador. Desde **⚙ Opciones** podés exportar un respaldo y restaurarlo.

Como usa el mismo formato que [Sandō](https://github.com/Lauaf/Sando), podés exportar tu partida desde Sandō y restaurarla acá para seguir con el mismo progreso.

## IA local (opcional)

Si hay un modelo local corriendo, Rin te arma un plan de práctica para hoy según lo que venís registrando. Primero se prueba Qwen (EXL3, puerto 8888) y después Ollama (puerto 11434).

## Relación con Sandō

Esta app es una de las sendas de [Sandō](https://github.com/Lauaf/Sando), el pueblo pixel art donde se practica japonés, piano y café, separada para usarla sola. Es una copia independiente: conserva el historial de commits de sus archivos y desde acá evoluciona por su cuenta.

## Estructura

```
server.py              servidor local: archivos, partida y puente a la IA, canciones y partituras
iniciar.pyw            lanzador para Windows
web/
  index.html, estilo.css
  js/app.js            arranque de la app
  js/perfil.js         mi progreso: nivel, misiones, últimas dos semanas y logros
  js/progreso.js       XP, niveles, racha, misiones, logros, repaso espaciado y guardado
  js/actividad.js      pantallas (pila con Esc para volver, navegación con flechas)
  js/opciones.js       opciones y respaldo
  js/dialogo.js, js/jp/texto.js, js/ia.js, js/mando.js, js/util.js   piezas compartidas
  js/piano.js          la sala de música
  js/piano/            entrada (teclado, MIDI, micrófono), vistas, canciones y digitación
  js/datos/canciones.js  canciones clásicas incluidas
herramientas/          importar canciones (YouTube, audio, MIDI, MusicXML, PDF/fotos) y grabar partituras
partituras/            MusicXML de Beyer 8 y 9 y del tema de Kass (generados con herramientas/)
```

No hay paso de build ni dependencias de npm: la app son módulos ES servidos tal cual.
