// Qué cara pone blobatar para cada estado y para cada reacción. Centralizado
// aquí porque son las únicas 14 poses que existen (blobatar no tiene boca:
// todo lo cuentan los ojos), así que hay que repartirlas con cuidado.
import {
  idle,
  happy,
  sad,
  mad,
  surprised,
  wink,
  sleepy,
  smug,
  unsure,
  scared,
  love,
  sick,
  thinking,
} from 'blobatar/expression'

// Estados del sorteo -> expresión por defecto mientras dura ese estado.
export const STATE_EXPRESSION = {
  idle,
  quieto: idle,
  deslizarse: idle,
  saltoAlto: surprised,
  voltereta: undefined, // ojos en espiral, ver DizzyEyes
  bostezo: sleepy,
  aburrido: sleepy,
  vibrar: happy,
  dormir: sleepy,
  esconderse: idle,
  estirarse: sleepy,
  hambre: sad,
}

// Estados con ojos en espiral en vez de la cara normal (mareo por giro).
export const DIZZY_STATES = new Set(['voltereta'])

// Reacciones a interacción y eventos raros, por encima de lo que sea que
// esté haciendo el estado de fondo.
export const REACTION_EXPRESSION = {
  preguntando: unsure,
  risa: happy,
  enfado: mad,
  acariciado: love,
  hipo: surprised,
  estornudo: surprised,
  poseGraciosa: smug,
  mosca: surprised,
  eructo: wink,
  susto: scared,
  pensando: thinking,
}

export function emotionExpression(emotion) {
  switch (emotion) {
    case 'feliz':
      return happy
    case 'triste':
      return sad
    case 'enfadado':
      return mad
    case 'sorprendido':
      return surprised
    case 'asustado':
      return scared
    case 'enfermo':
      return sick
    case 'curioso':
      return unsure
    default:
      return undefined
  }
}
