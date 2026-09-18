// A brain in the browser: no server, no network, no tokens.
//
// The payloads come from ../fixtures, which are RECORDED from a real bicho
// running the fake provider (scripts/record-fixtures.py) and checked in CI, so
// the shapes here cannot drift away from the contract.
//
// The behaviour around them — which concepts a document teaches, whether a
// question gets through the gate — is a deliberately small approximation of
// src/bicho/fake.py. It is good enough to build a UI against, and it is not
// what decides anything in production.
import { ApiError } from './error'
import learnedFixture from './fixtures/learned.json'
import seedDoc from './fixtures/seed-doc.json'
import noIdea from './fixtures/no-idea.json'
import healthFixture from './fixtures/health.json'

// Roughly what the fake brain takes per call (BICHO_FAKE_DELAY_MS), so the
// spinners get built against something honest.
const LATENCY_MS = 140
const CHUNK_CHARS = 4000
const MS_PER_CHUNK = 260
const SORTING_MS = 900
// A document's vocabulary is the union over its chunks, so it is a good deal
// larger than the 8-per-chunk cap the real prompt asks for.
const MAX_DOC_CONCEPTS = 24
const STORAGE_KEY = 'bicho:mock'

// Words Arnau can type to force a state that is otherwise hard to catch.
// Documented in apps/web/README.md.
const MAGIC = { fail: 'kaboom', slow: 'lento' }

const STOP = new Set(
  ('ahora algunas algunos antes aqui asi aunque bien cada como cosa cosas cual cuales cuanto '
   + 'cuando debajo desde despues dice dicen donde ejemplos encima entonces entre escribo esta '
   + 'estas este estos forma hace hacen hacer hasta luego manera menos mientras misma mismo '
   + 'mucho muchas muchos nunca otra otras otro otros para parte pero poco pone porque puede '
   + 'pueden queda quedan sale siempre sino sobre solo tambien tener tengo tiene tienen tienes '
   + 'toda todas todo todos vale vamos veces').split(' '),
)

const GENERIC = new Set(
  'orden ejemplo error introduccion resumen nota ejercicio apartado capitulo seccion indice'
    .split(' '),
)

const plain = (text) => text.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')

// \p{L} and not \w: JavaScript's \w is ASCII even under /u, so 'fotosíntesis'
// came out as 'fotos' + 'ntesis' and half the vocabulary was nonsense. Python's
// \W is unicode-aware, which is why fake.py can get away with it.
const words = (text) => text.toLowerCase().match(/\p{L}{4,}/gu) || []

// Same approximation as fake._raiz: joins 'sumas' with 'suma' and stops there.
function root(word) {
  const w = plain(word)
  if (w.length > 5 && w.endsWith('es')) return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('s')) return w.slice(0, -1)
  return w
}

function conceptsOf(text) {
  const counts = new Map()
  const first = new Map()
  words(text).forEach((word, i) => {
    if (STOP.has(plain(word))) return
    counts.set(word, (counts.get(word) || 0) + 1)
    if (!first.has(word)) first.set(word, i)
  })

  const groups = new Map()
  for (const word of counts.keys()) {
    const key = root(word)
    if (!groups.has(key) || word.length < groups.get(key).length) groups.set(key, word)
  }

  return [...groups.values()]
    .filter((word) => !GENERIC.has(plain(word)))
    .sort((a, b) => counts.get(b) - counts.get(a) || first.get(a) - first.get(b))
    .slice(0, MAX_DOC_CONCEPTS)
    .sort((a, b) => a.localeCompare(b, 'es'))
}

// --- the stored brain --------------------------------------------------------

function seed() {
  const docs = learnedFixture.map((doc) => ({ ...doc }))
  if (docs[0]) docs[0].text = seedDoc.text
  return { docs, run: null, result: { state: 'idle' } }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const stored = JSON.parse(raw)
      return {
        docs: stored.docs ?? seed().docs,
        run: stored.run ?? null,
        result: stored.result ?? { state: 'idle' },
      }
    }
  } catch {
    // private mode, or a fixture change that invalidated what was stored
  }
  return seed()
}

let brain = load()

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(brain))
  } catch {
    // the brain just does not survive the reload; everything else still works
  }
}

