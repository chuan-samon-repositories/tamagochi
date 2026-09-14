"""El cerebro es un fichero SQLite. Resetear el bicho = borrarlo. Compartirlo = copiarlo.

El texto vive troceado: cada concepto apunta al trozo que lo enseña, y responder
manda solo esos trozos en vez del libro entero.
"""
import sqlite3

from . import config

# Súbelo al cambiar SCHEMA: es lo que distingue un cerebro viejo de uno nuevo.
SCHEMA_VERSION = 2

SCHEMA = """
CREATE TABLE IF NOT EXISTS docs(
    id       INTEGER PRIMARY KEY,
    title    TEXT NOT NULL,
    added_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS chunks(
    id     INTEGER PRIMARY KEY,
    doc_id INTEGER NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
    ord    INTEGER NOT NULL,
    text   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS concepts(
    id       INTEGER PRIMARY KEY,
    chunk_id INTEGER NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
    name     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chunks_by_doc ON chunks(doc_id);
CREATE INDEX IF NOT EXISTS concepts_by_chunk ON concepts(chunk_id);
CREATE INDEX IF NOT EXISTS concepts_by_name ON concepts(name);
"""


def connect():
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    _check_version(conn)
    conn.executescript(SCHEMA)
    return conn


def _check_version(conn):
    """`CREATE TABLE IF NOT EXISTS` no migra: sin esto, un cerebro de otra versión
    revienta más tarde con un `no such column` que no dice nada."""
    version = conn.execute("PRAGMA user_version").fetchone()[0]
    if version == SCHEMA_VERSION:
        return
    ya_hay_tablas = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='docs'").fetchone()
    if ya_hay_tablas:
        # ponytail: sin migraciones. El cerebro es desechable en v0; el día que
        # deje de serlo, aquí van los ALTER TABLE por versión.
        raise RuntimeError(
            f"{config.DB_PATH} es de un esquema anterior (v{version}, se espera "
            f"v{SCHEMA_VERSION}). Bórralo para empezar de cero: rm {config.DB_PATH}")
    conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")


# --- escribir mientras estudia ------------------------------------------------

def new_doc(title):
    with connect() as c:
        return c.execute("INSERT INTO docs(title) VALUES(?)", (title,)).lastrowid


def add_chunk(doc_id, ord_, text, concepts):
    """Un trozo leído, con lo que enseña. Se llama una vez por trozo."""
    with connect() as c:
        chunk_id = c.execute(
            "INSERT INTO chunks(doc_id, ord, text) VALUES(?, ?, ?)",
            (doc_id, ord_, text)).lastrowid
        c.executemany("INSERT INTO concepts(chunk_id, name) VALUES(?, ?)",
                      [(chunk_id, n) for n in concepts])


def drop_doc(doc_id):
    with connect() as c:
        c.execute("PRAGMA foreign_keys = ON")
        c.execute("DELETE FROM docs WHERE id = ?", (doc_id,))


# --- el repaso final ----------------------------------------------------------

def concept_names(doc_id=None):
    """Los nombres distintos. Es el vocabulario del gate y la entrada del repaso."""
    if doc_id is None:
        sql, args = "SELECT DISTINCT name FROM concepts", ()
    else:
        sql = ("SELECT DISTINCT c.name FROM concepts c "
               "JOIN chunks k ON k.id = c.chunk_id WHERE k.doc_id = ?")
        args = (doc_id,)
    with connect() as c:
        return [r[0] for r in c.execute(sql, args)]


def apply_review(doc_id, canonical):
    """`canonical` es {nombre bueno: [variantes]}. Renombra las variantes y borra
    lo que el repaso no rescató: sobrevive solo lo que aparece en el mapa."""
    with connect() as c:
        rows = c.execute(
            "SELECT c.id, c.name FROM concepts c JOIN chunks k ON k.id = c.chunk_id "
            "WHERE k.doc_id = ?", (doc_id,)).fetchall()
        destino = {v.strip().lower(): bueno
                   for bueno, variantes in canonical.items() for v in variantes}
        renombrar = [(destino[r["name"].strip().lower()], r["id"])
                     for r in rows if r["name"].strip().lower() in destino]
        borrar = [(r["id"],) for r in rows if r["name"].strip().lower() not in destino]
        c.executemany("UPDATE concepts SET name = ? WHERE id = ?", renombrar)
        c.executemany("DELETE FROM concepts WHERE id = ?", borrar)
        # Tras renombrar, el mismo concepto puede repetirse en un trozo.
        c.execute("DELETE FROM concepts WHERE id NOT IN "
                  "(SELECT MIN(id) FROM concepts GROUP BY chunk_id, name)")
        return len(renombrar), len(borrar)


# --- leer para responder ------------------------------------------------------

def chunks_for(names):
    """Los trozos que enseñan alguno de esos conceptos, en orden de lectura."""
    if not names:
        return []
    marcas = ",".join("?" * len(names))
    with connect() as c:
        return c.execute(
            f"SELECT DISTINCT d.title, k.ord, k.text FROM chunks k "
            f"JOIN concepts c ON c.chunk_id = k.id JOIN docs d ON d.id = k.doc_id "
            f"WHERE lower(c.name) IN ({marcas}) ORDER BY d.id, k.ord "
            f"LIMIT {config.MAX_CHUNKS_PER_ANSWER}",
            [n.strip().lower() for n in names]).fetchall()


def learned():
    """Resumen para la UI: un doc por fila con sus trozos y conceptos."""
    with connect() as c:
        return [dict(r) for r in c.execute("""
            SELECT d.id, d.title, d.added_at,
                   count(DISTINCT k.id)  AS chunks,
                   group_concat(DISTINCT c.name) AS concepts
            FROM docs d
            LEFT JOIN chunks k ON k.doc_id = d.id
            LEFT JOIN concepts c ON c.chunk_id = k.id
            GROUP BY d.id ORDER BY d.id
        """)]
