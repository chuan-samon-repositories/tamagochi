# TODO

Lista viva. Lo que se hace se borra de aquí; si algo necesita explicación larga,
va a `docs/` y aquí se queda el enlace.

Formato: `- [ ] (ámbito) qué — por qué`, donde ámbito es `api`, `web`, `infra`
o `todo` cuando toca las dos mitades.

## Ahora

- [ ] **(infra) Autenticación y límite de gasto antes de abrir el túnel.**
      `POST /v1/study` son hasta 100 llamadas de pago y hoy no pide nada a
      nadie. El límite de gasto en la consola de Anthropic va primero porque no
      depende de acertar con lo demás. Ver `deploy/README.md`.
- [ ] **(web) Capa de datos.** No existe: ni `fetch`, ni URL base, ni datos
      falsos. Contra `contract/openapi.yaml`.
- [ ] **(web) Pantalla para dar de comer.** No hay ningún input de fichero ni de
      texto para `/v1/study`.
- [ ] **(web) Sitio donde se lea la respuesta.** La única salida hoy es una
      burbuja de 32 px con un `"?"`; no cabe una frase.
- [ ] **(web) Sacar `localStorage` del inicializador de `useState`**
      (`src/App.jsx:706-712`) y hacer reactivo `intelligenceAverage`
      (`src/App.jsx:452`), que está congelado desde que se importa el módulo.

## Observabilidad

- [ ] **(todo) PostHog en toda la plataforma.** Hoy el cerebro escribe una línea
      por petición con `logging` y ya está: sirve para mirar un fallo concreto,
      no para saber si el bicho se usa ni dónde se atasca la gente.
      - **API:** eventos de `study` (documento aceptado, trozos, duración,
        resultado) y de `ask` (si el gate abrió o no — esa proporción es *la*
        métrica del producto). Sin texto de documentos ni de preguntas.
      - **Web:** embudo del huevo (cuántos llegan a incubar y a poner nombre),
        primera pregunta, primer documento.
      - **Antes de ponerlo:** decidir qué NO se manda. El contenido que la gente
        enseña al bicho es suyo; los eventos llevan números, no texto.
      - Quizá sea pronto. Cuando haya usuarios de verdad, no antes.
- [ ] **(infra) Rotar `~/Library/Logs/bicho.log`.** `launchd` no rota nada: el
      fichero crece hasta que llene el disco. `newsyslog.d` o un cron.
- [ ] **(api) Registrar `usage` de las respuestas.** El proyecto entero va de
      coste y ahora mismo se tira `response.usage` sin mirarlo.

## Deuda conocida

Detalle y reproducción en [`docs/known-issues.md`](docs/known-issues.md).

- [ ] **(api) Reintentos en la cadena de estudio.** Son hasta 100 llamadas
      seguidas; un 429 o un 529 en la número 97 deshace el documento entero.
      Los trozos son independientes: también se podrían lanzar en paralelo.
- [ ] **(api) Un cerebro por usuario.** Hoy `study.PROGRESO` es un `dict` de
      módulo y el gate consulta los conceptos de todos los documentos. Correcto
      para un bicho personal; imprescindible antes de abrirlo a más gente.
- [ ] **(api) `PRAGMA foreign_keys` está OFF** salvo en `drop_doc()`, así que
      los `ON DELETE CASCADE` del esquema son inertes en el resto.
- [ ] **(api) `journal_mode=WAL`.** Ahora es `delete`: quien escribe bloquea a
      quien lee, y `/study` escribe cada pocos segundos mientras `/ask` lee.
- [ ] **(web) Accesibilidad:** `prefers-reduced-motion` (hay una sola regla en
      1.147 líneas de CSS y solo cubre las dos ondas de los orbes: el resto de
      las ~32 animaciones y transiciones no la miran, y el único control para
      abrir las estadísticas sigue siendo un botón que no para de moverse),
      `inert` en los paneles colapsados, `lang="es"`, y anillos de
      `:focus-visible`.
- [ ] **(web) Partir `App.jsx`** por las costuras antes de meterle la capa de
      datos, no después.

## Algún día

- [ ] **(api) Elegir mejor qué trozos entran en una respuesta.** Hoy se cortan
      por orden de lectura (`MAX_CHUNKS_PER_ANSWER`); hacerlo bien pide
      embeddings.
- [ ] **(api) Gate en local con Ollama** si el servidor es Apple Silicon. Corre
      en cada pregunta y es pura clasificación: `BICHO_MODEL_GATE=ollama/...`.
- [ ] **(todo) Decidir el idioma de los mensajes de commit.** `apps/bicho` los
      tiene en castellano, `apps/web` en inglés por herencia.
