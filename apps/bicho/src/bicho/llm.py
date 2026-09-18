"""Frontera con el proveedor. El prefijo del modelo elige backend:

    claude-sonnet-5        -> API de Anthropic
    ollama/qwen2.5:7b      -> Ollama en local
    fake/loquesea          -> respuestas de mentira, cero tokens (fake.py)

Así se pueden mezclar sin más configuración: el gate en local y el chat en la
API es una línea del .env, no un modo aparte. Y el entorno de pruebas tampoco:
es el mismo cerebro con otro proveedor.
"""
import json
import os
import urllib.error
import urllib.request

import anthropic

from . import config, fake

OLLAMA_PREFIX = "ollama/"
_client = None


def client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


def ask(model, system, user, max_tokens=1000, thinking=None):
    """`system` es un str o una lista de bloques (para cache_control)."""
    if model.startswith(fake.PREFIJO):
        return fake.ask(system, user)
    if model.startswith(OLLAMA_PREFIX):
        return _ollama(model, system, user, max_tokens)
    r = _anthropic(model, system, user, max_tokens, thinking)
    return "".join(b.text for b in r.content if b.type == "text")


def ask_json(model, system, user, schema, max_tokens=2000, thinking=None):
    """Salida estructurada: la respuesta cumple el schema. Sin reintentos."""
    if model.startswith(fake.PREFIJO):
        return fake.ask_json(system, user, schema)
    if model.startswith(OLLAMA_PREFIX):
        raw = _ollama(model, system, user, max_tokens, schema=schema)
    else:
        r = _anthropic(model, system, user, max_tokens, thinking,
                       output_config={"format": {"type": "json_schema", "schema": schema}})
        raw = next(b.text for b in r.content if b.type == "text")
    return json.loads(raw)


# --- Anthropic ---------------------------------------------------------------

def _anthropic(model, system, user, max_tokens, thinking, **extra):
    if thinking:
        extra["thinking"] = thinking  # hay modelos que no aceptan el parámetro
    return client().messages.create(
        model=model, max_tokens=max_tokens, system=system,
        messages=[{"role": "user", "content": user}], **extra,
    )


# --- Ollama ------------------------------------------------------------------

def _ollama_url():
    host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    return host if "://" in host else f"http://{host}"


def _flatten(system):
    """Ollama quiere un string; el cache_control es cosa de Anthropic."""
    if isinstance(system, str):
        return system
    return "\n\n".join(block["text"] for block in system)


def _num_ctx(text_len, max_tokens):
    """Ventana que hace falta, o un error con nombre. ~2,5 caracteres por token
    en español; el margen cubre la plantilla del chat."""
    needed = int(text_len / 2.5) + max_tokens + 256
    if needed > config.OLLAMA_MAX_CTX:
        raise RuntimeError(
            f"El texto pide ~{needed} tokens de contexto y el tope son "
            f"{config.OLLAMA_MAX_CTX}. Sube BICHO_OLLAMA_CTX (gasta más VRAM) "
            f"o parte el documento en trozos.")
    return max(4096, needed)


def _ollama(model, system, user, max_tokens, schema=None):
    system_text = _flatten(system)
    body = {
        "model": model.removeprefix(OLLAMA_PREFIX),
        "messages": [
            {"role": "system", "content": system_text},
            {"role": "user", "content": user},
        ],
        "stream": False,
        "options": {
            "num_predict": max_tokens,
            "num_ctx": _num_ctx(len(system_text) + len(user), max_tokens),
        },
    }
    if schema:
        body["format"] = schema
        body["options"]["temperature"] = 0  # clasificar debe ser reproducible
    request = urllib.request.Request(
        f"{_ollama_url()}/api/chat", method="POST",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    try:
        # ponytail: sin streaming. Generar en local tarda, pero la UI solo
        # espera; el día que se quiera ver escribir al bicho, va por aquí.
        with urllib.request.urlopen(request, timeout=300) as response:
            return json.load(response)["message"]["content"]
    except urllib.error.URLError as e:
        raise RuntimeError(
            f"No hay nadie escuchando en {_ollama_url()}. ¿Has arrancado Ollama? "
            f"(`ollama serve`, y `ollama pull {body['model']}`)") from e
