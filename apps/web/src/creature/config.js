// Todo lo que gobierna cómo se comporta el bicho cuando no le estás
// preguntando nada: qué estado elige, cuánto dura, qué lo hace más o menos
// probable, y los eventos que le pasan por su cuenta. Un único objeto para
// poder tocar números sin tocar lógica.

export const CREATURE_CONFIG = {
  // --- Los ocho estados, con su peso base y su duración base en ms --------
  // El peso decide qué tan probable es que salga elegido; la duración es el
  // punto medio del rango pedido y luego se le aplica ±30% de ruido al
  // vuelo (ver engine.js), salvo "dormir", que ya es un rango ancho a
  // propósito y se sortea directamente dentro de él.
  states: {
    idle: { weight: 30, minMs: 3000, maxMs: 6000 },
    quieto: { weight: 20, minMs: 2000, maxMs: 5000 },
    saltoAlto: { weight: 8, minMs: 1000, maxMs: 1000 },
    voltereta: { weight: 6, minMs: 1000, maxMs: 1000 },
    bostezo: { weight: 5, minMs: 1500, maxMs: 1500 },
    aburrido: { weight: 4, minMs: 3000, maxMs: 3000 },
    vibrar: { weight: 3, minMs: 2000, maxMs: 2000 },
    dormir: { weight: 3, minMs: 30000, maxMs: 120000 },
  },

  // Estados que mueven al bicho por la pantalla (motor de saltos ya
  // existente); el resto se anima sobre su sitio.
  movingStates: ['idle', 'saltoAlto', 'voltereta'],

  // Antes de dormir siempre hay bostezo, y al despertar siempre hay
  // estiramiento — se insertan a mano, no salen del sorteo.
  preSleep: 'bostezo',
  postSleep: 'estirarse',

  durationNoise: 0.3, // ±30%

  // Estados fuera del sorteo, insertados a mano (ver preSleep/postSleep).
  extraDurations: {
    estirarse: { minMs: 700, maxMs: 1100 },
  },

  // --- Modificadores: multiplican pesos según el contexto ------------------
  modifiers: {
    lowEnergyThreshold: 0.3,
    lowEnergy: {
      dormir: 10,
      bostezo: 4,
      saltoAlto: 0.4,
      voltereta: 0.4,
    },
    nightHourStart: 23,
    nightHourEnd: 7, // [23:00, 7:00)
    night: {
      dormir: 5,
      // "movimiento" = cualquier estado que no sea quedarse quieto.
      saltoAlto: 0.5,
      voltereta: 0.5,
      vibrar: 0.5,
    },
    morningHourStart: 7,
    morningHourEnd: 9, // [7:00, 9:00)
    morning: {
      bostezo: 3,
    },
    noInteractionMs: 5 * 60 * 1000,
    noInteraction: {
      aburrido: 3,
    },
    highHungerThreshold: 0.7,
    // Cada 30-60s, mientras el hambre esté alta, la ociosidad se sustituye
    // por la animación de hambre en vez de salir del sorteo normal.
    hungerOverrideMinMs: 30000,
    hungerOverrideMaxMs: 60000,
    // Recién acariciado: saltos, volteretas y vibrar el doble de probables.
    pettedBoostMs: 90 * 1000, // 1-2 min, punto medio
    petted: {
      saltoAlto: 2,
      voltereta: 2,
      vibrar: 2,
    },
    sadOrSickThreshold: 0.3, // salud mental por debajo de esto
    sadOrSick: {
      aburrido: 3,
      saltoAlto: 0.3,
      voltereta: 0.3,
      vibrar: 0.3,
    },
  },

  // --- Cooldowns -------------------------------------------------------------
  cooldowns: {
    // Salto alto y voltereta comparten cooldown: uno bloquea al otro.
    acrobaticsMinMs: 15000,
    acrobaticsMaxMs: 20000,
  },

  // --- Interacción -----------------------------------------------------------
  interaction: {
    laughTapCount: 3,
    laughWindowMs: 2000,
    angryTapCount: 8,
    angryWindowMs: 3000,
    reactionMs: 1200,
    petHoldMs: 550,
    petVibrateMs: 1800,
    dragMoveThresholdPx: 6,
  },

  // --- Micro-animaciones continuas: las que ya traían las granotes de RANA
  // (parpelleig, respiració, gola inflada en pose "puff") en vez de las
  // ocurrencias inventadas para el bicho anterior. ---------------------------
  micro: {
    blinkMinMs: 2000,
    blinkMaxMs: 6000,
    blinkDurationMs: 140,
    breathCycleMs: 1400,
  },

  // Raucar: la granota infla la gola (puff1 -> puff2 -> idle) de tanto en
  // tanto mientras está quieta o botant.
  croak: {
    minMs: 8000,
    maxMs: 18000,
    durationMs: 900,
  },
}

export const STATE_IDS = Object.keys(CREATURE_CONFIG.states)
