// Panel para forzar cualquier estado del bicho sin esperar al sorteo.
// Oculto por defecto: se abre con el bichito de bug de la esquina.
import { STATE_IDS } from '../creature/config'

const LABELS = {
  idle: 'Botar',
  quieto: 'Quieto',
  deslizarse: 'Deslizarse',
  saltoAlto: 'Salto alto',
  voltereta: 'Voltereta',
  bostezo: 'Bostezo',
  aburrido: 'Aburrido',
  vibrar: 'Vibrar',
  dormir: 'Dormir',
  esconderse: 'Esconderse',
}

export function DebugPanel({ debug }) {
  return (
    <div className={`debug-panel ${debug.open ? 'debug-panel--open' : ''}`}>
      <button
        type="button"
        className="debug-toggle"
        onClick={() => debug.setOpen((o) => !o)}
        aria-label="Panel de depuración"
        title="Forzar un estado"
      >
        🐞
      </button>
      {debug.open && (
        <div className="debug-body">
          <p className="debug-title">Forzar estado</p>
          <div className="debug-states">
            <button
              type="button"
              className={`debug-state ${!debug.forced ? 'debug-state--active' : ''}`}
              onClick={() => debug.forceState(null)}
            >
              Auto
            </button>
            {STATE_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={`debug-state ${debug.forced === id ? 'debug-state--active' : ''}`}
                onClick={() => debug.forceState(id)}
              >
                {LABELS[id] ?? id}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
