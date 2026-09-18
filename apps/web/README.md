# apps/web

La cara del bicho. React 19 + Vite, todo cliente. Se despliega en **Vercel** con
*Root Directory* = `apps/web`.

```bash
npm ci
npm run dev      # http://localhost:5173
npm run lint
npm run build
```

## Probar el bicho sin gastar nada

**El bicho del preview es de mentira.** Contesta, aprende lo que le des y se
queda con ello, pero se lo está inventando: no llama a ningún modelo y no cuesta
un céntimo. Arriba a la derecha pone «de mentira» para que no haya dudas.

Así que se puede trastear todo lo que haga falta: darle documentos, preguntarle,
reiniciarlo y volver a empezar.

Tres palabras mágicas, para ver cosas que si no cuesta pillar:

| Escribe esto | Y pasa esto |
|---|---|
| `kaboom` en una pregunta | se atraganta: sale el mensaje de error |
| `lento` en el título de un documento | tarda mucho en estudiar, para mirar la barra con calma |
| `kaboom` en el título de un documento | se le atraganta el documento a medias y no aprende nada |

El botón de reiniciar (arriba a la derecha) devuelve al huevo **y** deja el
cerebro como estaba: vuelve a saber solo el libro de sumas y restas.

Para hablar con el bicho de verdad —el de casa de Carlos, que sí cuesta dinero—
se añade `?api=live` al final de la dirección. Con `?api=mock` se vuelve. La
elección se recuerda entre recargas.

## Cómo habla con el cerebro

Por el contrato de [`contract/openapi.yaml`](../../contract/openapi.yaml). Todo
pasa por `src/api/`, que es lo único que sabe que existe un servidor:

```
src/api/
  index.js     elige adaptador (?api= -> localStorage -> VITE_BICHO_API -> mock)
  live.js      un bicho de verdad por HTTP
  mock.js      un cerebro en el navegador, sin red
  fixtures/    GRABADAS de un bicho real: scripts/record-fixtures.py
  error.js     ApiError {code, message, status}, igual salga de donde salga
src/useBicho.js   el hook: preguntar, estudiar, sondear el progreso
```

Las fixtures **no se escriben a mano**. Se graban de un `bicho --fake` y CI
comprueba que siguen siendo lo que el servidor devuelve; si no, el mock mentiría
y la interfaz se rompería el día que hable con la API de verdad.

Qué adaptador toca se decide aquí y solo aquí, y lo que cambia es el transporte,
nunca un flag que lea el servidor: si el cliente pudiera decirle al servidor
«esta es gratis», ese sería el fallo que acaba encontrando un desconocido.

Variables en [`.env.example`](.env.example). Contra el bicho de casa:

```bash
cd apps/bicho && .venv/bin/bicho --fake   # cero tokens
cd apps/web   && npm run dev              # y abre http://localhost:5173/?api=live
```

En producción el `/api` lo sirve un `rewrite` de Vercel hacia el túnel del Mac
Mini ([`vercel.json.example`](vercel.json.example) y
[`deploy/README.md`](../../deploy/README.md)), que es mismo origen: sin CORS, y
funciona también desde un preview, cuyo dominio por rama nunca podría estar en
`BICHO_CORS_ORIGINS`.

## La criatura

Nada es un bitmap ni un sprite. `blobatar` genera un SVG determinista a partir
de una semilla guardada en `localStorage`; el huevo es CSS puro (`border-radius`
de blob, `radial-gradient`, grietas por `clip-path`); el nido es SVG en línea con
un anillo de 16 elipses generado en JS. El movimiento son cuatro `@keyframes` más
un bucle `requestAnimationFrame` que escribe `transform` directamente sin pasar
por el estado de React.
