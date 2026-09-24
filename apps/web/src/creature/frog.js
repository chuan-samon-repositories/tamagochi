// El puente entre nuestra máquina de estados (useCreature) y el generador
// de granotes portado de github.com/ArnauSamonRos/RANA (./granota.js).
// Aquí solo se decide QUÉ pose de Granota pintar para cada estado nuestro;
// el cómo se ve cada pose, y la propia generación infinita a partir de una
// semilla, es enteramente de RANA.
import { Granota } from './granota'
import { CREATURE_CONFIG as CFG } from './config'

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

/** Pose durante un salto (idle en cadena, salto alto o voltereta), a partir
 * del progreso 0..1 ya calculado por el motor de saltos. */
export function hopPose(t) {
  if (t < 0.12) return 'crouch'
  if (t < 0.3) return 'takeoff'
  if (t < 0.85) return 'air'
  return 'fall'
}

/** Raucar: infla la gola y la deshincha (puff1 -> puff2 -> puff1). */
function croakPose(elapsedMs) {
  const half = CFG.croak.durationMs / 2
  return elapsedMs < half ? 'puff1' : 'puff2'
}

/** La pose de Granota para el fotograma actual: reacción > salto > estado,
 * con el parpelleig y la respiració (propios de la granota) por encima de
 * todo salvo cuando el salto o el "croar" ya están cambiando la cara. */
export function poseFor({ mode, hopT, state, reaction, reactionElapsedMs, blinking, breathPhase }) {
  if (reaction === 'croar') return croakPose(reactionElapsedMs)
  if (mode === 'hop' || mode === 'chain-hop') return hopPose(hopT)
  if (blinking && state !== 'dormir') return 'blink'
  const pose = STATE_POSE[state] || 'idle'
  return pose === 'idle' && breathPhase ? 'breath' : pose
}

const frogCache = new Map()

/** La instancia de Granota (genoma + caché de fotogramas) para una semilla. */
export function getFrog(seed) {
  let f = frogCache.get(seed)
  if (!f) {
    f = Granota.create(seed)
    frogCache.set(seed, f)
  }
  return f
}

/** Dibuja una pose sobre un canvas cuadrado de `size` px, con el punto de
 * apoyo de la granota (sus pies) anclado a `anchorY` (0..1, desde arriba). */
export function drawFrog(ctx, frog, pose, lx, ly, size, anchorY = 0.86) {
  const frame = frog.frame(pose, lx, ly, 0)
  const scale = size / Granota.GW
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, size, size)
  const x = size / 2 - frame.cx * scale
  const y = size * anchorY - frame.g * scale
  ctx.drawImage(frame.canvas, x, y, frame.canvas.width * scale, frame.canvas.height * scale)
}
