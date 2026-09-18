"""Los endpoints del cerebro. La interfaz vive aparte, en apps/web.

Estudiar un libro largo son minutos, así que va en segundo plano y el cliente
pregunta por el progreso: una petición HTTP de nueve minutos no sobrevive.

La forma de las respuestas está en contract/openapi.yaml. Si cambia aquí, cambia
allí en el mismo commit.
"""
import json
import logging
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import chat, config, db, fake, study

log = logging.getLogger("bicho")

API = "/v1"


class ApiError(Exception):
    """Un error que sí se le puede enseñar a un cliente: estado HTTP de verdad y
    un código estable para que ramifique sin leerse el texto."""

    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


class Handler(BaseHTTPRequestHandler):
    server_version = "bicho"

    # --- rutas ---------------------------------------------------------------

    def do_OPTIONS(self):
        # El preflight del navegador. Antes esto devolvía 501 y la web no podía
        # ni empezar a hablar con el bicho.
        self._responder(204, None)

    def do_GET(self):
        self._despachar({
            "/health": _salud,
            "/learned": db.learned,
            "/study/progress": lambda: dict(study.PROGRESO),
        })

    def do_POST(self):
        self._despachar({
            "/study": lambda: self._estudiar(self._cuerpo()),
            "/ask": lambda: self._preguntar(self._cuerpo()),
        })

    def _despachar(self, tabla):
        empezado = time.perf_counter()
        ruta = self.path.split("?", 1)[0].rstrip("/") or "/"
        status = 200
        try:
            if not ruta.startswith(API):
                raise ApiError(404, "not_found", f"No hay nada en {ruta}.")
            fn = tabla.get(ruta[len(API):] or "/")
            if fn is None:
                raise ApiError(404, "not_found", f"No hay nada en {ruta}.")
            resultado = fn()
            payload, status = resultado if isinstance(resultado, tuple) else (resultado, 200)
            self._responder(status, payload)
        except ApiError as e:
            status = e.status
            self._responder(status, {"error": {"code": e.code, "message": e.message}})
        except Exception as e:
            # Un fallo de API, de red o de esquema no debe tumbar al bicho ni
            # dejar al cliente esperando. El traceback va al log, no al usuario.
            status = 502
            log.exception("%s %s", self.command, ruta)
            self._responder(status, {"error": {
                "code": "upstream_failed",
                "message": f"Algo ha fallado hablando con el modelo ({type(e).__name__})."}})
        finally:
            log.info("%s %s -> %s  %.0f ms",
                     self.command, ruta, status, (time.perf_counter() - empezado) * 1000)

    # --- lo que hace cada una ------------------------------------------------

    @staticmethod
    def _preguntar(body):
        pregunta = str(body.get("q") or "").strip()
        if not pregunta:
            raise ApiError(400, "bad_request", "Hace falta una pregunta en 'q'.")
        knows, text = chat.answer(pregunta)
        return {"knows": knows, "text": text}

    @staticmethod
    def _estudiar(body):
        title = str(body.get("title") or "").strip()
        text = body.get("text") or ""
        if not title or not str(text).strip():
            raise ApiError(400, "bad_request", "Hacen falta 'title' y 'text'.")
        if len(text) > config.MAX_DOC_CHARS:
            raise ApiError(413, "doc_too_large",
                           f"El documento pasa de {config.MAX_DOC_CHARS} caracteres. "
                           f"Pártelo en trozos más pequeños.")
        if study.PROGRESO.get("state") in ("reading", "sorting"):
            raise ApiError(409, "already_studying",
                           "Ya estoy estudiando otra cosa, espera a que acabe.")

        def leer():
            try:
                study.learn(title, text)
            except Exception as e:
                log.exception("estudiando %r", title)
                study.PROGRESO.update(state="error", error=f"{type(e).__name__}: {e}")

        study.PROGRESO.clear()
        study.PROGRESO.update(state="reading", read=0, total=0)
        threading.Thread(target=leer, daemon=True).start()
        log.info("empieza a estudiar %r (%d caracteres)", title, len(text))
        return {"started": True}, 202

    # --- plomería ------------------------------------------------------------

    def _cuerpo(self):
        """El JSON de la petición, o un ApiError. Antes esto estaba fuera del
        try del despachador: un cuerpo vacío o mal formado cerraba la conexión
        con un traceback y sin respuesta."""
        largo = int(self.headers.get("Content-Length") or 0)
        if largo <= 0:
            raise ApiError(400, "bad_request", "Falta el cuerpo de la petición.")
        if largo > config.MAX_BODY_BYTES:
            raise ApiError(413, "doc_too_large",
                           f"El cuerpo pasa de {config.MAX_BODY_BYTES} bytes.")
        try:
            return json.loads(self.rfile.read(largo))
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ApiError(400, "bad_request", "El cuerpo no es JSON válido.")

    def _responder(self, status, payload):
        cuerpo = b"" if payload is None else json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self._cors()
        if cuerpo:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        if cuerpo:
            self.wfile.write(cuerpo)

    def _cors(self):
        origen = self.headers.get("Origin")
        if not origen:
            return
        if "*" not in config.CORS_ORIGINS and origen not in config.CORS_ORIGINS:
            return
        self.send_header("Access-Control-Allow-Origin", origen)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")

    def log_message(self, formato, *args):
        # El log de una línea por petición lo lleva _despachar. Esto es el log
        # crudo de http.server, que solo estorba salvo cuando se depura.
        log.debug(formato, *args)


def _salud():
    """Contra qué cerebro se está hablando. La web lo usa para no confundir el
    de mentira con el de verdad, que es un error que cuesta dinero."""
    modelos = {"study": config.MODEL_STUDY, "review": config.MODEL_REVIEW,
               "gate": config.MODEL_GATE, "chat": config.MODEL_CHAT}
    return {"fake": all(m.startswith(fake.PREFIJO) for m in modelos.values()),
            "models": modelos}


def serve(port=None, host="127.0.0.1"):
    """Escucha en localhost a propósito: de puertas afuera se sale por el túnel
    (deploy/README.md), no abriendo un puerto en el router."""
    logging.basicConfig(
        level=getattr(logging, config.LOG_LEVEL, logging.INFO),
        format="%(asctime)s %(levelname)-7s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S")
    port = port or config.PORT
    log.info("bicho despierto en http://%s:%s  (cerebro: %s)", host, port, config.DB_PATH)
    ThreadingHTTPServer((host, port), Handler).serve_forever()
