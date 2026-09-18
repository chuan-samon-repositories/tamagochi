import { source } from '../api'

// Which brain is answering. Confusing the test one with the real one is the
// mistake that costs money, so it says so on screen — but only when there is
// something to say: a production build talking to the real brain shows nothing.
export function SourceBadge() {
  if (source === 'live' && !import.meta.env.DEV) return null

  const other = source === 'live' ? 'mock' : 'live'
  return (
    <a
      className={`source-badge source-badge--${source}`}
      href={`?api=${other}`}
      title={
        source === 'mock'
          ? 'Bicho de mentira: respuestas inventadas, no gasta nada. Toca para ir al de verdad.'
          : 'Bicho de verdad: cada pregunta cuesta dinero. Toca para volver al de mentira.'
      }
    >
      {source === 'mock' ? 'de mentira' : 'de verdad'}
    </a>
  )
}
