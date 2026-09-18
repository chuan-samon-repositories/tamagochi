# El contrato

`apps/bicho` sirve estos endpoints. `apps/web` los consume. Este directorio es la
única fuente de verdad de esa frontera: **si cambia la forma de una respuesta,
cambia aquí primero**, en el mismo commit que toca las dos mitades.

Tener las dos mitades en el mismo repo sirve exactamente para esto: un cambio de
contrato es un commit y un PR, no dos que hay que sincronizar a mano.

- [`openapi.yaml`](openapi.yaml) — la especificación, legible por máquina.

`GET /health` dice si al otro lado hay un cerebro de verdad o el de pruebas
(`bicho --fake`), que sirve el mismo contrato y no gasta tokens. La web lo usa
para no confundirlos, que es el error que cuesta dinero.

## Estado: el cerebro ya lo cumple

Lo que antes era una lista de diferencias pendientes está hecho. `apps/bicho`
sirve `/v1`, con claves en inglés, `concepts` como lista y códigos de estado de
verdad. `tests/test_server.py` lo comprueba.

Se aprovechó que en ese momento no había **ningún** consumidor: se acababa de
borrar la UI que traía el cerebro y `apps/web` todavía no llama a nada. Migrar
costaba cero y no habrá otro momento así.

## Lo que sigue sin estar

| | Estado |
|---|---|
| Autenticación | **Sin decidir.** En cuanto el Mac Mini esté expuesto, `/v1/study` es una manera anónima de gastar saldo de Anthropic. Opciones en [`deploy/README.md`](../deploy/README.md). |
| Un cerebro por usuario | Hoy hay uno solo y global. Correcto para un bicho personal, no para abrirlo. |
| Que algo verifique el contrato contra el servidor | **A medias, y ya no a ojo.** `scripts/record-fixtures.py` graba las respuestas de un bicho de verdad (con el proveedor falso) en `apps/web/src/api/fixtures/`, y CI falla si dejan de coincidir: cambiar la forma de una respuesta sin tocar la web es ahora un CI rojo. Lo que sigue sin comprobarse es que esas respuestas cumplan el YAML; eso pide un validador de OpenAPI. |

Detalle en [`docs/known-issues.md`](../docs/known-issues.md) y
[`TODO.md`](../TODO.md).
