# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A tamagotchi that knows nothing until you teach it. You give it a document, it
studies it, and from then on it can only talk about that.

Two halves, one repo, **two different deploy targets** — this asymmetry is the
single most important thing to hold in your head:

| | Stack | Deploys to |
|---|---|---|
| `apps/bicho` | Python (floor 3.10, target 3.12), stdlib `http.server`, SQLite. One dependency: `anthropic`. | A **local Mac Mini**, never Vercel |
| `apps/web` | React 19 + Vite, all client-side | Vercel, Root Directory `apps/web` |

`apps/bicho` does not go serverless on purpose: studying a book is minutes of
sequential LLM calls in a background thread, and the entire brain is one SQLite
file on disk. See `docs/architecture.md` before proposing to move it.

## Commands

```bash
# brain
cd apps/bicho
python -m venv .venv
.venv/bin/pip install -r requirements.lock # exact versions, same as CI
.venv/bin/pip install -e .
cp .env.example .env                      # needs ANTHROPIC_API_KEY
.venv/bin/bicho                           # endpoints under http://localhost:8777/v1

# a single test (they are plain scripts — no pytest, no framework)
.venv/bin/python tests/test_gate.py        # the pipeline + gate, with a fake LLM
.venv/bin/python tests/test_server.py      # CORS, status codes, malformed bodies
.venv/bin/python tests/test_config.py      # the .env parser
.venv/bin/python tests/test_llm.py         # model-prefix backend routing

# web
cd apps/web
npm ci && npm run dev                      # http://localhost:5173
npm run lint                               # oxlint
npm run build
```

No test runner, no formatter, no TypeScript. Tests exit non-zero on failure and
print `ok` on success. **No test calls a real API** — `test_gate.py` swaps
`llm.ask`/`llm.ask_json` for fakes; keep it that way.

## Architecture: the gate is the point

The pipeline spans `study.py` → `db.py` → `gate.py` → `chat.py` and doesn't make
sense one file at a time.

**Studying** (`study.learn`), three phases:
1. `trocear()` splits the document into ~4000-char chunks on paragraph
   boundaries. No single LLM call ever sees more than one chunk, so there is no
   context ceiling — the limit is time and money, not window size.
2. One cheap call per chunk extracts what that chunk *teaches*; `db.add_chunk`
   stores the chunk text alongside its concept names.
3. `repasar()` sends **only the list of concept names, never the text** to a
   smarter model, which unifies variants and drops noise. This costs the same
   for a pamphlet as for an encyclopedia, and it determines the quality of
   everything downstream.

**Answering** (`chat.answer`), two phases:
4. `gate.relevant_concepts()` asks a cheap model which learned concepts the
   question needs. Empty list → the creature says it doesn't know, and **no
   further call is made**.
5. `db.chunks_for()` returns only the chunks teaching those concepts, and those
   become the `MATERIAL` system block.

The LLM already knows everything; `gate.py` is the only thing sustaining the
illusion that the creature knows only what it studied. Changes that make the
gate more permissive break the product, not just a test.

**Consequences to respect:**
- The concept vocabulary is global across all documents (`db.concept_names()`
  with no filter) and `study.PROGRESO` is a module-level dict — one brain, one
  study at a time. Correct for a personal pet on a dedicated box; it is what
  would have to change first for multi-user.
- A failed study is rolled back entirely (`db.drop_doc`) — a half-learned book
  is worse than none, because the gate would reach it anyway.
- `db.SCHEMA_VERSION` exists and there are **no migrations**. Bump it when
  `SCHEMA` changes; old brains are told to delete the file.

## Where the seams are

- **`llm.py` is the only file that talks to a provider.** Backend is chosen by
  model-name prefix: `ollama/...` → local Ollama, anything else → Anthropic.
  Adding a provider means adding a prefix here and nowhere else.
- **`prompts.py` holds everything the model reads.** Personality and gate
  strictness are tuned here, not in logic.
- **`config.py` reads env at import time.** Tests rebind `config.DB_PATH` etc.
  *after* import and it works because `db.py`/`study.py` read `config.X` at call
  time — preserve that; don't capture config values into module-level locals.

## Conventions

- **Spanish in the code, deliberately.** Public API names are English
  (`learn`, `answer`, `connect`); internals, comments and docs are Spanish
  (`trocear`, `repasar`, `PROGRESO`). All prompts and the creature's voice are
  Spanish — `prompts.NO_IDEA` is product, not filler. Match the surrounding file.
- Comments prefixed `# ponytail:` mark deliberate omissions with the condition
  that would justify building the real thing. They are decisions, not TODOs.
- Commit-message language is **unsettled**: `apps/bicho`'s history is Spanish,
  `apps/web`'s inherited history is English. Follow the half you're editing
  until someone decides; don't silently convert either.

## The contract between the halves

`contract/openapi.yaml` is the HTTP boundary and **`apps/bicho` now satisfies
it**: everything is under `/v1`, keys are English (`state`, `read`, `concepts`),
`concepts` is a list, and errors carry real status codes plus a stable
`error.code`. `tests/test_server.py` covers this. If you change the shape of a
response, change the contract in the same commit — having both halves in one
repo exists precisely so that is one PR and not two.

`apps/web` does not call any of it yet; it has no data layer at all.

## What is still open

`docs/known-issues.md` lists what was fixed and what remains; `TODO.md` is the
working list. The two that constrain design decisions:

- **No authentication, and one global brain.** `POST /v1/study` is up to 100
  paid calls and asks nothing of anyone. Fine on a private box; it is the first
  thing to solve before the tunnel is open. Per-user brains mean changing both
  `study.PROGRESO` and `gate`'s unfiltered concept lookup.
- **No retries across a 100-call chain.** One transient 429/529 rolls back the
  whole document. Chunks are independent, so this is also where parallelism
  would go.

`apps/web` has **no data layer at all** — no `fetch`, no base URL, no mock data;
every stat is a module constant. Wiring it up means building that layer plus two
UI surfaces that don't exist (study intake, and somewhere to render an answer).

## Things that are load-bearing and easy to break

- `tests/` must never call a real API. `test_gate.py` swaps `llm.ask`/`ask_json`
  for fakes and CI runs it with a junk key to prove it.
- The review runs in batches of `study.REVIEW_BATCH` with `max_tokens` derived
  from batch size. Sending the whole concept list in one call is what used to
  discard an entire paid study run.
- `trocear()` guarantees no chunk exceeds `CHUNK_CHARS`. The whole
  no-context-ceiling claim rests on it.
- Cacheable content goes first in a `system` list, volatile content last, with
  `cache_control` on the last stable block. Caching is prefix-based.
