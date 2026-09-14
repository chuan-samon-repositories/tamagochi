# El contrato

`apps/bicho` sirve estos endpoints. `apps/web` los consume. Este directorio es la
única fuente de verdad de esa frontera: **si cambia la forma de una respuesta,
cambia aquí primero**, en el mismo commit que toca las dos mitades.

Tener las dos mitades en el mismo repo sirve exactamente para esto: un cambio de
contrato es un commit y un PR, no dos que hay que sincronizar a mano.

- [`openapi.yaml`](openapi.yaml) — la especificación, legible por máquina.

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
| Que algo verifique el contrato contra el servidor | CI comprueba que el YAML es válido y que sus `$ref` resuelven, no que el servidor responda lo que promete. Hoy lo cubre `test_server.py` a mano. |

Detalle en [`docs/known-issues.md`](../docs/known-issues.md) y
[`TODO.md`](../TODO.md).
