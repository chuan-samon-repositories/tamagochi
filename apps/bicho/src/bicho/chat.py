"""Hablar con el bicho: pasa el gate o no pasa."""
import random

from . import config, db, gate, llm, prompts


def answer(question):
    """(sabe, texto). Si no sabe, ni siquiera se le pregunta al modelo por el tema."""
    conceptos = gate.relevant_concepts(question)
    trozos = db.chunks_for(conceptos)
    if not trozos:
        return False, random.choice(prompts.NO_IDEA)

    material = "\n\n".join(f"### {t['title']} (parte {t['ord'] + 1})\n{t['text']}"
                           for t in trozos)
    system = [
        # Lo estable primero: la caché es por prefijo, así que con el material
        # delante las instrucciones quedaban detrás del corte y no se
        # reutilizaban nunca.
        {"type": "text", "text": prompts.CHAT},
        # Solo los fragmentos que hablan del tema, no el libro: es lo que hace que
        # responder cueste lo mismo con un folio que con 300 páginas. Y cacheado,
        # porque la siguiente pregunta suele tocar los mismos trozos.
        {"type": "text", "text": f"MATERIAL APRENDIDO:\n{material}",
         "cache_control": {"type": "ephemeral"}},
    ]
    return True, llm.ask(config.MODEL_CHAT, system, question,
                         thinking=config.NO_THINKING)
