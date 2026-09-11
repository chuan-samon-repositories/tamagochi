"""Servidor local. La UI es una página que habla con estos 4 endpoints.

Estudiar un libro largo son minutos, así que va en segundo plano y la UI
pregunta por el progreso: una petición HTTP de nueve minutos no sobrevive.
"""
import json
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import chat, config, db, study


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            self._send((config.UI_DIR / "index.html").read_bytes(),
                       "text/html; charset=utf-8")
        elif self.path == "/learned":
            self._send_json(self._guard(db.learned))
        elif self.path == "/progress":
            self._send_json(study.PROGRESO)
        else:
            self.send_error(404)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"] or 0)))
        if self.path == "/study":
            result = self._empezar_a_estudiar(body)
        elif self.path == "/ask":
            result = self._guard(
                lambda: dict(zip(("knows", "text"), chat.answer(body["q"]))))
        else:
            return self.send_error(404)
        self._send_json(result)

    @staticmethod
    def _empezar_a_estudiar(body):
        if study.PROGRESO.get("estado") in ("leyendo", "ordenando"):
            return {"error": "Ya estoy estudiando otra cosa, espera a que acabe."}

        def leer():
            try:
                study.learn(body["title"], body["text"])
            except Exception as e:
                study.PROGRESO.update(estado="error", error=f"{type(e).__name__}: {e}")

        study.PROGRESO.clear()
        study.PROGRESO.update(estado="leyendo", leidos=0, total=0)
        threading.Thread(target=leer, daemon=True).start()
        return {"started": True}

    @staticmethod
    def _guard(fn):
        """Un fallo de API, de red o de esquema no debe tumbar al bicho ni dejar
        a la UI esperando: se lo contamos y que lo enseñe."""
        try:
            return fn()
        except Exception as e:
            return {"error": f"{type(e).__name__}: {e}"}

    def _send_json(self, payload):
        self._send(json.dumps(payload).encode(), "application/json")

    def _send(self, body, content_type):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass  # el servidor es un detalle, no un log


def serve(open_browser=True):
    url = f"http://localhost:{config.PORT}"
    print(f"Bicho despierto en {url}  (cerebro: {config.DB_PATH})")
    if open_browser:
        threading.Timer(0.5, webbrowser.open, [url]).start()
    ThreadingHTTPServer(("127.0.0.1", config.PORT), Handler).serve_forever()
