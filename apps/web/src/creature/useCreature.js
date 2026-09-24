// El "cerebro" de la animación: recorre los ocho estados de
// CREATURE_CONFIG, aplica sus modificadores y cooldowns, mantiene vivas las
// micro-animaciones propias de una granota (parpelleig, respiració, raucar)
// y reacciona a lo que el jugador hace con el bicho. No sabe nada de píxeles
// ni de rAF — eso lo decide quien pinte `state`.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CREATURE_CONFIG as CFG } from './config'
import {
  computeWeights,
  pickAcrobaticsCooldownMs,
  pickDelayBetween,
  pickDuration,
  pickNextState,
} from './engine'
import { DIZZY_STATES } from './expressions'

const FORCED_DURATION_MS = 24 * 60 * 60 * 1000 // el debug "fuerza" hasta que se le diga lo contrario

export function useCreature({ energyPct = 1, sanityPct = 1, hungerPct = 0 } = {}) {
  const [stateId, setStateId] = useState('idle')
  const [stateEntryId, setStateEntryId] = useState(0)
  const [reaction, setReaction] = useState(null)
  const [debugForced, setDebugForced] = useState(null)
  const [debugOpen, setDebugOpen] = useState(false)

  const energyRef = useRef(energyPct)
  const sanityRef = useRef(sanityPct)
  const hungerRef = useRef(hungerPct)
  energyRef.current = energyPct
  sanityRef.current = sanityPct
  hungerRef.current = hungerPct

  const stateIdRef = useRef(stateId)
  stateIdRef.current = stateId
  const debugForcedRef = useRef(debugForced)
  debugForcedRef.current = debugForced

  const lastInteractionRef = useRef(Date.now())
  const lastAcrobaticAtRef = useRef(null)
  const acrobaticsCooldownMsRef = useRef(pickAcrobaticsCooldownMs())
  const pettedUntilRef = useRef(0)
  const pendingQueueRef = useRef([])
  const timerRef = useRef(null)
  const reactionTimerRef = useRef(null)
  const tapTimestampsRef = useRef([])
  const petHoldTimerRef = useRef(null)
  const petHeldRef = useRef(false)

  const buildCtx = useCallback(() => {
    const now = Date.now()
    return {
      now,
      hour: new Date(now).getHours(),
      energyPct: energyRef.current,
      msSinceInteraction: now - lastInteractionRef.current,
      pettedUntil: pettedUntilRef.current,
      sadOrSick: sanityRef.current < CFG.modifiers.sadOrSickThreshold,
      lastState: stateIdRef.current,
      lastAcrobaticAt: lastAcrobaticAtRef.current,
      acrobaticsCooldownMs: acrobaticsCooldownMsRef.current,
    }
  }, [])

  const clearReactionSoon = useCallback((ms) => {
    clearTimeout(reactionTimerRef.current)
    reactionTimerRef.current = setTimeout(() => setReaction(null), ms)
  }, [])

  // --- El bucle principal: un estado termina, se elige el siguiente --------
  const scheduleNext = useCallback(
    (explicitId) => {
      clearTimeout(timerRef.current)

      let nextId = explicitId
      if (!nextId && pendingQueueRef.current.length) {
        nextId = pendingQueueRef.current.shift()
      }
      if (!nextId && debugForcedRef.current) {
        nextId = debugForcedRef.current
      }
      if (!nextId) {
        const picked = pickNextState(buildCtx())
        if (picked === 'dormir') {
          pendingQueueRef.current = [CFG.preSleep, 'dormir', CFG.postSleep]
          nextId = pendingQueueRef.current.shift()
        } else {
          nextId = picked
        }
      }

      if (nextId === 'saltoAlto' || nextId === 'voltereta') {
        lastAcrobaticAtRef.current = Date.now()
        acrobaticsCooldownMsRef.current = pickAcrobaticsCooldownMs()
      }
      const duration = debugForcedRef.current === nextId ? FORCED_DURATION_MS : pickDuration(nextId)

      setStateId(nextId)
      setStateEntryId((id) => id + 1)
      timerRef.current = setTimeout(() => scheduleNext(), duration)
    },
    [buildCtx],
  )

  useEffect(() => {
    timerRef.current = setTimeout(() => scheduleNext(), pickDuration('idle'))
    return () => clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Forzar un estado desde el panel de debug: corta lo que esté pasando y
  // se queda ahí hasta que se pida otra cosa.
  const forceState = useCallback(
    (id) => {
      setDebugForced(id)
      debugForcedRef.current = id
      pendingQueueRef.current = []
      if (id) scheduleNext(id)
      else scheduleNext()
    },
    [scheduleNext],
  )

  // --- Hambre alta: sustituye la ociosidad cada 30-60s -----------------------
  useEffect(() => {
    let cancelled = false
    let handle
    const tick = () => {
      const { hungerOverrideMinMs, hungerOverrideMaxMs, highHungerThreshold } = CFG.modifiers
      const delay = hungerOverrideMinMs + Math.random() * (hungerOverrideMaxMs - hungerOverrideMinMs)
      handle = setTimeout(() => {
        if (cancelled) return
        if (hungerRef.current > highHungerThreshold) {
          setReaction('hambre')
          clearReactionSoon(2000)
        }
        tick()
      }, delay)
    }
    tick()
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [clearReactionSoon])

  // --- Parpelleig: el que ponía blobatar solo, aquí a mano ---------------------
  const [blinking, setBlinking] = useState(false)
  useEffect(() => {
    let cancelled = false
    let handle
    const loop = () => {
      const { blinkMinMs, blinkMaxMs, blinkDurationMs } = CFG.micro
      handle = setTimeout(() => {
        if (cancelled) return
        if (stateIdRef.current !== 'dormir') {
          setBlinking(true)
          setTimeout(() => {
            if (!cancelled) setBlinking(false)
          }, blinkDurationMs)
        }
        loop()
      }, pickDelayBetween(blinkMinMs, blinkMaxMs))
    }
    loop()
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [])

  // --- Respiració: alterna entre "idle" i "breath" mientras está de pie ------
  const [breathPhase, setBreathPhase] = useState(false)
  useEffect(() => {
    const id = setInterval(() => setBreathPhase((p) => !p), CFG.micro.breathCycleMs / 2)
    return () => clearInterval(id)
  }, [])

  // --- Raucar: la granota infla la gola de tanto en tanto, quieta o botant ---
  useEffect(() => {
    let cancelled = false
    let handle
    const loop = () => {
      const { minMs, maxMs, durationMs } = CFG.croak
      handle = setTimeout(() => {
        if (cancelled) return
        if (stateIdRef.current === 'idle' || stateIdRef.current === 'quieto') {
          setReaction('croar')
          clearReactionSoon(durationMs)
        }
        loop()
      }, pickDelayBetween(minMs, maxMs))
    }
    loop()
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [clearReactionSoon])

  // --- Interacción -------------------------------------------------------------
  const registerInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now()
  }, [])

  const registerTap = useCallback(() => {
    registerInteraction()
    const now = Date.now()
    const { laughTapCount, laughWindowMs, angryTapCount, angryWindowMs, reactionMs } = CFG.interaction
    const taps = [...tapTimestampsRef.current, now].filter((t) => now - t < angryWindowMs)
    tapTimestampsRef.current = taps

    if (taps.filter((t) => now - t < angryWindowMs).length >= angryTapCount) {
      setReaction('enfado')
      clearReactionSoon(reactionMs)
    } else if (taps.filter((t) => now - t < laughWindowMs).length >= laughTapCount) {
      setReaction('risa')
      clearReactionSoon(reactionMs)
    }
  }, [clearReactionSoon, registerInteraction])

  const startPet = useCallback(() => {
    registerInteraction()
    petHeldRef.current = false
    clearTimeout(petHoldTimerRef.current)
    petHoldTimerRef.current = setTimeout(() => {
      petHeldRef.current = true
      setReaction('acariciado')
    }, CFG.interaction.petHoldMs)
  }, [registerInteraction])

  const endPet = useCallback(() => {
    clearTimeout(petHoldTimerRef.current)
    if (petHeldRef.current) {
      pettedUntilRef.current = Date.now() + CFG.modifiers.pettedBoostMs
      clearReactionSoon(CFG.interaction.petVibrateMs)
    }
    petHeldRef.current = false
  }, [clearReactionSoon])

  const cancelPet = useCallback(() => {
    clearTimeout(petHoldTimerRef.current)
    petHeldRef.current = false
  }, [])

  const [asking, setAskingState] = useState(false)
  const setAsking = useCallback((value) => {
    setAskingState(value)
    if (value) registerInteraction()
  }, [registerInteraction])

  // --- Lo que se pinta ---------------------------------------------------------
  const activeReaction = asking ? 'preguntando' : reaction
  const dizzyEyes = !activeReaction && DIZZY_STATES.has(stateId)

  const isMoving = CFG.movingStates.includes(stateId)

  const debug = useMemo(
    () => ({
      open: debugOpen,
      setOpen: setDebugOpen,
      forced: debugForced,
      forceState,
      weights: computeWeights(buildCtx()),
    }),
    [debugOpen, debugForced, forceState, buildCtx],
  )

  return {
    state: stateId,
    stateEntryId,
    isMoving,
    dizzyEyes,
    blinking,
    breathPhase,
    reaction: activeReaction,
    petted: Date.now() < pettedUntilRef.current,
    registerTap,
    registerInteraction,
    startPet,
    endPet,
    cancelPet,
    setAsking,
    debug,
  }
}
