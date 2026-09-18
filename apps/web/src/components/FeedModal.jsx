import { useState } from 'react'

// The study intake: a title, some text, and a bar while the creature reads.
// A .txt is read in the browser and posted as text, because that is what the
// contract takes — the brain never sees a file.
const READABLE = '.txt,.md,text/plain,text/markdown'

export function FeedModal({ progress, error, onStudy, onClose }) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const state = progress?.state
  const busy = state === 'reading' || state === 'sorting'
  const total = progress?.total || 0
  const read = progress?.read || 0
  const percent = busy && total ? Math.round((read / total) * 100) : 0

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setText(await file.text())
    setTitle((current) => current || file.name)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!title.trim() || !text.trim() || sending) return
    setSending(true)
    try {
      await onStudy(title.trim(), text)
    } catch {
      // the hook keeps the error; the panel below shows it
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="feed-overlay">
      <form className="feed-card" onSubmit={handleSubmit}>
        <button type="button" className="feed-close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
        <h2 className="feed-title">Dale de comer</h2>
        <p className="feed-subtitle">
          Solo va a saber hablar de lo que le enseñes aquí.
        </p>

        <label className="feed-label" htmlFor="feed-name">
          Título
        </label>
        <input
          id="feed-name"
          className="feed-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="sumas-y-restas.txt"
          maxLength={120}
          disabled={busy}
        />

        <label className="feed-label" htmlFor="feed-text">
          Texto
        </label>
        <textarea
          id="feed-text"
          className="feed-textarea"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Pega aquí lo que quieras que estudie..."
          rows={7}
          disabled={busy}
        />

        <label className="feed-file">
          <input type="file" accept={READABLE} onChange={handleFile} disabled={busy} />
          <span>o sube un archivo de texto</span>
        </label>

        {busy && (
          <div className="feed-progress">
            <div className="feed-progress-track">
              <div
                className={`feed-progress-fill ${state === 'sorting' ? 'feed-progress-fill--sorting' : ''}`}
                style={{ width: `${state === 'sorting' ? 100 : percent}%` }}
              />
            </div>
            <p className="feed-progress-label">
              {state === 'sorting'
                ? 'Ordenando lo que ha aprendido...'
                : `Leyendo ${total ? `${read} de ${total}` : ''}...`}
            </p>
          </div>
        )}

        {state === 'done' && (
          <p className="feed-done">
            ¡Listo! Ha aprendido {progress.concepts?.length || 0} cosas nuevas.
          </p>
        )}

        {(state === 'error' || error) && (
          <p className="feed-error">
            {error?.code === 'already_studying'
              ? 'Está estudiando otra cosa, espera a que acabe.'
              : 'Se le ha atragantado. No ha aprendido nada de esto.'}
          </p>
        )}

        <button
          className="feed-submit"
          type="submit"
          disabled={busy || sending || !title.trim() || !text.trim()}
        >
          {busy ? 'Estudiando...' : '¡Que se lo coma!'}
        </button>
      </form>
    </div>
  )
}
