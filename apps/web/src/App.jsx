import { useEffect, useMemo, useRef, useState } from 'react'
import { blobatar } from 'blobatar'
import { unsure } from 'blobatar/expression'
import './App.css'

function randomSeed() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `seed-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function BlobFigure({ seed, expression, className }) {
  const markup = useMemo(
    () => blobatar(seed, { background: false, expression }),
    [seed, expression],
  )
  // eslint-disable-next-line react/no-danger
  return <div className={className} dangerouslySetInnerHTML={{ __html: markup }} />
}

const BALL_SIZE = 64
const EDGE_MARGIN = 16
const OBSTACLE_PADDING = 16
const HOP_MIN_DIST = 55
const HOP_MAX_DIST = 130
const HOP_HEIGHT = 32
const HOP_MS_PER_PX = 4.2
const HOP_DURATION_MIN = 360
const HOP_DURATION_MAX = 620
const IDLE_MIN = 120
const IDLE_MAX = 420
const MAX_TILT = 16

function easeInOutSine(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function pushOutOfRect(x, y, rect) {
  if (!rect) return { x, y }
  const left = rect.left - OBSTACLE_PADDING
  const right = rect.right + OBSTACLE_PADDING
  const top = rect.top - OBSTACLE_PADDING
  const bottom = rect.bottom + OBSTACLE_PADDING
  const ballRight = x + BALL_SIZE
  const ballBottom = y + BALL_SIZE

  const overlaps = x < right && ballRight > left && y < bottom && ballBottom > top
  if (!overlaps) return { x, y }

  const penLeft = ballRight - left
  const penRight = right - x
  const penTop = ballBottom - top
  const penBottom = bottom - y
  const minPen = Math.min(penLeft, penRight, penTop, penBottom)

  if (minPen === penLeft) return { x: left - BALL_SIZE, y }
  if (minPen === penRight) return { x: right, y }
  if (minPen === penTop) return { x, y: top - BALL_SIZE }
  return { x, y: bottom }
}

function pickHopTarget(x, y) {
  const maxX = window.innerWidth - BALL_SIZE - EDGE_MARGIN
  const maxY = window.innerHeight - BALL_SIZE - EDGE_MARGIN
  const sidebarRect = document.querySelector('.sidebar')?.getBoundingClientRect()
  const composerRect = document.querySelector('.composer')?.getBoundingClientRect()

  for (let attempt = 0; attempt < 8; attempt++) {
    const angle = Math.random() * Math.PI * 2
    const dist = HOP_MIN_DIST + Math.random() * (HOP_MAX_DIST - HOP_MIN_DIST)
    let tx = clamp(x + Math.cos(angle) * dist, EDGE_MARGIN, maxX)
    let ty = clamp(y + Math.sin(angle) * dist, EDGE_MARGIN, maxY)

    const p1 = pushOutOfRect(tx, ty, sidebarRect)
    const p2 = pushOutOfRect(p1.x, p1.y, composerRect)
    tx = clamp(p2.x, EDGE_MARGIN, maxX)
    ty = clamp(p2.y, EDGE_MARGIN, maxY)

    if (Math.hypot(tx - x, ty - y) > 8) {
      return { x: tx, y: ty }
    }
  }
  return { x, y }
}

function BouncingBall({ onClick, confused, seed }) {
  const wrapRef = useRef(null)
  const tiltRef = useRef(null)
  const ballRef = useRef(null)
  const bubbleRef = useRef(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const tilt = tiltRef.current
    const ball = ballRef.current
    const bubble = bubbleRef.current
    if (!wrap || !tilt || !ball) return

    let x = window.innerWidth / 2 - BALL_SIZE / 2
    let y = window.innerHeight / 2 - BALL_SIZE / 2
    let phase = 'idle'
    let phaseStart = performance.now()
    let idleDuration = 300
    let hopFrom = { x, y }
    let hopTo = { x, y }
    let hopDuration = 0
    let tiltDeg = 0
    let raf

    const tick = (now) => {
      const elapsed = now - phaseStart

      let bob = 0

      if (phase === 'idle') {
        bob = Math.sin(elapsed / 190) * 1.5
        if (elapsed >= idleDuration) {
          hopFrom = { x, y }
          hopTo = pickHopTarget(x, y)
          const dist = Math.hypot(hopTo.x - hopFrom.x, hopTo.y - hopFrom.y)
          hopDuration = clamp(dist * HOP_MS_PER_PX, HOP_DURATION_MIN, HOP_DURATION_MAX)
          tiltDeg = clamp(((hopTo.x - hopFrom.x) / dist || 0) * MAX_TILT, -MAX_TILT, MAX_TILT)
          phase = 'hop'
          phaseStart = now
        }
      } else {
        const t = clamp(elapsed / hopDuration, 0, 1)
        const horizT = easeInOutSine(t)
        x = hopFrom.x + (hopTo.x - hopFrom.x) * horizT
        y = hopFrom.y + (hopTo.y - hopFrom.y) * horizT - Math.sin(t * Math.PI) * HOP_HEIGHT

        if (t < 0.12) {
          ball.className = 'ball ball--crouch'
        } else if (t < 0.85) {
          ball.className = 'ball ball--stretch'
        } else {
          ball.className = 'ball'
        }

        if (t >= 1) {
          x = hopTo.x
          y = hopTo.y
          phase = 'idle'
          phaseStart = now
          idleDuration = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN)
          tiltDeg = 0
          ball.className = 'ball ball--land'
          setTimeout(() => {
            if (ball) ball.className = 'ball'
          }, 140)
        }
      }

      wrap.style.transform = `translate(${x}px, ${y + bob}px)`
      tilt.style.transform = `rotate(${tiltDeg}deg)`
      if (bubble) {
        bubble.style.transform = `translate(${x + BALL_SIZE / 2 - 13}px, ${y + bob - 30}px)`
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <>
      <div ref={bubbleRef} className="ball-bubble-wrap" aria-hidden="true">
        <div className={`ball-bubble ${confused ? 'ball-bubble--visible' : ''}`}>?</div>
      </div>
      <button
        ref={wrapRef}
        type="button"
        className="ball-wrap"
        onClick={onClick}
        aria-label="Ver estadísticas"
      >
        <div ref={tiltRef} className="ball-tilt">
          <div ref={ballRef} className="ball">
            <BlobFigure
              seed={seed}
              expression={confused ? unsure : undefined}
              className="blob-figure"
            />
          </div>
        </div>
      </button>
    </>
  )
}

const stats = [
  { label: 'Vida', value: 86, tone: 'life', icon: '❤️' },
  { label: 'Gana / Sed', value: 54, tone: 'hunger', icon: '🍗' },
  { label: 'Energía', value: 32, tone: 'energy', icon: '⚡' },
  { label: 'Salud mental', value: 45, tone: 'sanity', icon: '🧠' },
]

const intelligences = [
  { label: 'Lingüística', value: 72 },
  { label: 'Lógico-matemática', value: 81 },
  { label: 'Espacial', value: 58 },
  { label: 'Musical', value: 40 },
  { label: 'Corporal-cinestésica', value: 35 },
  { label: 'Intrapersonal', value: 66 },
  { label: 'Interpersonal', value: 74 },
  { label: 'Naturalista', value: 50 },
  { label: 'Emocional', value: 69 },
  { label: 'Creativa', value: 77 },
  { label: 'Colaborativa', value: 63 },
  { label: 'Existencial', value: 45 },
]

const intelligenceAverage = Math.round(
  intelligences.reduce((sum, i) => sum + i.value, 0) / intelligences.length,
)

function StatBar({ label, value, tone, icon, caption }) {
  return (
    <div className="stat">
      <div className={`stat-icon stat-icon--${tone}`} aria-hidden="true">
        {icon}
      </div>
      <div className="stat-body">
        <div className="stat-head">
          <span className="stat-label">{label}</span>
          <span className={`stat-value stat-value--${tone}`}>{value}</span>
        </div>
        <div className="stat-track">
          <div
            className={`stat-fill stat-fill--${tone}`}
            style={{ width: `${value}%` }}
          />
        </div>
        {caption && <p className="stat-caption">{caption}</p>}
      </div>
    </div>
  )
}

function IntelligenceStat() {
  const [open, setOpen] = useState(false)

  return (
    <div className="stat">
      <div className="stat-icon stat-icon--mind" aria-hidden="true">
        🧩
      </div>
      <div className="stat-body">
        <button
          type="button"
          className="stat-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <div className="stat-head">
            <span className="stat-label">
              Inteligencia
              <svg
                className={`stat-chevron ${open ? 'stat-chevron--open' : ''}`}
                viewBox="0 0 24 24"
                width="12"
                height="12"
                aria-hidden="true"
              >
                <path
                  d="M6 9L12 15L18 9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="stat-value stat-value--mind">{intelligenceAverage}</span>
          </div>
          <div className="stat-track">
            <div
              className="stat-fill stat-fill--mind"
              style={{ width: `${intelligenceAverage}%` }}
            />
          </div>
        </button>

        <div className={`intel-list ${open ? 'intel-list--open' : ''}`}>
          <div className="intel-list-inner">
            {intelligences.map((intel) => (
              <div className="intel-item" key={intel.label}>
                <div className="stat-head">
                  <span className="intel-label">{intel.label}</span>
                  <span className="intel-value">{intel.value}</span>
                </div>
                <div className="stat-track stat-track--sm">
                  <div
                    className="stat-fill stat-fill--mind"
                    style={{ width: `${intel.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Sidebar({ expanded, onToggle, name, seed }) {
  return (
    <aside className={`sidebar ${expanded ? 'sidebar--expanded' : 'sidebar--collapsed'}`}>
      <button
        type="button"
        className="sidebar-header"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className="sidebar-avatar" aria-hidden="true">
          <BlobFigure seed={seed} className="blob-figure" />
        </div>
        <h1 className="sidebar-name">{name}</h1>
        <svg
          className="sidebar-chevron"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          aria-hidden="true"
        >
          <path
            d="M9 6L15 12L9 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div className={`sidebar-stats-wrap ${expanded ? 'sidebar-stats-wrap--open' : ''}`}>
        <div className="sidebar-stats">
          <p className="sidebar-section-label">Estadísticas</p>
          <StatBar {...stats[0]} />
          <StatBar {...stats[1]} />
          <StatBar {...stats[2]} />
          <StatBar {...stats[3]} />
          <IntelligenceStat />
        </div>
      </div>
    </aside>
  )
}

const HATCH_CLICKS = 10
const SPECKLE_TONES = ['life', 'hunger', 'energy', 'mind', 'sanity']
const SPECKLES = [
  { top: '28%', left: '32%', size: 7, tone: 0 },
  { top: '48%', left: '64%', size: 6, tone: 3 },
  { top: '62%', left: '38%', size: 5, tone: 2 },
  { top: '38%', left: '54%', size: 4, tone: 4 },
  { top: '58%', left: '58%', size: 5, tone: 1 },
]

function EggNest({ onHatch }) {
  const [clicks, setClicks] = useState(0)
  const [shakeKey, setShakeKey] = useState(0)
  const [hatching, setHatching] = useState(false)

  const handleClick = () => {
    if (hatching) return
    const next = clicks + 1
    setClicks(next)
    setShakeKey((k) => k + 1)

    if (next >= HATCH_CLICKS) {
      setHatching(true)
      setTimeout(onHatch, 550)
    }
  }

  return (
    <div className="egg-scene">
      <svg className="nest" viewBox="0 0 200 90" aria-hidden="true">
        <ellipse cx="100" cy="60" rx="95" ry="26" fill="url(#nestBase)" />
        <ellipse cx="100" cy="48" rx="78" ry="22" fill="url(#nestRim)" />
        <defs>
          <linearGradient id="nestBase" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d9bd93" />
            <stop offset="100%" stopColor="#c7a374" />
          </linearGradient>
          <linearGradient id="nestRim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f0dcb8" />
            <stop offset="100%" stopColor="#dcbe8f" />
          </linearGradient>
        </defs>
        {Array.from({ length: 16 }).map((_, i) => (
          <ellipse
            key={i}
            cx={100 + Math.cos((i / 16) * Math.PI * 2) * 76}
            cy={50 + Math.sin((i / 16) * Math.PI * 2) * 20}
            rx="14"
            ry="3.4"
            fill="#b8935f"
            opacity="0.55"
            transform={`rotate(${(i / 16) * 360} ${
              100 + Math.cos((i / 16) * Math.PI * 2) * 76
            } ${50 + Math.sin((i / 16) * Math.PI * 2) * 20})`}
          />
        ))}
      </svg>

      <button
        type="button"
        className="egg-button"
        onClick={handleClick}
        aria-label="Toca el huevo para incubarlo"
      >
        <div key={shakeKey} className={`egg ${hatching ? 'egg--hatch' : 'egg--shake'}`}>
          {SPECKLES.map((s, i) => (
            <span
              key={i}
              className={`egg-speckle egg-speckle--${SPECKLE_TONES[s.tone]}`}
              style={{ top: s.top, left: s.left, width: s.size, height: s.size }}
            />
          ))}
          {clicks >= 3 && <span className="egg-crack egg-crack--1" />}
          {clicks >= 6 && <span className="egg-crack egg-crack--2" />}
          {clicks >= 9 && <span className="egg-crack egg-crack--3" />}
        </div>
      </button>

      <div className="egg-progress" aria-hidden="true">
        {Array.from({ length: HATCH_CLICKS }).map((_, i) => (
          <span key={i} className={`egg-dot ${i < clicks ? 'egg-dot--filled' : ''}`} />
        ))}
      </div>
      <p className="egg-hint">Toca el huevo para incubarlo</p>
    </div>
  )
}

function NamingModal({ onConfirm, seed }) {
  const [name, setName] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onConfirm(trimmed)
  }

  return (
    <div className="naming-overlay">
      <form className="naming-card" onSubmit={handleSubmit}>
        <div className="naming-avatar" aria-hidden="true">
          <BlobFigure seed={seed} className="blob-figure" />
        </div>
        <h2 className="naming-title">¡Ha nacido!</h2>
        <p className="naming-subtitle">Ponle un nombre a tu nueva mascota</p>
        <input
          className="naming-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre"
          maxLength={24}
          autoFocus
        />
        <button className="naming-submit" type="submit" disabled={!name.trim()}>
          ¡Listo!
        </button>
      </form>
    </div>
  )
}

