"""Enseñarle algo, en tres fases:

    leer por trozos  ->  repasar la lista  ->  guardado

Leer es barato y va trozo a trozo, así que tarda en proporción al libro y no hay
techo de contexto. Repasar solo mira los nombres, nunca el texto: cuesta lo mismo
con un folio que con una enciclopedia, y es lo que deja limpio el vocabulario
del gate, que es el prompt que corre en cada pregunta.
"""
from . import config, db, llm, prompts

# ponytail: un bicho, un estudio a la vez. Con varios haría falta una tabla.
PROGRESO = {"estado": "inactivo"}


def trocear(text, tamano=None):
    """Parte por párrafos y los agrupa sin pasarse del tamaño. Nunca corta un
    párrafo por la mitad: un trozo cortado enseña peor que uno corto."""
    tamano = tamano or config.CHUNK_CHARS
    trozos, actual = [], ""
    for parrafo in text.split("\n\n"):
        parrafo = parrafo.strip("\n")
        if not parrafo.strip():
            continue
        if actual and len(actual) + len(parrafo) + 2 > tamano:
            trozos.append(actual)
            actual = parrafo
        else:
            actual = f"{actual}\n\n{parrafo}" if actual else parrafo
    if actual:
        trozos.append(actual)
    return trozos


def learn(title, text):
    """Estudia un documento y devuelve los conceptos que le han quedado."""
    text = text.strip()[:config.MAX_DOC_CHARS]
    trozos = trocear(text)
    if not trozos:
        PROGRESO.update(estado="inactivo")
        return []

    doc_id = db.new_doc(title)
    try:
        for i, trozo in enumerate(trozos):
            PROGRESO.update(estado="leyendo", leidos=i, total=len(trozos))
            conceptos = llm.ask_json(config.MODEL_STUDY, prompts.CHUNK, trozo,
                                     prompts.CONCEPT_LIST_SCHEMA,
                                     thinking=config.NO_THINKING)["concepts"]
            db.add_chunk(doc_id, i, trozo, conceptos)

        PROGRESO.update(estado="ordenando", leidos=len(trozos), total=len(trozos))
        finales = repasar(doc_id)
    except Exception:
        # Un libro a medias es peor que ninguno: el gate lo alcanzaría igual.
        db.drop_doc(doc_id)
        PROGRESO.update(estado="error")
        raise

    if not finales:
        db.drop_doc(doc_id)
    PROGRESO.update(estado="listo", conceptos=finales)
    return finales


def repasar(doc_id):
    """Unifica variantes, agrupa lo disperso y tira el ruido. Ve solo los nombres."""
    crudos = db.concept_names(doc_id)
    if not crudos:
        return []
    grupos = llm.ask_json(
        config.MODEL_REVIEW, prompts.REVIEW,
        "CONCEPTOS APUNTADOS:\n" + "\n".join(f"- {n}" for n in crudos),
        prompts.REVIEW_SCHEMA, thinking=config.NO_THINKING)["conceptos"]
    canonical = {g["nombre"]: g["variantes"] for g in grupos if g["variantes"]}
    db.apply_review(doc_id, canonical)
    return sorted(canonical)
