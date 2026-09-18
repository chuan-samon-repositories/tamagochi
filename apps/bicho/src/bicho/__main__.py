"""Arrancar el bicho. `--fake` lo arranca sin proveedor de pago."""
import sys

from . import config, fake
from .server import serve

# Cualquier nombre vale: lo único que mira llm.py es el prefijo.
MODELO_FALSO = f"{fake.PREFIJO}mentirijillas"


def _de_mentira():
    """Los cuatro modelos al proveedor falso. Se puede reasignar `config` después
    de importarlo porque db/study/gate/chat leen `config.X` en cada llamada."""
    config.MODEL_STUDY = MODELO_FALSO
    config.MODEL_REVIEW = MODELO_FALSO
    config.MODEL_GATE = MODELO_FALSO
    config.MODEL_CHAT = MODELO_FALSO
    print("El bicho arranca DE MENTIRA: no va a llamar a ningún proveedor ni a "
          "gastar un token.\nPara un cerebro de verdad, arráncalo sin --fake.")


def main():
    if "--fake" in sys.argv:
        _de_mentira()
    try:
        serve()
    except KeyboardInterrupt:
        print("\nEl bicho se duerme.")


if __name__ == "__main__":
    main()
