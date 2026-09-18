# Fallos confirmados

Revisión de 2026-09-14, reproducida ejecutando el código y no leyéndolo.
La primera tanda está arreglada; lo que queda está más abajo y en
[`../TODO.md`](../TODO.md).

Contexto que conviene tener: **el Python está bien escrito**. Usa la API actual
de Anthropic correctamente (`output_config`, no el `output_format` obsoleto),
IDs de modelo reales, cliente perezoso, y los tests comprueban justo lo que
importa — `test_gate.py` demuestra que responder manda solo los trozos del tema
y no el libro. Los tres ficheros de test pasan. Lo de abajo es lo que se rompe
al salir del caso pequeño.

## Los dos repos de origen están absorbidos del todo

Comprobado el 2026-09-18, por ascendencia de commits y no a ojo. Los dos repos
de los que salió este monorepo ya no tienen nada que este no tenga, así que se
pueden dar por superados: lo que se trabaje a partir de ahora va aquí.

| Origen | Estado | Comprobación |
|---|---|---|
| `ArnauSamonRos/tamagochi` | Absorbido. Iba **21 commits por delante** (hasta `e911179`) y se fusionó en `apps/web`. | `git merge-base` daba `e6f0383`; los 21 commits están ahora en `main`. |
| `CarlosChuan/bicho` | Absorbido. **Parado desde el 2026-09-11.** | Su historia entera son dos commits, `6648b47` y `36a2985`, y los dos son ancestros de `main`. `master` es su única rama, y `36a2985` es su punta. |

El de Arnau siguió vivo tres días después del merge inicial porque era el que se
estaba tocando; todo lo que trajo es visual. El del cerebro no se tocó desde que
se fusionó.

