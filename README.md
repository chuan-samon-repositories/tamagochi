# Tamagochi

Un tamagotchi que no sabe absolutamente nada hasta que le enseñas.
Le das un documento, lo estudia, y a partir de ahí solo puede hablar de eso.

Dos mitades, un repo, **dos destinos de despliegue distintos**:

| | Qué es | Dónde vive | Se despliega en |
|---|---|---|---|
| [`apps/bicho`](apps/bicho) | El cerebro. API en Python, SQLite, llamadas al LLM. | Servidor local (Mac Mini) | `launchd` + Cloudflare Tunnel — ver [`deploy/`](deploy) |
| [`apps/web`](apps/web) | La cara. React + Vite. | Vercel | Root Directory = `apps/web` |
| [`contract/`](contract) | El contrato HTTP entre las dos. | — | — |

El cerebro **no** se despliega en Vercel a propósito: estudiar un libro son minutos
de trabajo en segundo plano y el estado vive en un fichero SQLite. Las dos cosas
quieren un proceso que no se muera, y eso es justo lo que un servidor propio da
gratis. Ver [`docs/architecture.md`](docs/architecture.md).

## Arrancar en local

Las dos mitades son independientes: se arrancan en dos terminales.

```bash
# terminal 1 — el cerebro, en http://localhost:8777
cd apps/bicho
python -m venv .venv && .venv/bin/pip install -e .
cp .env.example .env          # y pon tu ANTHROPIC_API_KEY dentro
.venv/bin/bicho               # los endpoints cuelgan de /v1

# terminal 2 — la cara, en http://localhost:5173
cd apps/web
npm ci
npm run dev
```

## Tests

```bash
cd apps/bicho
for t in tests/*.py; do .venv/bin/python "$t"; done      # 4 ficheros, sin pytest

cd apps/web && npm run lint && npm run build
```

## Solo una mitad

El repo es pequeño (~35 ficheros), pero si en el servidor solo quieres el cerebro:

```bash
git clone --filter=blob:none --sparse git@github.com:chuan-samon-repositories/tamagochi.git
cd tamagochi
git sparse-checkout set apps/bicho contract deploy
```

## Estado

Unificado desde dos repos (`CarlosChuan/bicho` y `ArnauSamonRos/TAMAGOCHI`) con el
historial de ambos intacto. El cerebro cumple ya
[`contract/openapi.yaml`](contract/openapi.yaml); la web todavía no lo llama —
no tiene capa de datos.

Qué falta y en qué orden: [`TODO.md`](TODO.md).
Lo que se arregló y lo que queda: [`docs/known-issues.md`](docs/known-issues.md).
