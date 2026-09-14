"""Enseñarle algo, en tres fases:

    leer por trozos  ->  repasar la lista  ->  guardado

Leer es barato y va trozo a trozo, así que tarda en proporción al libro y no hay
techo de contexto. Repasar solo mira los nombres, nunca el texto: cuesta lo mismo
con un folio que con una enciclopedia, y es lo que deja limpio el vocabulario
del gate, que es el prompt que corre en cada pregunta.
"""
from . import config, db, llm, prompts

# ponytail: un bicho, un estudio a la vez. Con varios haría falta una tabla.
PROGRESO = {"state": "idle"}

# Conceptos por llamada de repaso. El repaso tiene que devolver CADA nombre con
# todas sus variantes, así que su respuesta crece con la entrada: con un libro
# entero no cabía en max_tokens, el JSON salía cortado, `json.loads` reventaba y
# se perdía el estudio completo (y lo que había costado).
REVIEW_BATCH = 150


def trocear(text, tamano=None):
    """Agrupa unidades de texto sin pasarse del tamaño."""
    tamano = tamano or config.CHUNK_CHARS
    trozos, actual = [], ""
    for unidad in _unidades(text, tamano):
        if actual and len(actual) + len(unidad) + 2 > tamano:
            trozos.append(actual)
            actual = unidad
        else:
            actual = f"{actual}\n\n{unidad}" if actual else unidad
    if actual:
        trozos.append(actual)
    return trozos


def _unidades(text, tamano):
    """Párrafos; el que se pase del tamaño se parte por líneas, y la línea que
    tampoco quepa, a pelo.

    Un .txt con saltos de línea simples y ninguna línea en blanco es de lo más
    corriente —material/salud.txt, sin ir más lejos, no tiene ni un `\\n\\n`— y
    antes se convertía en un único trozo gigante. Eso se cargaba la invariante
    que sostiene todo esto: ninguna llamada ve más de un trozo.
    """
    for parrafo in text.split("\n\n"):
        parrafo = parrafo.strip("\n")
        if not parrafo.strip():
            continue
        if len(parrafo) <= tamano:
            yield parrafo
            continue
        for linea in parrafo.split("\n"):
            if not linea.strip():
                continue
            while len(linea) > tamano:
                yield linea[:tamano]
                linea = linea[tamano:]
            if linea.strip():
                yield linea


def learn(title, text):
    """Estudia un documento y devuelve los conceptos que le han quedado."""
    text = text.strip()[:config.MAX_DOC_CHARS]
    trozos = trocear(text)
    if not trozos:
        PROGRESO.update(state="idle")
        return []

    doc_id = db.new_doc(title)
    try:
        for i, trozo in enumerate(trozos):
            PROGRESO.update(state="reading", read=i, total=len(trozos))
            conceptos = llm.ask_json(config.MODEL_STUDY, prompts.CHUNK, trozo,
                                     prompts.CONCEPT_LIST_SCHEMA)["concepts"]
            db.add_chunk(doc_id, i, trozo, conceptos)

        PROGRESO.update(state="sorting", read=len(trozos), total=len(trozos))
        finales = repasar(doc_id)
    except Exception:
        # Un libro a medias es peor que ninguno: el gate lo alcanzaría igual.
        db.drop_doc(doc_id)
        PROGRESO.update(state="error")
        raise

    if not finales:
        db.drop_doc(doc_id)
    PROGRESO.update(state="done", concepts=finales)
    return finales


def repasar(doc_id):
    """Unifica variantes, agrupa lo disperso y tira el ruido. Ve solo los nombres."""
    crudos = db.concept_names(doc_id)
    if not crudos:
        return []

    canonical = _repasar(crudos)
    if len(crudos) > REVIEW_BATCH:
        # Dos lotes distintos pueden haber elegido nombres que siguen siendo
        # variantes entre sí ('suma' en uno, 'sumas' en otro). Un repaso más,
        # ya sobre una lista corta, los junta.
        segundo = _repasar(sorted(canonical))
        canonical = {bueno: [orig for v in variantes for orig in canonical.get(v, [v])]
                     for bueno, variantes in segundo.items()}

    db.apply_review(doc_id, canonical)
    return sorted(canonical)


def _repasar(nombres):
    """{nombre bueno: [variantes]} para una lista, en lotes que quepan de sobra
    en la respuesta del modelo."""
    salida = {}
    for i in range(0, len(nombres), REVIEW_BATCH):
        lote = nombres[i:i + REVIEW_BATCH]
        grupos = llm.ask_json(
            config.MODEL_REVIEW, prompts.REVIEW,
            "CONCEPTOS APUNTADOS:\n" + "\n".join(f"- {n}" for n in lote),
            prompts.REVIEW_SCHEMA, max_tokens=_tokens_repaso(lote),
            thinking=config.NO_THINKING)["conceptos"]
        for g in grupos:
            if g["variantes"]:
                salida.setdefault(g["nombre"], []).extend(g["variantes"])
    return salida


def _tokens_repaso(lote):
    """Cada concepto vuelve como nombre y otra vez como variante, más la sintaxis
    del JSON. 40 por concepto va sobrado; el mínimo cubre las listas cortas."""
    return max(1000, len(lote) * 40 + 500)
