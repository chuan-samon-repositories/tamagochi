"""El lector de .env es un parser: se le comprueban las cuatro cosas que hace.

    python tests/test_config.py
"""
import os
import tempfile
from pathlib import Path

from bicho import config

workdir = Path(tempfile.mkdtemp())
(workdir / "sub").mkdir()
(workdir / ".env").write_text(
    "# un comentario\n"
    "\n"
    "ANTHROPIC_API_KEY=sk-ant-desde-fichero\n"
    'BICHO_MODEL="claude-con-comillas"\n'
    "export BICHO_PORT=9999\n"
    "  BICHO_DB = ./espacios.db  \n"
    "linea-basura-sin-igual\n",
    encoding="utf-8",
)

for key in ("ANTHROPIC_API_KEY", "BICHO_MODEL", "BICHO_PORT", "BICHO_DB", "YA_PUESTA"):
    os.environ.pop(key, None)
os.environ["YA_PUESTA"] = "del-entorno"
(workdir / ".env").write_text(
    (workdir / ".env").read_text(encoding="utf-8") + "YA_PUESTA=del-fichero\n",
    encoding="utf-8",
)

os.chdir(workdir / "sub")  # se busca hacia arriba, no solo en cwd
assert config.load_dotenv() == workdir / ".env"

assert os.environ["ANTHROPIC_API_KEY"] == "sk-ant-desde-fichero"
assert os.environ["BICHO_MODEL"] == "claude-con-comillas", "las comillas se quitan"
assert os.environ["BICHO_PORT"] == "9999", "'export ' se ignora"
assert os.environ["BICHO_DB"] == "./espacios.db", "espacios alrededor del = se ignoran"
assert os.environ["YA_PUESTA"] == "del-entorno", "el entorno real manda sobre el .env"

os.chdir(tempfile.mkdtemp())  # sin .env en ningún sitio: no revienta
assert config.load_dotenv() is None

print("ok")
