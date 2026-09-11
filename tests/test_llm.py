"""El prefijo del modelo elige backend. Es una bifurcación: se comprueba.

    python tests/test_llm.py
"""
import json

from bicho import llm

llamadas = []
llm._anthropic = lambda *a, **kw: llamadas.append(("anthropic", a[0])) or _Fake()
llm._ollama = lambda model, *a, **kw: (
    llamadas.append(("ollama", model)) or '{"concepts": ["x"]}')


class _Fake:
    content = [type("B", (), {"type": "text", "text": '{"concepts": ["x"]}'})()]


SCHEMA = {"type": "object", "properties": {"concepts": {"type": "array"}}}

llm.ask("claude-sonnet-5", "sys", "hola")
llm.ask("ollama/qwen2.5:7b", "sys", "hola")
llm.ask_json("claude-haiku-4-5", "sys", "hola", SCHEMA)
llm.ask_json("ollama/qwen2.5:7b", "sys", "hola", SCHEMA)

assert llamadas == [
    ("anthropic", "claude-sonnet-5"),
    ("ollama", "ollama/qwen2.5:7b"),
    ("anthropic", "claude-haiku-4-5"),
    ("ollama", "ollama/qwen2.5:7b"),
], llamadas

# el bloque cacheado de Anthropic se aplana para Ollama
bloques = [{"type": "text", "text": "MATERIAL", "cache_control": {"type": "ephemeral"}},
           {"type": "text", "text": "instrucciones"}]
assert llm._flatten(bloques) == "MATERIAL\n\ninstrucciones"
assert llm._flatten("ya es texto") == "ya es texto"

# OLLAMA_HOST sin esquema es válido en Ollama, pero urllib necesita el http://
import os
os.environ["OLLAMA_HOST"] = "127.0.0.1:11434"
assert llm._ollama_url() == "http://127.0.0.1:11434"
os.environ["OLLAMA_HOST"] = "http://otra-maquina:11434"
assert llm._ollama_url() == "http://otra-maquina:11434"

# la ventana crece con el texto, y pasarse del tope avisa en vez de truncar
from bicho import config

assert llm._num_ctx(100, 500) == 4096, "textos cortos usan el mínimo"
assert llm._num_ctx(15_000, 2000) == 8256, "la ventana crece con el documento"
config.OLLAMA_MAX_CTX = 4096
try:
    llm._num_ctx(15_000, 2000)
    raise AssertionError("tenía que haber avisado en vez de truncar")
except RuntimeError as e:
    assert "BICHO_OLLAMA_CTX" in str(e), e

print("ok")
