#!/usr/bin/env python3
"""Graba las respuestas del cerebro de mentira en fixtures para la web.

El mock de `apps/web` no puede inventarse la forma de las respuestas: si se
escribe a mano, se separa del servidor y el día que se conecte a la API de
verdad, la interfaz se rompe. Así que no se escribe a mano: se graba de un bicho
de verdad corriendo con el proveedor falso.

CI vuelve a grabarlas y falla si el diff no está vacío, que es lo que convierte
`contract/openapi.yaml` en algo comprobado y no en un documento de buenas
intenciones.

    python scripts/record-fixtures.py          # regraba apps/web/src/api/fixtures
    python scripts/record-fixtures.py --check  # falla si algo ha cambiado
"""
import json
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "apps" / "web" / "src" / "api" / "fixtures"
MATERIAL = RAIZ / "apps" / "bicho" / "material" / "sumas-y-restas.txt"
PUERTO = 8799

# La hora de estudiar cambia en cada grabación y no es lo que se quiere fijar.
FECHA_FIJA = "2026-01-01 00:00:00"

sys.path.insert(0, str(RAIZ / "apps" / "bicho" / "src"))
from bicho import config, fake, prompts, server  # noqa: E402

config.DB_PATH = Path(tempfile.mkdtemp()) / "fixtures.db"
config.PORT = PUERTO
config.LOG_LEVEL = "CRITICAL"
config.FAKE_DELAY_MS = 0  # grabar no es enseñar la interfaz: aquí estorba
MODELO = f"{fake.PREFIJO}mentirijillas"
config.MODEL_STUDY = config.MODEL_REVIEW = config.MODEL_GATE = config.MODEL_CHAT = MODELO

BASE = f"http://127.0.0.1:{PUERTO}/v1"


def pedir(metodo, ruta, cuerpo=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    cabeceras = {"Content-Type": "application/json"} if datos else {}
    req = urllib.request.Request(BASE + ruta, method=metodo, data=datos, headers=cabeceras)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return json.loads(e.read() or b"null")


def arrancar():
    threading.Thread(target=server.serve, daemon=True).start()
    for _ in range(100):
        try:
            return pedir("GET", "/health")
        except Exception:
            time.sleep(0.05)
    raise SystemExit("el bicho no ha arrancado")


def grabar():
    texto = MATERIAL.read_text(encoding="utf-8")
    salud = arrancar()
    assert salud["fake"] is True, "esto tiene que grabarse contra el cerebro falso"

    pedir("POST", "/study", {"title": MATERIAL.name, "text": texto})
    for _ in range(600):
        progreso = pedir("GET", "/study/progress")
        if progreso["state"] in ("done", "error"):
            break
        time.sleep(0.05)
    assert progreso["state"] == "done", progreso

    aprendido = pedir("GET", "/learned")
    for doc in aprendido:
        doc["added_at"] = FECHA_FIJA

    return {
        # Respuestas del servidor, tal cual salen.
        "health.json": salud,
        "learned.json": aprendido,
        "progress.json": progreso,
        "ask.json": pedir("POST", "/ask", {"q": "¿qué es una resta?"}),
        "error.json": pedir("POST", "/ask", {}),
        # Datos del cerebro que no son una respuesta, pero que el mock necesita
        # para no inventárselos: las excusas y el documento con el que nace.
        "no-idea.json": prompts.NO_IDEA,
        "seed-doc.json": {"title": MATERIAL.name, "text": texto},
    }


def main():
    comprobar = "--check" in sys.argv
    DESTINO.mkdir(parents=True, exist_ok=True)
    for nombre, valor in grabar().items():
        (DESTINO / nombre).write_text(
            json.dumps(valor, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"  {nombre}")

    if comprobar:
        diff = subprocess.run(["git", "diff", "--stat", "--exit-code", "--", str(DESTINO)],
                              cwd=RAIZ)
        if diff.returncode:
            sys.exit(
                "\nLas fixtures de la web no son las que el cerebro devuelve hoy.\n"
                "Si el cambio es a propósito: python scripts/record-fixtures.py, "
                "y el commit lleva las dos mitades.")
    print("ok")


if __name__ == "__main__":
    main()
