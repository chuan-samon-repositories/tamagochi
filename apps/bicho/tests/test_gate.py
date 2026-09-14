"""El estudio en tres fases y el gate, con un LLM falso. Sin API, sin frameworks.

    python tests/test_gate.py
"""
import tempfile
from pathlib import Path

from bicho import chat, config, db, gate, llm, prompts, study

config.DB_PATH = Path(tempfile.mkdtemp()) / "test.db"
config.CHUNK_CHARS = 50  # un párrafo por trozo, para poder afirmar cuál vuelve

DOC = "\n\n".join([
    "Trozo 0: las SUMAS. Sumar es juntar cosas.",
    "Trozo 1: las RESTAS. Restar es quitar cosas.",
    "Trozo 2: la RESTA otra vez, y el MINUENDO.",
    "Trozo 3: relleno que no ensena nada de nada.",
])

# --- LLM falso ---------------------------------------------------------------
usados = {}


def fake_ask(model, system, user, **kw):
    usados["chat"] = model
    usados["material"] = system[0]["text"]
    return "RESPUESTA"


def fake_ask_json(model, system, user, schema, **kw):
    if system is prompts.CHUNK:                     # fase 1: leer un trozo
        usados["study"] = model
        encontrados = [c for c in ("SUMAS", "RESTAS", "RESTA", "MINUENDO")
                       if c in user]
        return {"concepts": [c.lower() for c in encontrados] or ["errores comunes"]}
    if system is prompts.REVIEW:                    # fase 2: repasar la lista
        usados["review"] = model
        return {"conceptos": [                      # "errores comunes" no se rescata
            {"nombre": "suma", "variantes": ["sumas"]},
            {"nombre": "resta", "variantes": ["restas", "resta"]},
            {"nombre": "minuendo", "variantes": ["minuendo"]},
        ]}
    usados["gate"] = model                          # el gate
    catalogo = [l[2:] for l in user.splitlines() if l.startswith("- ")]
    pregunta = user.split("PREGUNTA:")[1].lower()
    return {"concepts": [c for c in catalogo if c in pregunta]}


llm.ask, llm.ask_json = fake_ask, fake_ask_json

# --- cerebro vacío -----------------------------------------------------------
sabe, texto = chat.answer("¿qué es una suma?")
assert not sabe and texto in prompts.NO_IDEA, "un cerebro vacío rechaza todo"

# --- trocear -----------------------------------------------------------------
assert len(study.trocear(DOC)) == 4, "un párrafo por trozo con este tamaño"
assert all(len(t) <= 50 for t in study.trocear(DOC)), "ningún trozo se pasa"
assert study.trocear("") == [] and study.trocear("\n\n  \n\n") == []

# --- estudiar ----------------------------------------------------------------
finales = study.learn("mates.txt", DOC)
assert finales == ["minuendo", "resta", "suma"], finales
assert usados["study"] == config.MODEL_STUDY, "los trozos, con el modelo barato"
assert usados["review"] == config.MODEL_REVIEW, "el repaso, con el que tiene criterio"

libro = db.learned()[0]
assert libro["chunks"] == 4, "guarda los cuatro trozos, aunque uno no enseñe nada"

# el repaso unificó variantes y tiró el ruido
nombres = sorted(db.concept_names())
assert nombres == ["minuendo", "resta", "suma"], nombres
assert "restas" not in nombres, "'restas' se unificó con 'resta'"
assert "errores comunes" not in nombres, "el ruido no sobrevive al repaso"

# --- el gate abre y devuelve conceptos, no documentos ------------------------
assert gate.relevant_concepts("háblame de la resta") == ["resta"]
assert gate.relevant_concepts("¿qué es la fotosíntesis?") == []

# --- LO QUE JUSTIFICA TODO: responder manda solo los trozos del tema ---------
sabe, _ = chat.answer("háblame de la resta")
assert sabe
material = usados["material"]
assert "Trozo 1" in material and "Trozo 2" in material, "faltan trozos que enseñan resta"
assert "Trozo 0" not in material, "el trozo de las sumas no pinta nada aquí"
assert "Trozo 3" not in material, "el relleno tampoco"

# --- el tope de trozos por respuesta se respeta ------------------------------
config.MAX_CHUNKS_PER_ANSWER = 1
assert len(db.chunks_for(["resta"])) == 1, "más de MAX_CHUNKS no se mandan"
config.MAX_CHUNKS_PER_ANSWER = 6

# --- un libro del que no aprende nada no se guarda ---------------------------
antes = len(db.learned())
llm.ask_json, guardado = (
    lambda model, system, user, schema, **kw:
        {"concepts": []} if system is prompts.CHUNK else {"conceptos": []},
    llm.ask_json)
assert study.learn("ilegible.txt", "asdf\n\nqwer") == []
llm.ask_json = guardado
assert len(db.learned()) == antes, "no deja el libro a medias"

# --- si revienta a mitad, no deja medio libro dentro -------------------------
def revienta(model, system, user, schema, **kw):
    if system is prompts.CHUNK and "Trozo 2" in user:
        raise RuntimeError("se cayó la red")
    return fake_ask_json(model, system, user, schema, **kw)


llm.ask_json = revienta
try:
    study.learn("a-medias.txt", DOC)
    raise AssertionError("tenía que haber propagado el fallo")
except RuntimeError as e:
    assert "se cayó la red" in str(e)
llm.ask_json = fake_ask_json
assert len(db.learned()) == antes, "un libro a medias se deshace entero"

print("ok")
