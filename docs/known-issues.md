# Fallos confirmados

Revisión de 2026-09-14, antes de unificar los repos. Todos reproducidos
ejecutando el código, no leyéndolo. Nada de esto está arreglado todavía.

Contexto que conviene tener: **el Python está bien escrito**. Usa la API actual
de Anthropic correctamente (`output_config`, no el `output_format` obsoleto),
IDs de modelo reales, cliente perezoso, y los tests comprueban justo lo que
importa — `test_gate.py` demuestra que responder manda solo los trozos del tema
y no el libro. Los tres ficheros de test pasan. Lo de abajo es lo que se rompe
al salir del caso pequeño.

## 1. El repaso tiene un techo 6× por debajo del máximo configurado

`study.repasar()` llama a `llm.ask_json()` sin pasar `max_tokens`, así que usa el
defecto: **2000**. Pero su salida tiene que devolver *cada* concepto como
`nombre` más todas sus `variantes`. Estimación medida:

| Documento | Trozos | Conceptos | Salida necesaria | |
|---|---|---|---|---|
| 15 KB | 4 | 32 | ~465 tokens | ok |
| 97 KB | 25 | 200 | ~2.933 tokens | **se corta** |
| 390 KB | 100 | 800 | ~12.027 tokens | **se corta** |

Al cortarse, el JSON queda incompleto → `json.loads` lanza → el `except` de
`study.learn()` llama a `db.drop_doc()` y **tira a la basura las 100 llamadas de
pago que acababa de hacer**. `MAX_DOC_CHARS` son 400.000 caracteres y el README
presume de libros de 300 páginas: el máximo configurado está ~6× por encima del
punto donde el sistema falla. Es el fallo más caro de la lista.

## 2. `trocear()` solo parte por `\n\n`

Un `.txt` con saltos de línea simples produce **un solo trozo gigante**:

```
80.000 caracteres sin ninguna línea en blanco -> 1 trozo de 80.000 caracteres
```

`material/salud.txt`, del propio repo, tiene **cero** `\n\n`. Es pequeño y no
molesta, pero el formato es real y está dentro. Con un documento grande así se
rompe la invariante central del proyecto ("ninguna llamada ve más de un trozo"):
el vocabulario del gate se queda en 8 conceptos para el libro entero y
`chunks_for()` devuelve ese trozo único como "material" — es decir, manda el
libro entero, justo lo que el README dice que no hace.

Arreglo: caer a `\n` simple, y luego a corte por caracteres, cuando no haya
párrafos.

## 3. Sin CORS, y `OPTIONS` devuelve 501

Medido contra un servidor real:

```
GET /learned    -> sin cabecera Access-Control-Allow-Origin
OPTIONS /ask    -> 501 Unsupported method
```

**La web en Vercel no puede llamar al cerebro.** Bloqueo número uno para unir las
dos mitades. Y no basta con añadir la cabecera: hace falta `do_OPTIONS` para el
preflight.

## 4. Un POST malformado mata la conexión

`json.loads(...)` está **fuera** de `_guard` (`server.py:27`):

```
POST /ask  sin cuerpo        -> RemoteDisconnected, el cliente se queda sin respuesta
POST /ask  con JSON inválido -> RemoteDisconnected
POST /ask  sin la clave "q"  -> 200 {"error": "KeyError: 'q'"}
```

Además todos los errores salen con **HTTP 200**, y el mensaje es el `repr` de la
excepción, que no es algo que enseñar a un usuario.

## 5. `.env.example` contradice a `config.py` y al README

```
.env.example:  BICHO_MODEL_STUDY=claude-sonnet-5
config.py:     MODEL_STUDY = ... "claude-haiku-4-5"
README:        "Leer — un trozo cada vez, con Haiku"
```

El README manda hacer `cp .env.example .env`, así que quien siga las
instrucciones ejecuta en **Sonnet 5** ($2/$10 por MTok) la llamada que corre 100
veces por libro, en vez de en **Haiku 4.5** ($1/$5). El doble de coste en la
línea que domina la factura, en silencio. Falta además `BICHO_MODEL_REVIEW` en
el fichero.

## 6. Un solo cerebro global

`study.PROGRESO` es un `dict` a nivel de módulo y `gate.relevant_concepts()`
consulta los conceptos de **todos** los documentos sin filtrar por usuario.

Esto es **correcto** para un bicho personal en un servidor propio — y es una de
las razones por las que el Mac Mini encaja mejor que un serverless. Pero en
cuanto el túnel esté abierto al mundo, todos los visitantes comparten un bicho y
cualquiera puede enseñarle o borrarle cosas. Decisión de producto, no bug.

## 7. Sin reintentos en una cadena de 100 llamadas

`ask_json` no reintenta ("Sin reintentos", dice su docstring). Estudiar son hasta
100 llamadas secuenciales; un 429 o un 529 pasajero en la número 97 deshace el
documento entero. Los trozos son independientes entre sí, así que además se
podrían lanzar en paralelo.

## 8. El comentario de `thinking` se contradice con el código

`config.py` dice *"Haiku 4.5 no acepta este parámetro: por eso es opcional"*,
pero `study.py:49` le pasa `thinking={"type": "disabled"}` a `MODEL_STUDY`, que
por defecto **es** Haiku 4.5. Mientras tanto `gate.py` —el sitio donde el aviso
aplicaría— no le pasa nada. Haiku 4.5 no razona por defecto, así que el
parámetro sobra; lo que hay que arreglar es que el comentario y el código digan
lo mismo.

## Menores

- `PRAGMA foreign_keys` está **OFF** en toda conexión salvo la de `drop_doc()`,
  así que los `ON DELETE CASCADE` del esquema son inertes en el resto.
- `journal_mode` es `delete`, no `WAL`: el que escribe bloquea a los que leen.
  Con `/study` escribiendo cada pocos segundos mientras `/ask` lee, WAL ayuda.
- El `DELETE` de deduplicación en `apply_review()` recorre la tabla entera, no
  solo el documento que se acaba de repasar.
- `/learned` devuelve `concepts` como un CSV de `group_concat`: un concepto con
  una coma parte la lista en dos.
- **No** hay fuga de conexiones SQLite: lo comprobé porque `connect()` no cierra
  explícitamente, pero el refcounting de CPython las recupera al instante (200
  llamadas en 0,03 s). No hay nada que arreglar ahí.

## Lado web

Detalle completo en la revisión; lo esencial:

- **No existe ninguna capa de datos.** Ni `fetch`, ni URL base, ni datos falsos.
  Todas las estadísticas son constantes de módulo.
- **Faltan dos pantallas enteras**: no hay ningún input de fichero ni de texto
  para `/study`, y la única superficie de salida es una burbuja de 26 px con el
  carácter `"?"` — no cabe una respuesta.
- `intelligenceAverage` (`src/App.jsx:220`) se calcula **al importar el módulo**:
  está congelado en 61 para siempre.
- `localStorage` dentro del inicializador de `useState` (`src/App.jsx:487-493`)
  — hay que sacarlo de ahí igualmente, y es lo que bloquearía un port a Next.
- Cero `prefers-reduced-motion` en 892 líneas de CSS, y el **único** control para
  abrir las estadísticas es un botón que no para de moverse.
- `<html lang="en">` con todo el texto en español.
