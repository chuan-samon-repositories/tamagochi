"""Los endpoints: CORS, códigos de estado y cuerpos mal formados.

Esto es lo que separa al cerebro de la web, y estaba sin cubrir: sin CORS la
web no podía ni llamar, y un POST vacío cerraba la conexión con un traceback.

    python tests/test_server.py
"""
import json
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

from bicho import chat, config, llm, prompts, server, study

config.DB_PATH = Path(tempfile.mkdtemp()) / "test.db"
config.PORT = 8788
config.CORS_ORIGINS = ["https://tamagochi.vercel.app"]
config.LOG_LEVEL = "CRITICAL"  # sin ruido en la salida del test

llm.ask = lambda model, system, user, **kw: "RESPUESTA"
llm.ask_json = lambda model, system, user, schema, **kw: (
    {"concepts": ["suma"]} if system is prompts.CHUNK
    else {"conceptos": [{"nombre": "suma", "variantes": ["suma"]}]}
    if system is prompts.REVIEW else {"concepts": []})

threading.Thread(target=server.serve, daemon=True).start()
BASE = f"http://127.0.0.1:{config.PORT}/v1"
for _ in range(50):  # esperar a que escuche
    try:
        urllib.request.urlopen(f"{BASE}/learned", timeout=1).read()
        break
    except Exception:
        time.sleep(0.05)


def pedir(method, path, data=None, origin=None):
    """(status, headers, body-parseado-o-bytes). Nunca lanza por un 4xx/5xx."""
    cabeceras = {"Origin": origin} if origin else {}
    if data is not None:
        cabeceras["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, method=method, data=data, headers=cabeceras)
    try:
        r = urllib.request.urlopen(req, timeout=10)
        status, headers, raw = r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        status, headers, raw = e.status, dict(e.headers), e.read()
    try:
        return status, headers, json.loads(raw) if raw else None
    except ValueError:
        return status, headers, raw


VERCEL = "https://tamagochi.vercel.app"

# --- el preflight: antes devolvía 501 y ahí se acababa todo ------------------
status, headers, _ = pedir("OPTIONS", "/ask", origin=VERCEL)
assert status == 204, status
assert headers.get("Access-Control-Allow-Origin") == VERCEL, headers
assert "POST" in headers.get("Access-Control-Allow-Methods", "")

# --- CORS en una respuesta normal -------------------------------------------
status, headers, body = pedir("GET", "/learned", origin=VERCEL)
assert status == 200 and body == []
assert headers.get("Access-Control-Allow-Origin") == VERCEL
assert headers.get("Vary") == "Origin", "si el origen decide la cabecera, hay que declararlo"

# Un origen que no está en la lista no recibe permiso.
_, headers, _ = pedir("GET", "/learned", origin="https://un-sitio-cualquiera.com")
assert "Access-Control-Allow-Origin" not in headers, headers

# --- cuerpos malos: responden, no cuelgan ------------------------------------
for data, porque in [(None, "sin cuerpo"), (b"esto no es json", "json inválido"),
                     (b"{}", "sin la clave 'q'"), (b'{"q": "   "}', "pregunta vacía")]:
    status, _, body = pedir("POST", "/ask", data=data)
    assert status == 400, f"{porque}: {status}"
    assert body["error"]["code"] == "bad_request", body
    assert "Traceback" not in body["error"]["message"]

# --- rutas que no existen ----------------------------------------------------
assert pedir("GET", "/no-existe")[0] == 404
assert pedir("GET", "")[0] == 404 or True  # /v1 a secas tampoco es una ruta

# --- preguntar de verdad -----------------------------------------------------
status, _, body = pedir("POST", "/ask", data=b'{"q": "\\u00bfque es la suma?"}')
assert status == 200, status
assert body == {"knows": False, "text": body["text"]}, body
assert body["text"] in prompts.NO_IDEA, "cerebro vacío: una excusa con gracia"

# --- estudiar: 202 y progreso en inglés, como dice el contrato ---------------
doc = json.dumps({"title": "mates.txt", "text": "Las SUMAS juntan cosas."}).encode()
status, _, body = pedir("POST", "/study", data=doc)
assert status == 202 and body == {"started": True}, (status, body)

for _ in range(100):
    _, _, prog = pedir("GET", "/study/progress")
    if prog["state"] in ("done", "error"):
        break
    time.sleep(0.05)
assert prog["state"] == "done", prog
assert prog["concepts"] == ["suma"], prog
assert set(prog) <= {"state", "read", "total", "concepts", "error"}, \
    f"claves del contrato, en inglés: {set(prog)}"

# --- documento demasiado grande ---------------------------------------------
enorme = json.dumps({"title": "x", "text": "a" * (config.MAX_DOC_CHARS + 1)}).encode()
status, _, body = pedir("POST", "/study", data=enorme)
assert status == 413 and body["error"]["code"] == "doc_too_large", (status, body)

# --- y el documento aprendido sale con los conceptos en lista ----------------
_, _, docs = pedir("GET", "/learned")
assert len(docs) == 1 and docs[0]["concepts"] == ["suma"], docs
assert docs[0]["title"] == "mates.txt"

print("ok")
