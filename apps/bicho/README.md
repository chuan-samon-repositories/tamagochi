# Bicho

Un tamagotchi que no sabe absolutamente nada hasta que le enseñas.
Le das un documento, lo estudia, y a partir de ahí solo puede hablar de eso.

## Arrancar

```bash
python -m venv .venv && .venv/bin/pip install -e .
cp .env.example .env         # y pon tu ANTHROPIC_API_KEY dentro
.venv/bin/bicho              # o: .venv/bin/python -m bicho
```

Los endpoints cuelgan de `http://localhost:8777/v1` y su forma está en
`contract/openapi.yaml`. La interfaz vive en `apps/web`.

## Estructura

```
.env.example    Plantilla de configuración. Cópiala a .env (que no se commitea).
src/bicho/
  config.py     Modelo, rutas, puerto y lector de .env. Todo lo ajustable.
  llm.py        Frontera con el proveedor. Cambiar de LLM se hace aquí.
  db.py         SQLite. El cerebro entero es un fichero (docs, chunks, concepts).
  prompts.py    Todo lo que lee el modelo. El carácter del bicho se afina aquí.
  study.py      Enseñarle: trocear -> leer trozo a trozo -> repasar.
  gate.py       ¿Lo sabe? El corazón del proyecto.
  chat.py       Hablar: pasa el gate o responde que no sabe.
  server.py     Los endpoints. Estudiar va en segundo plano.
  fake.py       Un proveedor que ya se lo sabía todo: el entorno de pruebas.
tests/
  test_gate.py    El estudio y el gate con un LLM falso. Sin API, sin frameworks.
  test_server.py  CORS, códigos de estado y cuerpos mal formados.
  test_config.py  El lector de .env.
  test_llm.py     El enrutado por prefijo de modelo.
  test_fake.py    El proveedor falso: schemas, determinismo y cero llamadas.
```

## Cómo funciona

**Estudiar**, en tres fases:

1. **Trocear** — el documento se parte en trozos de ~4.000 caracteres sin cortar
   párrafos. Ninguna llamada ve más de un trozo, así que no hay techo de contexto.
2. **Leer** — un trozo cada vez, con Haiku, sacando qué enseña ese trozo. Tarda en
   proporción al libro (eso es el juego) y cuesta poco (eso es la factura).
3. **Repasar** — Sonnet mira solo la lista de nombres, nunca el texto: unifica
   variantes (`sumas` + `suma`), agrupa lo disperso (`llevar` → `suma llevando`) y
   tira el ruido (`errores comunes`). Cuesta lo mismo con un folio que con una
   enciclopedia, y de su calidad depende todo lo de abajo.

**Responder**, en dos:

4. **El gate** — Haiku decide qué conceptos aprendidos hacen falta para la
   pregunta. Ninguno → el bicho dice que no lo sabe y ahí acaba, sin gastar más.
5. **Contestar** — Sonnet recibe **solo los trozos que enseñan esos conceptos**,
   no el libro entero. Por eso responder cuesta lo mismo con 15 KB que con 300
   páginas.

El truco no está en el modelo, está en el gate. Un LLM ya sabe matemáticas; lo
que no puede hacer es contestar si el gate no le deja.

## Sin gastar: `bicho --fake`

```bash
.venv/bin/bicho --fake        # mismo servidor, mismo contrato, cero tokens
curl localhost:8777/v1/health # {"fake": true, ...}
```

`fake/` es un backend más, como `ollama/`: lo elige el prefijo del modelo y no
hay ningún modo aparte en el resto del código. Estudia, repasa, pasa por el gate
y contesta igual que el de verdad; lo que devuelve lo saca del propio texto, así
que cualquier documento da un cerebro creíble.

Se puede mezclar, que es donde más se nota: el gate falso y el chat de verdad
sirve para afinar `prompts.CHAT` sin pagar una clasificación en cada iteración.

```bash
BICHO_MODEL_GATE=fake/x .venv/bin/bicho
```

| Variable | Para qué |
|---|---|
| `BICHO_FAKE_DELAY_MS` (120) | Lo que tarda cada respuesta. Con 0, estudiar acaba antes del primer sondeo y `reading`/`sorting` no se ven nunca. |
| `BICHO_FAKE_FAIL_AT` (0) | Revienta al leer el trozo N. Para probar el rollback. |
| `BICHO_FAKE_FAIL_WORD` (`kaboom`) | Una pregunta que la lleve devuelve un 502. |

De aquí salen también las fixtures del mock de `apps/web`
(`python scripts/record-fixtures.py`), que es lo que mantiene las dos mitades
diciendo lo mismo.

## Ajustes

| Qué | Dónde |
|---|---|
| Bicho demasiado tonto / demasiado listo | `prompts.GATE` |
| Calidad del vocabulario aprendido | `prompts.REVIEW` |
| Cuánto tarda en estudiar / tamaño de trozo | `BICHO_CHUNK_CHARS` (4000) |
| Cuánto material entra en cada respuesta | `BICHO_MAX_CHUNKS` (6) |
| Personalidad y tono | `prompts.CHAT`, `prompts.NO_IDEA` |
| Modelo de cada tarea | `.env` (`BICHO_MODEL_STUDY`, `BICHO_MODEL_GATE`, `BICHO_MODEL_CHAT`) |
| Puerto, ruta del cerebro | `.env` (`BICHO_PORT`, `BICHO_DB`) |

El `.env` se busca desde el directorio actual hacia arriba. Lo que ya esté en el
entorno real gana sobre el fichero, así que `BICHO_PORT=9000 bicho` sigue mandando.

Resetear el bicho: borra `~/.bicho/brain.db`.

## Sin API: modelos locales

El prefijo del modelo elige el backend, así que se pueden mezclar por tarea.

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:7b
```

```bash
# en .env — los tres en local
BICHO_MODEL_STUDY=ollama/qwen2.5:7b
BICHO_MODEL_GATE=ollama/qwen2.5:7b
BICHO_MODEL_CHAT=ollama/qwen2.5:7b
```

Con 8 GB de VRAM un 7B cuantizado entra entero en la GPU. El gate va incluso más
rápido que por API. Lo que se nota es el chat: los modelos pequeños se salen del
material con más facilidad, que es justo lo que sostiene la ilusión. Si tienes
saldo, la mezcla que más rinde es el gate en local y el chat en la API.

`OLLAMA_HOST` apunta a otra máquina si el modelo no corre en esta.

## Tests

```bash
for t in tests/*.py; do .venv/bin/python "$t"; done
```

Ninguno llama a la API: `test_gate.py` sustituye `llm.ask`/`llm.ask_json` por
falsos y `test_fake.py` apunta `llm._anthropic`/`llm._ollama` a algo que
revienta. Que siga siendo así.
