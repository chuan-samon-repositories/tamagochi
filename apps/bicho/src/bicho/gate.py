"""El gate: ¿esto está dentro de lo que le he enseñado?

Es el corazón del proyecto. El LLM sabe de todo; esta función es lo único que
mantiene la ilusión de que el bicho solo sabe lo que ha estudiado. Corre en cada
pregunta, así que su prompt —la lista de conceptos— conviene tenerla corta y
limpia: de eso se encarga el repaso final del estudio.
"""
from . import config, db, llm, prompts


def relevant_concepts(question):
    """Conceptos necesarios para responder. Lista vacía = el bicho no lo sabe."""
    conocidos = db.concept_names()
    if not conocidos:  # cerebro vacío: rechaza sin gastar una llamada
        return []

    catalogo = "\n".join(f"- {n}" for n in conocidos)
    system = [
        {"type": "text", "text": prompts.GATE},
        # El catálogo es idéntico en todas las preguntas, así que va en el
        # system y cacheado. Antes iba dentro del mensaje del usuario, que es
        # justo la parte que no se puede cachear: se pagaba entero cada vez, y
        # crece con cada libro que aprende.
        {"type": "text", "text": f"CONCEPTOS ESTUDIADOS:\n{catalogo}",
         "cache_control": {"type": "ephemeral"}},
    ]
    elegidos = llm.ask_json(
        config.MODEL_GATE,
        system,
        f"PREGUNTA: {question}",
        prompts.CONCEPT_LIST_SCHEMA,
        max_tokens=500,
    )["concepts"]

    # Solo valen los que existen: el modelo puede devolver algo parecido pero suyo.
    reales = {n.strip().lower(): n for n in conocidos}
    return [reales[e.strip().lower()] for e in elegidos if e.strip().lower() in reales]