Detalle de lo que entró con la web, en el propio commit de merge y en
[la sección de la web](#lado-web) de más abajo.

## Arreglado

### 1. El repaso tenía un techo 6× por debajo del máximo configurado

`study.repasar()` llamaba a `llm.ask_json()` sin `max_tokens`, así que usaba el
defecto de 2000. Su salida tiene que devolver *cada* concepto con sus variantes,
y eso crece con la entrada: a partir de ~60 KB de documento el JSON salía
cortado, `json.loads` reventaba, el `except` de `learn()` llamaba a `drop_doc()`
y se tiraban a la basura las llamadas ya pagadas. `MAX_DOC_CHARS` permite 400 KB.

Ahora el repaso va en lotes de `REVIEW_BATCH` (150) conceptos, con `max_tokens`
calculado a partir del tamaño del lote, y una segunda pasada sobre los nombres
resultantes para que dos lotes distintos no dejen `suma` y `sumas` sin unir.
Medido con 800 conceptos: 12 llamadas, el peor lote genera ~3.358 tokens contra
un `max_tokens` de 6.500, y no se pierde ninguno.

### 2. `trocear()` solo partía por `\n\n`

Un `.txt` con saltos de línea simples se convertía en **un solo trozo gigante**
(80.000 caracteres en un trozo, medido), lo que se cargaba la invariante central:
"ninguna llamada ve más de un trozo". `material/salud.txt`, del propio repo, no
tiene ni un `\n\n`.

Ahora hay una cascada: párrafos; el párrafo que no quepa se parte por líneas; la
línea que tampoco quepa, por caracteres. Ningún trozo puede pasarse de
`CHUNK_CHARS`, y el test lo comprueba con los tres casos.

### 3. No había CORS, y `OPTIONS` devolvía 501

La web de Vercel no podía llamar al cerebro. Ahora hay `do_OPTIONS`, cabeceras
`Access-Control-*` y `Vary: Origin`, con la lista blanca en
`BICHO_CORS_ORIGINS` (por defecto solo `localhost:5173`). Un origen que no esté
en la lista no recibe la cabecera.

### 4. Un POST malformado mataba la conexión

`json.loads` estaba fuera de `_guard`: un cuerpo vacío o inválido cerraba la
conexión con un traceback y sin respuesta, y todos los errores salían con HTTP
200. Ahora el parseo está dentro del despachador, hay un tipo `ApiError` con
estado y código estable, el cuerpo tiene tope de tamaño antes de leerlo, y el
traceback va al log en vez de al usuario.

### 5. `.env.example` contradecía a `config.py` y al README

Ponía `BICHO_MODEL_STUDY=claude-sonnet-5` cuando el defecto es
`claude-haiku-4-5` y el README dice "con Haiku". Quien seguía las instrucciones
ejecutaba en Sonnet la llamada que corre 100 veces por libro. Corregido, y
añadido `BICHO_MODEL_REVIEW`, que faltaba.

### 6. El comentario de `thinking` se contradecía con el código

`config.py` decía que Haiku 4.5 no acepta el parámetro y `study.py` se lo pasaba
igualmente. Ahora la extracción por trozo (Haiku, que no razona por defecto) no
lo pasa, el repaso y el chat (Sonnet) sí, y el comentario dice eso.

### 7. `/learned` devolvía `concepts` como un CSV

`group_concat` partía la lista en dos si un concepto tenía una coma. Ahora es
una lista de verdad, construida con una segunda consulta.

### 8. La API no tenía versión ni forma estable

Se aprovechó que no había ningún consumidor —la UI del cerebro se acababa de
borrar y `apps/web` aún no llama a nada— para alinear el servidor con
`contract/openapi.yaml`: prefijo `/v1`, claves en inglés (`state`, `read`,
`concepts`), `202` al aceptar un estudio, `409` si ya está estudiando, `413` si
el documento se pasa. Migrar costaba cero en ese momento y no habrá otro igual.

### 9. El catálogo del gate no se podía cachear

Iba dentro del mensaje del usuario, que es justo la parte no cacheable, y es
idéntico en todas las preguntas. Ahora va en el `system` con `cache_control`. En
`chat.py`, además, el bloque estable va delante del material: la caché es por
prefijo y con el material delante las instrucciones quedaban fuera del corte.

### 10. El servidor no dejaba rastro

`log_message` era un `pass`. En una máquina que no ves, eso es no tener nada.
Ahora hay una línea por petición (`método ruta -> estado  ms`), los errores van
con traceback al log, y `BICHO_LOG_LEVEL` sube el detalle. Nada de cuerpos ni de
texto de preguntas.

### 11. Dependencias y runtimes sin fijar

`anthropic>=1.0` resolvía a lo que hubiera ese día, y no había lockfile ni
versiones de runtime. Ahora: `requirements.lock` con versiones exactas,
`.python-version` (3.12), `.nvmrc` (22), `anthropic>=1.5,<2`, y CI probando el
suelo declarado (3.10) y el objetivo (3.12) para que desarrollo y producción no
se separen sin que nadie lo vea.

## Lo que queda

### Un solo cerebro global

`study.PROGRESO` es un `dict` a nivel de módulo y `gate.relevant_concepts()`
consulta los conceptos de **todos** los documentos sin filtrar por usuario.

Esto es **correcto** para un bicho personal en un servidor propio — y es una de
las razones por las que el Mac Mini encaja mejor que un serverless. Pero en
cuanto el túnel esté abierto al mundo, todos los visitantes comparten un bicho y
cualquiera puede enseñarle o borrarle cosas. Decisión de producto, no bug.

### Sin reintentos en una cadena de 100 llamadas

`ask_json` no reintenta. Estudiar son hasta 100 llamadas secuenciales; un 429 o
un 529 pasajero en la número 97 deshace el documento entero. Los trozos son
independientes entre sí, así que además se podrían lanzar en paralelo.

### Menores

- `PRAGMA foreign_keys` está **OFF** en toda conexión salvo la de `drop_doc()`,
  así que los `ON DELETE CASCADE` del esquema son inertes en el resto.
- `journal_mode` es `delete`, no `WAL`: el que escribe bloquea a los que leen.
- El `DELETE` de deduplicación en `apply_review()` recorre la tabla entera, no
  solo el documento que se acaba de repasar.
- Se tira `response.usage`, en un proyecto que va de coste.
- **No** hay fuga de conexiones SQLite: lo comprobé porque `connect()` no cierra
  explícitamente, pero el refcounting de CPython las recupera al instante (200
  llamadas en 0,03 s). No hay nada que arreglar ahí.

## Lado web

La UI sí se ha movido desde esta revisión: `apps/web` incorpora ahora los 21
commits que `ArnauSamonRos/tamagochi` siguió acumulando (arrastrar al bicho,
mareo, fondo de terreno, orbes de Vida/Hambre/Sed, física del salto). Todos son
visuales: ninguno toca nada de lo de abajo, salvo la primera regla de
`prefers-reduced-motion`. Lo esencial:

- **No existe ninguna capa de datos.** Ni `fetch`, ni URL base, ni datos falsos.
  Todas las estadísticas son constantes de módulo.
- **Faltan dos pantallas enteras**: no hay ningún input de fichero ni de texto
  para `/v1/study`, y la única superficie de salida es una burbuja de 32 px con
  el carácter `"?"` — no cabe una respuesta.
- `intelligenceAverage` (`src/App.jsx:452`) se calcula **al importar el módulo**:
  está congelado en 61 para siempre.
- `localStorage` dentro del inicializador de `useState` (`src/App.jsx:706-712`).
- Una sola regla de `prefers-reduced-motion` en 1.147 líneas de CSS, y solo cubre
  las dos ondas de los orbes: las ~32 animaciones y transiciones restantes no la
  miran, y el **único** control para abrir las estadísticas sigue siendo un botón
  que no para de moverse.
- `<html lang="en">` con todo el texto en español.
