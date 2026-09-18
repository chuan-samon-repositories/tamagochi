# apps/web

La cara del bicho. React 19 + Vite, todo cliente. Se despliega en **Vercel** con
*Root Directory* = `apps/web`.

```bash
npm ci
npm run dev      # http://localhost:5173
npm run lint
npm run build
```

## Cómo habla con el cerebro

Por el contrato de [`contract/openapi.yaml`](../../contract/openapi.yaml), que
sirve `apps/bicho` en `http://localhost:8777`.

**Hoy no habla.** No hay capa de datos: ni `fetch`, ni URL base, ni datos
falsos. Todas las estadísticas de la barra lateral son constantes de módulo
(`src/App.jsx:426-454`), y faltan dos pantallas enteras — no hay ninguna entrada
de fichero o texto para `/study`, y la única superficie de salida es una burbuja
de 32 px con un `"?"`, donde no cabe una respuesta. Ver
[`docs/known-issues.md`](../../docs/known-issues.md).

Para desarrollo, evita CORS con un proxy en `vite.config.js`:

```js
server: { proxy: { '/api': { target: 'http://localhost:8777', rewrite: p => p.replace(/^\/api/, '/v1') } } }
```

En producción, el mismo truco se hace con un `rewrite` de Vercel hacia el túnel
del Mac Mini — ver [`deploy/README.md`](../../deploy/README.md).

## La criatura

Nada es un bitmap ni un sprite. `blobatar` genera un SVG determinista a partir
de una semilla guardada en `localStorage`; el huevo es CSS puro (`border-radius`
de blob, `radial-gradient`, grietas por `clip-path`); el nido es SVG en línea con
un anillo de 16 elipses generado en JS. El movimiento son cuatro `@keyframes` más
un bucle `requestAnimationFrame` que escribe `transform` directamente sin pasar
por el estado de React.
