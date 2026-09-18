"""Un proveedor que ya se lo sabía todo: contesta sin llamar a nadie.

`llm.py` enruta aquí cualquier modelo con prefijo `fake/`, así que el cerebro
entero —servidor, estudio, gate y chat— corre de punta a punta sin gastar un
token. No es un modo aparte del bicho: es un proveedor más, como Ollama, y por
eso se puede mezclar (gate de mentira y chat de verdad es una línea del `.env`).

Lo que devuelve es extractivo, no una tabla de respuestas enlatadas: los
conceptos salen del propio texto que se le pasa. Así cualquier documento produce
un cerebro creíble, y no solo los dos `.txt` de `material/`.

Para poder probar la interfaz hacen falta además dos cosas que un proveedor de
verdad no tiene:

- **Tardar un poco.** Si estudiar termina antes del primer sondeo de
  `/v1/study/progress`, los estados `reading` y `sorting` no se pueden ver
  nunca, que es justo lo que hay que dibujar. `BICHO_FAKE_DELAY_MS`.
- **Fallar cuando se le pide.** `BICHO_FAKE_FAIL_AT` revienta la lectura del
  trozo N (y deja probar el rollback), y `BICHO_FAKE_FAIL_WORD` en una pregunta
  devuelve un 502.
"""
import re
import time
import unicodedata

from . import config

PREFIJO = "fake/"

# El mismo tope que pide prompts.CHUNK, para que el vocabulario salga del mismo
# tamaño que con un modelo de verdad.
MAX_CONCEPTOS = 8

# Palabras largas que no son conceptos. Corta a propósito: solo lo que aparece
# en cualquier texto en castellano y ensuciaría el vocabulario del gate.
VACIAS = {
    "algunos", "algunas", "aunque", "cada", "como", "cuando", "cual", "cuales",
    "desde", "donde", "entonces", "entre", "esta", "estas", "este", "estos",
    "hace", "hacen", "hacer", "hasta", "mientras", "mismo", "misma", "mucho",
    "muchas", "muchos", "nunca", "otra", "otras", "otro", "otros", "para",
    "pero", "poco", "porque", "puede", "pueden", "sino", "siempre", "sobre",
    "solo", "tambien", "tiene", "tienen", "tener", "toda", "todas", "todo",
    "todos", "vamos", "veces", "aqui", "asi", "ahora", "antes", "bien",
    "cosa", "cosas", "cuanto", "cuanta", "debajo", "despues", "dice", "dicen",
    "encima", "escribo", "forma", "luego", "manera", "menos", "parte", "pone",
    "queda", "quedan", "sale", "tengo", "tienes", "vale", "ejemplos",
}

# Lo que el repaso de verdad tira por no responder a «¿qué sabe esta persona?».
GENERICOS = {"orden", "ejemplo", "error", "introduccion", "resumen", "nota",
             "ejercicio", "apartado", "capitulo", "seccion", "indice"}

ARRANQUES = ["¡Eso me lo sé!", "A ver, que lo he estudiado:",
             "¡Ah, eso! Mira:", "Sí, algo me enseñaron de eso:"]

# Trozos leídos desde el último petardazo. Es lo que hace que BICHO_FAKE_FAIL_AT
# falle en el mismo sitio en cada estudio y no una sola vez por proceso.
_leidos = 0


# --- lo que ve llm.py --------------------------------------------------------

def ask(system, user):
    """Redactar: una frase del material, con la voz del bicho."""
    _dormir()
    _petardazo_si_toca(user)
    frases = _frases_que_pegan(_material(system), user)
    if not frases:
        return "Lo he leído pero no me ha quedado claro... ¿me lo explicas otra vez?"
    arranque = ARRANQUES[sum(map(ord, user)) % len(ARRANQUES)]
    return f"{arranque} {' '.join(frases)}"


def ask_json(system, user, schema):
    """Las tres llamadas con salida estructurada del cerebro."""
    _dormir()
    if "conceptos" in schema.get("properties", {}):
        return {"conceptos": _repasar(_lista(user))}
    if not isinstance(system, str):
        # El gate manda el catálogo en bloques cacheados; leer un trozo manda
        # una instrucción a secas. Es la única diferencia entre las dos, porque
        # las dos piden el mismo schema.
        _petardazo_si_toca(user)
        return {"concepts": _gate(_lista(_texto(system)), user)}
    return {"concepts": _leer_trozo(user)}


# --- fase 1: leer un trozo ---------------------------------------------------

def _leer_trozo(texto):
    global _leidos
    _leidos += 1
    if config.FAKE_FAIL_AT and _leidos >= config.FAKE_FAIL_AT:
        _leidos = 0
        raise RuntimeError(
            f"Petardazo de mentira leyendo el trozo {config.FAKE_FAIL_AT} "
            f"(BICHO_FAKE_FAIL_AT).")
    return _conceptos(texto)


