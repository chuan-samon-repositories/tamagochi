import { source } from '../api'

// Which brain is answering, and a way to pick the other one. Two buttons and
// not one toggle: a single pill that reads "de mentira" and takes you to the
// real brain says one thing and does the opposite, which is a bad way to learn
// that the real brain costs money.
const OPTIONS = [
  {
    value: 'mock',
    label: 'de mentira',
    title: 'Bicho de mentira: se inventa las respuestas y no gasta nada.',
  },
  {
    value: 'live',
    label: 'de verdad',
    title: 'Bicho de verdad: sabe lo que ha estudiado, y cada pregunta cuesta dinero.',
  },
]

export function SourceBadge() {
  // A production build already talking to the real brain has nothing to say.
  if (source === 'live' && !import.meta.env.DEV) return null

  return (
    <div className="source-switch" role="group" aria-label="Con qué bicho hablar">
      {OPTIONS.map((option) => {
        const active = source === option.value
        return (
          <a
            key={option.value}
            className={`source-option source-option--${option.value} ${active ? 'source-option--on' : ''}`}
            href={`?api=${option.value}`}
            title={option.title}
            aria-current={active ? 'true' : undefined}
          >
            {option.label}
          </a>
        )
      })}
    </div>
  )
}
