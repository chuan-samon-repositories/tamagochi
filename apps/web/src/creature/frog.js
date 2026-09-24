// El puente entre nuestra máquina de estados (useCreature) y el generador
// de granotes portado de github.com/ArnauSamonRos/RANA (./granota.js,
// ./vista3d.js). Aquí solo se decide QUÉ pose (y hacia dónde) pintar para
// cada estado nuestro; el cómo se ve cada pose y vista, y la propia
// generación infinita a partir de una semilla, es enteramente de RANA.
import { Granota } from './granota'
import { Granota3D } from './vista3d'

/** Una llavor de 32 bits determinista a partir de cualquier string (el seed
 * de localStorage, pensado para blobatar, sirve igual para Granota). */
export function seedFromString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Estado (o reacción) nuestro -> pose de Granota. `undefined` deja que quien
// llama decida (p. ej. según la fase del salto).
const STATE_POSE = {
  quieto: 'idle',
  bostezo: 'half',
  estirarse: 'half',
  aburrido: 'half',
  vibrar: 'breath',
  dormir: 'blink',
}

/** Pose durante un salto (idle en cadena o salto alto), a partir del
 * progreso 0..1 ya calculado por el motor de saltos. */
export function hopPose(t) {
  if (t < 0.12) return 'crouch'
  if (t < 0.3) return 'takeoff'
  if (t < 0.85) return 'air'
  return 'fall'
}

/** La pose de Granota para el fotograma actual: salto por encima de estado. */
export function poseFor({ mode, hopT, state }) {
  if (mode === 'hop' || mode === 'chain-hop') return hopPose(hopT)
  return STATE_POSE[state] || 'idle'
}

// --- Hacia dónde mira: el giro de 45° en 45° de RANA (src/joc.js) ----------
// yaw 0..7: 0 = de cara, 2 = a la derecha, 4 = de espaldas, 6 = a la
// izquierda. "Moverse hacia abajo en pantalla es venir hacia la cámara."
export const TURN_STEP_MS = 70

export function yawOf(dx, dy) {
  return ((Math.round(Math.atan2(dx, dy) / (Math.PI / 4)) % 8) + 8) % 8
}

export function yawStep(from, to) {
  const d = ((to - from + 12) % 8) - 4
  return d === 0 ? from : (from + Math.sign(d) + 8) % 8
}

export function turnSteps(from, to) {
  return Math.abs(((to - from + 12) % 8) - 4)
}

const frogCache = new Map()

/** La instancia de Granota (genoma + caché de fotogramas de cara) para una
 * semilla. Las vistas giradas se cachean aparte, en `yaw3dCache`. */
export function getFrog(seed) {
  let f = frogCache.get(seed)
  if (!f) {
    f = Granota.create(seed)
    frogCache.set(seed, f)
  }
  return f
}

const yaw3dCache = new WeakMap()

function frameFor(frog, pose, lx, ly, yaw) {
  if (!yaw) return frog.frame(pose, lx, ly, 0)
  let cache = yaw3dCache.get(frog)
  if (!cache) {
    cache = new Map()
    yaw3dCache.set(frog, cache)
  }
  const key = pose + '|' + yaw
  let f = cache.get(key)
  if (!f) {
    f = Granota3D.render(frog.g, pose, yaw)
    cache.set(key, f)
  }
  return f
}

/** Dibuja una pose (de cara o girada) sobre un canvas cuadrado de `size` px,
 * con el punto de apoyo de la granota (sus pies) anclado a `anchorY` (0..1,
 * desde arriba). La vista de cara y las giradas tienen su propia cuadrícula
 * (ver ./granota.js y ./vista3d.js), así que cada una escala contra la suya
 * para ocupar proporcionalmente el mismo sitio en el canvas. */
export function drawFrog(ctx, frog, pose, lx, ly, size, anchorY = 0.86, yaw = 0) {
  const frame = frameFor(frog, pose, lx, ly, yaw)
  const viewGW = yaw ? Granota3D.GW : Granota.GW
  const scale = size / viewGW
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, size, size)
  const x = size / 2 - frame.cx * scale
  const y = size * anchorY - frame.g * scale
  ctx.drawImage(frame.canvas, x, y, frame.canvas.width * scale, frame.canvas.height * scale)
}
