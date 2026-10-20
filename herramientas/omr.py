"""Lectura óptica de partituras con oemer, usando la GPU si se puede.

Uso: python omr.py <imagen> <carpeta_salida>
- Precarga las DLL de CUDA/cuDNN que vienen por pip (onnxruntime-gpu[cuda,cudnn]).
- Si la GPU falla (sin memoria porque la IA local la está usando, driver, etc.) repite en CPU.
Los modelos de oemer fueron corregidos (pads negativos -> output_padding) para que corran
con onnxruntime moderno; los originales quedaron como model.onnx.orig.
"""
import os
import sys


def correr(img, salida, usar_gpu):
    import onnxruntime as ort
    if not usar_gpu:
        os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
        original = ort.InferenceSession

        def solo_cpu(path, *a, **k):  # oemer pide CUDA primero; acá lo forzamos a CPU
            k['providers'] = ['CPUExecutionProvider']
            return original(path, **k)
        ort.InferenceSession = solo_cpu
    from oemer import ete
    sys.argv = ['oemer', img, '-o', salida]
    ete.main()


def main():
    img, salida = sys.argv[1], sys.argv[2]
    try:
        import onnxruntime as ort
        gpu = 'CUDAExecutionProvider' in ort.get_available_providers()
        if gpu and hasattr(ort, 'preload_dlls'):
            ort.preload_dlls()
    except Exception:
        gpu = False
    if gpu:
        try:
            correr(img, salida, True)
            return
        except Exception as e:  # noqa: BLE001
            if not any(x in str(e).lower() for x in ('cuda', 'memory', 'cudnn', 'device')):
                raise  # error de lectura de la partitura, no de la GPU: en CPU fallaría igual
            print(f'GPU falló ({e}); sigo en CPU', file=sys.stderr)
    correr(img, salida, False)


if __name__ == '__main__':
    main()
