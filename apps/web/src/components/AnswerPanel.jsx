// Somewhere to read the answer. Until now the only output the creature had was
// a 32px bubble with a "?" in it, which does not fit a sentence.
export function AnswerPanel({ exchange, asking, error, onDismiss }) {
  if (!asking && !error && !exchange) return null

  return (
    <div className="answer-panel" role="status" aria-live="polite">
      <button
        type="button"
        className="answer-close"
        onClick={onDismiss}
        aria-label="Cerrar la respuesta"
      >
        ×
      </button>

      {asking && (
        <p className="answer-thinking">
          <span className="answer-dot" />
          <span className="answer-dot" />
          <span className="answer-dot" />
        </p>
      )}

      {!asking && error && (
        <p className="answer-text answer-text--error">
          {error.code === 'offline'
            ? 'No consigo hablar con el bicho. ¿Está despierto?'
            : error.message}
        </p>
      )}

      {!asking && !error && exchange && (
        <>
          <p className="answer-question">{exchange.question}</p>
          <p className={`answer-text ${exchange.knows ? '' : 'answer-text--unknown'}`}>
            {exchange.text}
          </p>
        </>
      )}
    </div>
  )
}