def _conceptos(texto):
    """Las palabras con más peso del trozo, por frecuencia y orden de aparición."""
    cuenta, primera = {}, {}
    for i, palabra in enumerate(_palabras(texto)):
        if _plano(palabra) in VACIAS:
            continue
        cuenta[palabra] = cuenta.get(palabra, 0) + 1
        primera.setdefault(palabra, i)
    orden = sorted(cuenta, key=lambda p: (-cuenta[p], primera[p]))
    return orden[:MAX_CONCEPTOS]


# --- fase 2: repasar la lista ------------------------------------------------

def _repasar(nombres):
    """Agrupa singular y plural bajo el nombre más corto y tira los genéricos.

    Es la mitad de lo que hace el repaso de verdad, que es la mitad que se nota:
    sin esto el gate acaba con 'suma' y 'sumas' como dos conceptos distintos.
    """
    grupos = {}
    for nombre in nombres:
        grupos.setdefault(_raiz(nombre), []).append(nombre)
    salida = []
    for variantes in grupos.values():
        bueno = sorted(variantes, key=lambda n: (len(n), n))[0]
        if _plano(bueno) in GENERICOS:
            continue
        salida.append({"nombre": bueno, "variantes": sorted(set(variantes))})
    return sorted(salida, key=lambda g: g["nombre"])


# --- el gate -----------------------------------------------------------------

def _gate(catalogo, pregunta):
    """Los conceptos del catálogo que la pregunta nombra. Vacío = no lo sabe."""
    raices = {_raiz(p) for p in _palabras(pregunta)}
    return [c for c in catalogo
            if any(_raiz(p) in raices for p in _palabras(c))]


# --- plomería ----------------------------------------------------------------

def _dormir():
    if config.FAKE_DELAY_MS > 0:
        time.sleep(config.FAKE_DELAY_MS / 1000)


def _petardazo_si_toca(user):
    if config.FAKE_FAIL_WORD and config.FAKE_FAIL_WORD in _plano(user):
        raise RuntimeError(
            f"Petardazo de mentira: la pregunta lleva "
            f"{config.FAKE_FAIL_WORD!r} (BICHO_FAKE_FAIL_WORD).")


def _texto(system):
    """El system, sea un str o una lista de bloques, como una sola cadena."""
    if isinstance(system, str):
        return system
    return "\n\n".join(b["text"] for b in system)


def _material(system):
    """Solo el bloque del material, no las instrucciones: si no, el bicho
    contestaría con trozos de su propio prompt."""
    if isinstance(system, str):
        return system
    bloques = [b["text"] for b in system]
    return next((b for b in bloques if b.startswith("MATERIAL")), bloques[-1])


def _lista(texto):
    """Las líneas con viñeta de un bloque ('- suma' -> 'suma')."""
    return [l[2:].strip() for l in texto.splitlines() if l.startswith("- ")]


def _palabras(texto):
    return [p for p in re.findall(r"[^\W\d_]{4,}", texto.lower()) if p]


def _plano(texto):
    """Sin tildes y en minúsculas, para comparar."""
    sin = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in sin if unicodedata.category(c) != "Mn")


def _raiz(palabra):
    """Singular aproximado. No es un stemmer: junta 'sumas' con 'suma' y ya."""
    p = _plano(palabra)
    if len(p) > 5 and p.endswith("es"):
        return p[:-2]
    if len(p) > 4 and p.endswith("s"):
        return p[:-1]
    return p


def _es_titular(frase):
    """Los títulos van en mayúsculas en material/, y sueltos quedan raros como
    respuesta ('¡Eso me lo sé! SUMAS Y RESTAS DESDE CERO')."""
    letras = [c for c in frase if c.isalpha()]
    return bool(letras) and sum(c.isupper() for c in letras) > len(letras) * 0.6


def _frases_que_pegan(material, pregunta):
    """Hasta dos frases del material que hablen de lo que se ha preguntado."""
    raices = {_raiz(p) for p in _palabras(pregunta)}
    # Fuera la cabecera y los títulos que chat.py pone entre trozo y trozo: sin
    # esto el bicho contestaba "MATERIAL APRENDIDO: ### parte 2...".
    cuerpo = "\n".join(l for l in material.splitlines()
                       if not l.startswith(("MATERIAL", "###")))
    # Por final de frase y no por salto de línea: el material trae los párrafos
    # cortados a lo ancho y partir ahí devolvía medias frases.
    seguido = re.sub(r"\s+", " ", cuerpo)
    frases = [f.strip() for f in re.split(r"(?<=[.!?…])\s+", seguido)
              if len(f.strip()) > 40 and not _es_titular(f)]
    # Las dos primeras que mencionen algo de la pregunta; si no, las dos
    # primeras del material, que es lo que el gate ha dejado pasar.
    tocan = [f for f in frases if raices & {_raiz(p) for p in _palabras(f)}]
    elegidas = (tocan or frases)[:2]
    return [f if f.endswith((".", "!", "?")) else f + "." for f in elegidas]