function App() {
  const [message, setMessage] = useState('')
  const [expanded, setExpanded] = useState(false)

  const [stage, setStage] = useState(() => localStorage.getItem('tamagochi:stage') || 'egg')
  const [creatureName, setCreatureName] = useState(
    () => localStorage.getItem('tamagochi:name') || '',
  )
  const [creatureSeed, setCreatureSeed] = useState(
    () => localStorage.getItem('tamagochi:seed') || '',
  )

  const handleHatch = () => {
    const seed = randomSeed()
    setCreatureSeed(seed)
    setStage('naming')
    localStorage.setItem('tamagochi:seed', seed)
    localStorage.setItem('tamagochi:stage', 'naming')
  }

  const handleReset = () => {
    localStorage.removeItem('tamagochi:stage')
    localStorage.removeItem('tamagochi:name')
    localStorage.removeItem('tamagochi:seed')
    window.location.reload()
  }

  const handleNameConfirm = (name) => {
    setCreatureName(name)
    setStage('alive')
    localStorage.setItem('tamagochi:name', name)
    localStorage.setItem('tamagochi:stage', 'alive')
  }

  const [reacting, setReacting] = useState(false)
  const reactTimeoutRef = useRef(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!message.trim()) return
    setMessage('')

    setReacting(true)
    clearTimeout(reactTimeoutRef.current)
    reactTimeoutRef.current = setTimeout(() => setReacting(false), 3000)
  }

  useEffect(() => () => clearTimeout(reactTimeoutRef.current), [])

  useEffect(() => {
    if (!expanded) return

    const handlePointerDown = (e) => {
      if (!e.target.closest('.sidebar')) {
        setExpanded(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [expanded])

  const hasCreature = stage === 'alive'

  return (
    <div className="app">
      <button
        type="button"
        className="reset-button"
        onClick={handleReset}
        aria-label="Reiniciar (volver al huevo)"
        title="Reiniciar (volver al huevo)"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {hasCreature && (
        <Sidebar
          expanded={expanded}
          onToggle={() => setExpanded((e) => !e)}
          name={creatureName}
          seed={creatureSeed}
        />
      )}

      {stage === 'egg' && <EggNest onHatch={handleHatch} />}
      {stage === 'naming' && (
        <NamingModal onConfirm={handleNameConfirm} seed={creatureSeed} />
      )}

      {hasCreature && (
        <BouncingBall
          onClick={() => setExpanded(true)}
          confused={reacting}
          seed={creatureSeed}
        />
      )}

      {hasCreature && (
      <div className="composer-dock">
        <form className="composer" onSubmit={handleSubmit}>
          <svg
            className="composer-icon"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            className="composer-input"
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Escribe un mensaje"
            aria-label="Mensaje"
          />
          <button
            className="composer-send"
            type="submit"
            aria-label="Enviar"
            disabled={!message.trim()}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M4 12L20 4L13 20L11 13L4 12Z" fill="currentColor" />
            </svg>
          </button>
        </form>
      </div>
      )}
    </div>
  )
}

export default App
