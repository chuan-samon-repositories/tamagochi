"""Todo lo que se toca sin tocar lógica. Lee `.env` si lo hay."""
import os
from pathlib import Path


def load_dotenv():
    """Carga el `.env` más cercano (cwd hacia arriba). El entorno real siempre manda."""
    for folder in (Path.cwd(), *Path.cwd().parents):
        env_file = folder / ".env"
        if env_file.is_file():
            break
    else:
        return None
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip().removeprefix("export ").strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        # ponytail: sin multilínea ni interpolación ${VAR}; comentarios en su propia
        # línea. El día que haga falta algo de eso: pip install python-dotenv.
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))
    return env_file


DOTENV = load_dotenv()

# Un modelo por tarea. El gate corre en cada pregunta y es la latencia que el
# usuario nota: clasificar contra una lista de 40 nombres no necesita un Opus.
# Leer un trozo es clasificar: barato. Repasar la lista entera es donde hace
# falta criterio, y solo se hace una vez por libro.
MODEL_STUDY = os.getenv("BICHO_MODEL_STUDY", "claude-haiku-4-5")
MODEL_REVIEW = os.getenv("BICHO_MODEL_REVIEW", "claude-sonnet-5")
MODEL_GATE = os.getenv("BICHO_MODEL_GATE", "claude-haiku-4-5")
MODEL_CHAT = os.getenv("BICHO_MODEL_CHAT", "claude-sonnet-5")

# Ni repasar la lista ni redactar con el material delante necesitan razonar
# antes de responder. Se aplica solo donde corre un Sonnet; la extracción por
# trozo va en Haiku 4.5, que no razona por defecto y no necesita que se lo
# digan. Por eso el parámetro es opcional en llm.ask/ask_json.
NO_THINKING = {"type": "disabled"}
DB_PATH = Path(os.getenv("BICHO_DB", Path.home() / ".bicho" / "brain.db"))
PORT = int(os.getenv("BICHO_PORT", "8777"))

MAX_DOC_CHARS = int(os.getenv("BICHO_MAX_DOC_CHARS", "400000"))

# Tope del cuerpo de una petición, antes de leerlo. Sin esto, `rfile.read()` se
# tragaría en memoria lo que le manden. UTF-8 gasta hasta 4 bytes por carácter.
MAX_BODY_BYTES = int(os.getenv("BICHO_MAX_BODY_BYTES", str(MAX_DOC_CHARS * 4 + 65536)))

# Quién puede llamar desde un navegador. La web se sirve desde otro origen
# (Vercel en producción, :5173 en local), así que sin esto el navegador corta
# la petición antes de que salga. "*" vale para pruebas, no para la máquina
# expuesta: allí se ponen los orígenes de verdad.
CORS_ORIGINS = [o.strip() for o in os.getenv(
    "BICHO_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]

# Una línea por petición. DEBUG añade el log crudo de http.server.
LOG_LEVEL = os.getenv("BICHO_LOG_LEVEL", "INFO").upper()

# Tamaño de trozo. Ninguna llamada ve más de esto, así que no hay techo de
# contexto: el límite de arriba es de tiempo y dinero, no de ventana.
CHUNK_CHARS = int(os.getenv("BICHO_CHUNK_CHARS", "4000"))

# ponytail: un concepto que aparece en 40 trozos mandaría 40 trozos. Se cortan
# por orden de lectura; elegir los mejores pide embeddings, y ese es el día.
MAX_CHUNKS_PER_ANSWER = int(os.getenv("BICHO_MAX_CHUNKS", "6"))

# Ollama trae 4096 de contexto y corta el prompt en silencio si no cabe: se
# queda sin documento y devuelve una lista vacía sin un solo error. El tope se
# declara aquí, y pasarse tiene que doler.
OLLAMA_MAX_CTX = int(os.getenv("BICHO_OLLAMA_CTX", "16384"))