export function reset() {
  brain = seed()
  save()
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// --- the contract ------------------------------------------------------------

export async function health() {
  await wait(LATENCY_MS)
  return { ...healthFixture, mock: true }
}

export async function learned() {
  await wait(LATENCY_MS)
  // The stored chunk text is ours, not the server's: it never crosses /learned.
  return brain.docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    added_at: doc.added_at,
    chunks: doc.chunks,
    concepts: doc.concepts,
  }))
}

export async function study(title, text) {
  await wait(LATENCY_MS)
  if (!title?.trim() || !text?.trim()) {
    throw new ApiError('bad_request', "Hacen falta 'title' y 'text'.", 400)
  }
  const current = runState()
  if (current.state === 'reading' || current.state === 'sorting') {
    throw new ApiError('already_studying', 'Ya estoy estudiando otra cosa, espera a que acabe.', 409)
  }

  const slow = plain(title).includes(MAGIC.slow)
  brain.run = {
    title,
    text,
    startedAt: Date.now(),
    total: Math.max(1, Math.ceil(text.length / CHUNK_CHARS)),
    perChunk: MS_PER_CHUNK * (slow ? 6 : 1),
    fails: plain(title).includes(MAGIC.fail),
  }
  save()
  return { started: true }
}

export async function progress() {
  await wait(LATENCY_MS / 2) // polling should feel cheaper than asking
  const state = runState()
  save()
  return state
}

export async function ask(q) {
  await wait(LATENCY_MS)
  if (!q?.trim()) throw new ApiError('bad_request', "Hace falta una pregunta en 'q'.", 400)
  if (plain(q).includes(MAGIC.fail)) {
    throw new ApiError('upstream_failed', 'Algo ha fallado hablando con el modelo.', 502)
  }

  const roots = new Set(words(q).map(root))
  const hits = brain.docs.filter((doc) =>
    doc.concepts.some((concept) => words(concept).some((w) => roots.has(root(w)))),
  )
  if (!hits.length) {
    return { knows: false, text: noIdea[Math.floor(Math.random() * noIdea.length)] }
  }
  return { knows: true, text: compose(hits, roots) }
}

// --- the bits that pretend ---------------------------------------------------

const OPENERS = ['¡Eso me lo sé!', 'A ver, que lo he estudiado:', '¡Ah, eso! Mira:']

// Headings are upper-case in the material we ship, and on their own they read
// badly as an answer ("¡Eso me lo sé! SUMAS Y RESTAS DESDE CERO").
function isHeading(sentence) {
  const letters = sentence.match(/\p{L}/gu) || []
  return letters.length > 0 && letters.filter((c) => c === c.toUpperCase()).length > letters.length * 0.6
}

function compose(docs, roots) {
  const material = docs.map((doc) => doc.text || '').join(' ')
  const sentences = material
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && !isHeading(s))
  const relevant = sentences.filter((s) => words(s).some((w) => roots.has(root(w))))
  const picked = (relevant.length ? relevant : sentences).slice(0, 2)
  const opener = OPENERS[Math.floor(Math.random() * OPENERS.length)]
  return picked.length ? `${opener} ${picked.join(' ')}` : '...se me ha ido la cabeza. ¿Otra vez?'
}

// Progress is derived from the clock rather than from a timer, so it survives
// a component remount and reports the same thing however often it is polled.
// `done` and `error` stay put until the next study, the same way the server's
// study.PROGRESO does: the UI is allowed to poll one more time.
function runState() {
  const run = brain.run
  if (!run) return brain.result

  const elapsed = Date.now() - run.startedAt
  const reading = Math.min(run.total, Math.floor(elapsed / run.perChunk))

  if (run.fails && reading >= Math.ceil(run.total / 2)) {
    brain.run = null
    // A half-learned book is worse than none: the real brain drops the whole
    // document too (study.learn), so nothing is added here either.
    brain.result = { state: 'error', error: 'RuntimeError: petardazo de mentira' }
    return brain.result
  }
  if (reading < run.total) {
    return { state: 'reading', read: reading, total: run.total }
  }
  if (elapsed < run.total * run.perChunk + SORTING_MS) {
    return { state: 'sorting', read: run.total, total: run.total }
  }

  const concepts = conceptsOf(run.text)
  if (!brain.docs.some((doc) => doc.title === run.title && doc.text === run.text)) {
    brain.docs.push({
      id: brain.docs.length + 1,
      title: run.title,
      added_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      chunks: run.total,
      concepts,
      text: run.text,
    })
  }
  brain.run = null
  brain.result = { state: 'done', read: run.total, total: run.total, concepts }
  return brain.result
}
