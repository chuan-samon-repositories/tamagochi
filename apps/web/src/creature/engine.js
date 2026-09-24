// La selección aleatoria ponderada y el cálculo de duraciones, como
// funciones puras: nada aquí toca el DOM ni un timer, así que se puede
// probar (y depurar) sin montar nada.
import { CREATURE_CONFIG as CFG } from './config'

export function isNight(hour) {
  const { nightHourStart, nightHourEnd } = CFG.modifiers
  return hour >= nightHourStart || hour < nightHourEnd
}

export function isMorning(hour) {
  const { morningHourStart, morningHourEnd } = CFG.modifiers
  return hour >= morningHourStart && hour < morningHourEnd
}

function applyMultiplier(weights, table, factor = 1) {
  for (const [state, mult] of Object.entries(table)) {
    if (state in weights) weights[state] *= mult ** factor
  }
}

/**
 * Calcula el peso de cada estado para el contexto actual. Devuelto como
 * objeto {estado: peso} para poder inspeccionarlo desde el panel de debug.
 */
export function computeWeights(ctx) {
  const weights = {}
  for (const [id, def] of Object.entries(CFG.states)) weights[id] = def.weight

  const mods = CFG.modifiers

  if (ctx.energyPct < mods.lowEnergyThreshold) {
    applyMultiplier(weights, mods.lowEnergy)
  }
  if (isNight(ctx.hour)) {
    applyMultiplier(weights, mods.night)
  }
  if (isMorning(ctx.hour)) {
    applyMultiplier(weights, mods.morning)
  }
  if (ctx.msSinceInteraction > mods.noInteractionMs) {
    applyMultiplier(weights, mods.noInteraction)
  }
  if (ctx.pettedUntil && ctx.now < ctx.pettedUntil) {
    applyMultiplier(weights, mods.petted)
  }
  if (ctx.sadOrSick) {
    applyMultiplier(weights, mods.sadOrSick)
  }

  // Nunca el mismo estado dos veces seguidas.
  if (ctx.lastState && ctx.lastState in weights) weights[ctx.lastState] = 0

  // Cooldowns: mientras estén activos, el estado no puede salir elegido.
  const inAcrobaticsCooldown =
    ctx.lastAcrobaticAt != null && ctx.now - ctx.lastAcrobaticAt < ctx.acrobaticsCooldownMs
  if (inAcrobaticsCooldown) {
    weights.saltoAlto = 0
  }

  return weights
}

function weightedPick(weights, rng = Math.random) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0)
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  if (total <= 0) return 'idle'
  let r = rng() * total
  for (const [id, w] of entries) {
    r -= w
    if (r <= 0) return id
  }
  return entries[entries.length - 1][0]
}

/** Elige el siguiente estado dado el contexto. Determinista si se le pasa `rng`. */
export function pickNextState(ctx, rng = Math.random) {
  const weights = computeWeights(ctx)
  return weightedPick(weights, rng)
}

/** Duración con ±30% de ruido, salvo "dormir" que se sortea directo en su rango. */
export function pickDuration(stateId, rng = Math.random) {
  const def = CFG.states[stateId] ?? CFG.extraDurations[stateId]
  if (!def) return 2000

  if (stateId === 'dormir') {
    return def.minMs + rng() * (def.maxMs - def.minMs)
  }

  const base = (def.minMs + def.maxMs) / 2
  const noise = CFG.durationNoise
  const factor = 1 - noise + rng() * noise * 2
  return Math.max(200, base * factor)
}

export function pickAcrobaticsCooldownMs(rng = Math.random) {
  const { acrobaticsMinMs, acrobaticsMaxMs } = CFG.cooldowns
  return acrobaticsMinMs + rng() * (acrobaticsMaxMs - acrobaticsMinMs)
}
