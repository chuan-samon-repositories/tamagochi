# El contrato

`apps/bicho` sirve estos endpoints. `apps/web` los consume. Este directorio es la
única fuente de verdad de esa frontera: **si cambia la forma de una respuesta,
cambia aquí primero**, en el mismo commit que toca las dos mitades.

Tener las dos mitades en el mismo repo sirve exactamente para esto: un cambio de
contrato es un commit y un PR, no dos que hay que sincronizar a mano.

- [`openapi.yaml`](openapi.yaml) — la especificación, legible por máquina.

## Aviso: esto es el objetivo, no el presente

`openapi.yaml` describe **v1, lo que queremos**. La implementación actual de
`apps/bicho` todavía no lo cumple. Diferencias, todas pendientes:

| Hoy | v1 | Por qué |
|---|---|---|
| Sin prefijo de versión | `/v1/...` | El servidor y la UI se despliegan por separado y en sitios distintos: van a estar desincronizados a ratos. |
| `/progress` devuelve `estado`, `leidos`, `conceptos` | `state`, `read`, `concepts` | Hoy `/progress` habla español y `/ask` inglés, en la misma API. Elegir uno. El castellano se queda donde importa: los prompts y la voz del bicho. |
| `concepts` es un string CSV (`group_concat`) | array de strings | Un concepto con una coma parte la lista en dos. |
| Los errores son `200 {"error": "..."}` | Código HTTP real + `{"error": {...}}` | Un `200` con un error dentro no lo detecta ningún cliente, proxy ni monitor. |
| Sin CORS, `OPTIONS` responde `501` | CORS + preflight | Comprobado contra un servidor real: **la web en Vercel hoy no puede llamar al cerebro**. Esto es el bloqueo número uno. |
| Sin autenticación | Pendiente de decidir | Ver [`deploy/README.md`](../deploy/README.md) — en cuanto el Mac Mini esté expuesto, `/study` es una forma anónima de gastar tu saldo de Anthropic. |

Detalle y reproducción de cada uno en [`docs/known-issues.md`](../docs/known-issues.md).
