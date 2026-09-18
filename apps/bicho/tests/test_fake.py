"""El proveedor de mentira: el cerebro entero sin gastar un token.

Comprueba lo que sostiene el entorno de pruebas: que el prefijo `fake/` enruta
ahí, que lo que devuelve cumple los mismos schemas que un modelo de verdad, que
es determinista (si no, las fixtures de la web bailarían en cada grabación) y
que estudiar un documento real no llama a ningún proveedor.

    python tests/test_fake.py
"""
import tempfile
from pathlib import Path

from bicho import chat, config, db, fake, gate, llm, prompts, study

config.DB_PATH = Path(tempfile.mkdtemp()) / "test.db"
config.FAKE_DELAY_MS = 0  # en los tests no hay interfaz que mirar
MODELO = f"{fake.PREFIJO}mentirijillas"
config.MODEL_STUDY = config.MODEL_REVIEW = config.MODEL_GATE = config.MODEL_CHAT = MODELO

MATERIAL = Path(__file__).resolve().parent.parent / "material" / "sumas-y-restas.txt"


def revienta(*a, **kw):
    raise AssertionError("un test ha llamado a un proveedor de verdad")


# Ni Anthropic ni Ollama: si el enrutado por prefijo falla, esto lo dice aquí y
# no con una factura. Es la misma red de seguridad que test_gate.py.
llm._anthropic = llm._ollama = revienta


def cumple(valor, schema):
    """Validación estructural, sin dependencias. No es un validador de JSON
    Schema: comprueba lo que estos tres schemas realmente piden."""
    assert isinstance(valor, dict), valor
    for clave in schema["required"]:
        assert clave in valor, f"falta {clave!r} en {valor}"
    for clave, sub in schema["properties"].items():
        if clave not in valor:
            continue
        if sub["type"] == "array":
            assert isinstance(valor[clave], list), valor
            for item in valor[clave]:
                if sub["items"]["type"] == "string":
                    assert isinstance(item, str), item
                else:
                    cumple(item, sub["items"])
        elif sub["type"] == "string":
            assert isinstance(valor[clave], str), valor
    return True


# --- el prefijo enruta -------------------------------------------------------
assert isinstance(llm.ask(MODELO, "instrucciones", "hola"), str)
cumple(llm.ask_json(MODELO, prompts.CHUNK, "El cero es ninguna cosa.",
                    prompts.CONCEPT_LIST_SCHEMA), prompts.CONCEPT_LIST_SCHEMA)

# --- las tres llamadas con schema --------------------------------------------
trozo = "La suma junta dos grupos. Sumar es juntar. La resta quita de un grupo."
leido = fake.ask_json(prompts.CHUNK, trozo, prompts.CONCEPT_LIST_SCHEMA)
cumple(leido, prompts.CONCEPT_LIST_SCHEMA)
assert leido["concepts"], "un trozo con contenido enseña algo"
assert len(leido["concepts"]) <= fake.MAX_CONCEPTOS, leido
assert leido == fake.ask_json(prompts.CHUNK, trozo, prompts.CONCEPT_LIST_SCHEMA), \
    "el mismo trozo tiene que dar lo mismo: las fixtures de la web se graban de aquí"

repaso = fake.ask_json(prompts.REVIEW,
                       "CONCEPTOS APUNTADOS:\n- sumas\n- suma\n- resta\n- orden",
                       prompts.REVIEW_SCHEMA)
cumple(repaso, prompts.REVIEW_SCHEMA)
grupos = {g["nombre"]: g["variantes"] for g in repaso["conceptos"]}
assert grupos.get("suma") == ["suma", "sumas"], grupos
assert "orden" not in grupos, "el repaso tira los genéricos, como el de verdad"
assert all(g["variantes"] for g in repaso["conceptos"]), \
    "un grupo sin variantes lo descarta study._repasar y se perdería el concepto"

catalogo = [{"type": "text", "text": prompts.GATE},
            {"type": "text", "text": "CONCEPTOS ESTUDIADOS:\n- suma\n- resta"}]
abre = fake.ask_json(catalogo, "PREGUNTA: ¿cómo hago una resta?",
                     prompts.CONCEPT_LIST_SCHEMA)
assert abre["concepts"] == ["resta"], abre
cierra = fake.ask_json(catalogo, "PREGUNTA: ¿quién ganó el mundial?",
                       prompts.CONCEPT_LIST_SCHEMA)
assert cierra["concepts"] == [], "lo que no ha estudiado no pasa el gate"

# --- redactar no devuelve el prompt ------------------------------------------
system = [{"type": "text", "text": prompts.CHAT},
          {"type": "text", "text": "MATERIAL APRENDIDO:\n### libro (parte 1)\n"
                                   "Restar es quitar cosas de un grupo y contar lo que queda."}]
texto = fake.ask(system, "¿qué es restar?")
assert "MATERIAL" not in texto and "###" not in texto, texto
assert "quitar" in texto, texto

# --- estudiar de verdad, sin proveedor ---------------------------------------
conceptos = study.learn("sumas-y-restas.txt", MATERIAL.read_text(encoding="utf-8"))
assert len(conceptos) > 5, conceptos
assert "suma" in conceptos and "resta" in conceptos, conceptos
assert conceptos == sorted(conceptos), "la lista sale ordenada"
assert study.PROGRESO["state"] == "done", study.PROGRESO
assert study.PROGRESO["read"] == study.PROGRESO["total"] > 1, study.PROGRESO

sabe, respuesta = chat.answer("¿qué es una resta?")
assert sabe and len(respuesta) > 40, respuesta
sabe, respuesta = chat.answer("¿cuál es la capital de Mongolia?")
assert not sabe and respuesta in prompts.NO_IDEA, respuesta

# --- fallar cuando se le pide ------------------------------------------------
config.FAKE_FAIL_WORD = "kaboom"
try:
    chat.answer("cuéntame algo de kaboom")
except RuntimeError:
    pass
else:
    raise AssertionError("la palabra mágica tiene que reventar: es el 502 de la web")
config.FAKE_FAIL_WORD = ""

antes = len(db.learned())
config.FAKE_FAIL_AT = 2
try:
    study.learn("libro-que-falla", MATERIAL.read_text(encoding="utf-8"))
except RuntimeError:
    pass
else:
    raise AssertionError("BICHO_FAKE_FAIL_AT tiene que reventar el estudio")
assert len(db.learned()) == antes, "un estudio fallido se deshace entero"
assert study.PROGRESO["state"] == "error", study.PROGRESO
config.FAKE_FAIL_AT = 0

# --- el gate sigue siendo el gate --------------------------------------------
assert gate.relevant_concepts("háblame de la fotosíntesis") == [], \
    "con el proveedor falso el gate no se vuelve permisivo"

print("ok")
