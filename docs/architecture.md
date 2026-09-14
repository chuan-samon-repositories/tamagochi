# Por qué el cerebro no va en Vercel

La web va a Vercel. El cerebro va a un Mac Mini. No es pereza: son dos formas
distintas y las dos están bien elegidas.

## Lo que pide el cerebro

**Un proceso que no se muera.** Estudiar un documento es una llamada al LLM por
cada trozo de ~4.000 caracteres, en serie. Con el máximo configurado son hasta
**100 llamadas seguidas**, minutos de trabajo. `POST /study` contesta al momento
y el trabajo real sigue en un hilo; la UI pregunta por `/progress`.

**Un disco de verdad.** El cerebro entero es un fichero SQLite. Resetear el bicho
es borrarlo, compartirlo es copiarlo. Eso es una decisión de diseño buena y vale
la pena conservarla.

Un serverless no da ninguna de las dos. En Vercel el sistema de ficheros es de
solo lectura salvo `/tmp`, que es por instancia y no sobrevive; su propia
documentación dice que SQLite no se puede usar allí.

## Lo que costaría forzarlo

Se puede — lo comprobé — pero cuesta:

- **SQLite → Turso.** `db.py` se reescribe contra un cliente HTTP en v0.1.0.
- **Partir `study.learn()`.** El bucle se descompone en N+2 invocaciones
  independientes (1 de arranque, 1 por trozo, 1 de repaso), cada una una sola
  llamada al LLM. Lo probé y da el mismo resultado que el bucle entero: solo
  `doc_id`, un entero, cruza entre pasos. Son ~25 líneas. Pero además hay que
  orquestarlas desde el navegador o con Vercel Workflows.
- **`study.PROGRESO` a la base de datos.** Un `dict` de módulo no sobrevive a
  instancias que van y vienen.

Nada de eso es necesario con un proceso propio. Es aproximadamente una semana de
trabajo que el Mac Mini borra del plan.

## Lo que el Mac Mini cuesta a cambio

Lo que se ahorra en refactor se paga en operaciones, y está en
[`../deploy/README.md`](../deploy/README.md): HTTPS obligatorio (el navegador
bloquea `http://` desde una página servida por HTTPS), exposición por túnel,
supervisión con `launchd`, copias de seguridad, y —la importante— **límite de
gasto y autenticación**, porque `/study` expuesto es una manera anónima de
gastar saldo de Anthropic.

Es un intercambio bueno para este proyecto. Sería uno malo si el bicho tuviera
que aguantar tráfico real o estar disponible con garantías.

## La frontera

`contract/openapi.yaml`. Las dos mitades se despliegan por separado y en sitios
distintos, así que van a estar desincronizadas a ratos: por eso el contrato se
versiona (`/v1`) y por eso vive en el mismo repo que las dos, para que un cambio
de forma sea un commit y no dos que hay que coordinar.
