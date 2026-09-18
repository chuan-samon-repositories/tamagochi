import { useEffect, useMemo, useRef, useState } from 'react'
import { blobatar } from 'blobatar'
import { unsure } from 'blobatar/expression'
import terrainBg from './assets/terrain-bg.webp'
import nestImage from './assets/nest.webp'
import eggOnlyImage from './assets/egg-only.webp'
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

function TerrainBackground() {
  return <div className="terrain-bg" style={{ backgroundImage: `url(${terrainBg})` }} aria-hidden="true" />
}

function buildSpiralPath(turns = 2.4, steps = 48, maxR = 10) {
  let d = ''
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const theta = t * Math.PI * 2 * turns
    const r = t * maxR
    const x = 12 + r * Math.cos(theta)
    const y = 12 + r * Math.sin(theta)
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)} `
  }
  return d.trim()
}

const SPIRAL_PATH = buildSpiralPath()

function DizzyEyes() {
  return (
    <div className="dizzy-eyes" aria-hidden="true">
      <span className="dizzy-eye dizzy-eye--left">
        <span className="dizzy-eye-spin">
          <svg viewBox="0 0 24 24" width="100%" height="100%">
            <path d={SPIRAL_PATH} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </span>
      </span>
      <span className="dizzy-eye dizzy-eye--right">
        <span className="dizzy-eye-spin">
          <svg viewBox="0 0 24 24" width="100%" height="100%">
            <path d={SPIRAL_PATH} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </span>
      </span>
    </div>
  )
}

const BALL_SIZE = 128
const EDGE_MARGIN = 16
const OBSTACLE_PADDING = 16
const HOP_MIN_DIST = 100
const HOP_MAX_DIST = 230
const HOP_HEIGHT = 13
const HOP_MS_PER_PX = 3.2
const HOP_DURATION_MIN = 320
const HOP_DURATION_MAX = 620
const IDLE_MIN = 120
const IDLE_MAX = 420
const MAX_TILT = 16
const DRAG_LIFT = 20
const DRAG_MOVE_THRESHOLD = 6
const DIZZY_SPIN_THRESHOLD = Math.PI * 5
const DIZZY_SPEED_THRESHOLD = 1.1
const DIZZY_DURATION = 2800

const DUST_PARTICLES = [
  { dx: -48, dy: -8, size: 11, delay: 0 },
  { dx: -34, dy: -24, size: 7, delay: 25 },
  { dx: -14, dy: -30, size: 9, delay: 10 },
  { dx: 10, dy: -32, size: 8, delay: 15 },
  { dx: 30, dy: -24, size: 10, delay: 35 },
  { dx: 48, dy: -6, size: 11, delay: 0 },
  { dx: -24, dy: 6, size: 7, delay: 45 },
  { dx: 24, dy: 8, size: 7, delay: 45 },
  { dx: -6, dy: -18, size: 6, delay: 55 },
  { dx: 6, dy: -16, size: 6, delay: 55 },
]

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
  const orbRect = document.querySelector('.orb-cluster')?.getBoundingClientRect()

  for (let attempt = 0; attempt < 8; attempt++) {
    const angle = Math.random() * Math.PI * 2
    const dist = HOP_MIN_DIST + Math.random() * (HOP_MAX_DIST - HOP_MIN_DIST)
    let tx = clamp(x + Math.cos(angle) * dist, EDGE_MARGIN, maxX)
    let ty = clamp(y + Math.sin(angle) * dist, EDGE_MARGIN, maxY)

    const p1 = pushOutOfRect(tx, ty, sidebarRect)
    const p2 = pushOutOfRect(p1.x, p1.y, composerRect)
    const p3 = pushOutOfRect(p2.x, p2.y, orbRect)
    tx = clamp(p3.x, EDGE_MARGIN, maxX)
    ty = clamp(p3.y, EDGE_MARGIN, maxY)

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
  const shadowRef = useRef(null)
  const dustRef = useRef(null)
  const pausedRef = useRef(confused)
  const dragMovedRef = useRef(false)
  const [dizzy, setDizzy] = useState(false)
  const dizzyTimeoutRef = useRef(null)

  useEffect(() => {
    pausedRef.current = confused || dizzy
  }, [confused, dizzy])

  useEffect(() => () => clearTimeout(dizzyTimeoutRef.current), [])

  useEffect(() => {
    const wrap = wrapRef.current
    const tilt = tiltRef.current
    const ball = ballRef.current
    const bubble = bubbleRef.current
    const shadow = shadowRef.current
    const dust = dustRef.current
    if (!wrap || !tilt || !ball) return

    let x = window.innerWidth / 2 - BALL_SIZE / 2
    let y = window.innerHeight / 2 - BALL_SIZE / 2
    let phase = 'idle'
    let phaseStart = performance.now()
    let idleDuration = 300
    let hopFrom = { x, y }
    let hopTo = { x, y }
    let hopDuration = 0
    let hopHeight = HOP_HEIGHT
    let tiltDeg = 0
    let raf

    const spawnDust = (cx, cy) => {
      if (!dust) return
      dust.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`
      dust.classList.remove('dust-burst--play')
      // eslint-disable-next-line no-unused-expressions
      dust.offsetWidth
      dust.classList.add('dust-burst--play')
    }

    const tick = (now) => {
      const elapsed = now - phaseStart

      let bob = 0
      let arcHeight = 0

      if (phase === 'drag') {
        arcHeight = DRAG_LIFT
        ball.className = 'ball'
      } else if (phase === 'idle') {
        bob = Math.sin(elapsed / 190) * 1.5
        if (elapsed >= idleDuration && !pausedRef.current) {
          hopFrom = { x, y }
          hopTo = pickHopTarget(x, y)
          const dist = Math.hypot(hopTo.x - hopFrom.x, hopTo.y - hopFrom.y)
          hopDuration = clamp(dist * HOP_MS_PER_PX, HOP_DURATION_MIN, HOP_DURATION_MAX)
          hopHeight = HOP_HEIGHT * (0.8 + Math.random() * 0.4)
          tiltDeg = clamp(((hopTo.x - hopFrom.x) / dist || 0) * MAX_TILT, -MAX_TILT, MAX_TILT)
          phase = 'hop'
          phaseStart = now
        }
      } else {
        const t = clamp(elapsed / hopDuration, 0, 1)
        const horizT = easeInOutSine(t)
        arcHeight = Math.sin(t * Math.PI) * hopHeight
        x = hopFrom.x + (hopTo.x - hopFrom.x) * horizT
        y = hopFrom.y + (hopTo.y - hopFrom.y) * horizT - arcHeight

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
          spawnDust(x + BALL_SIZE / 2, y + BALL_SIZE * 0.92)
          setTimeout(() => {
            if (ball) ball.className = 'ball'
          }, 140)
        }
      }

      wrap.style.transform = `translate(${x}px, ${y + bob}px)`
      tilt.style.transform = `rotate(${tiltDeg}deg)`
      if (bubble) {
        bubble.style.transform = `translate(${x + BALL_SIZE / 2 - 16}px, ${y + bob - 40}px)`
      }
      if (shadow) {
        const groundY = y + arcHeight
        const shrink = clamp(1 - arcHeight / (hopHeight * 3.2), 0.82, 1)
        const shadowCx = x + BALL_SIZE / 2
        // Follows most of the way up with the creature instead of staying
        // pinned to the ground, so it never visibly detaches mid-hop.
        const shadowCy = groundY + BALL_SIZE * 0.92 - arcHeight * 0.55
        shadow.style.transform =
          `translate(${shadowCx}px, ${shadowCy}px) translate(-50%, -50%) scale(${shrink})`
        shadow.style.opacity = 0.55 * shrink
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    let dragActive = false
    let dragPointerId = null
    let dragGrabDx = 0
    let dragGrabDy = 0
    let dragStartClientX = 0
    let dragStartClientY = 0
    let dragStartTime = 0
    let dragPathLen = 0
    let dragSpinAccum = 0
    let dragHasLastVec = false
    let dragLastVecX = 0
    let dragLastVecY = 0

    const handlePointerDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return
      dragActive = true
      dragPointerId = e.pointerId
      dragGrabDx = e.clientX - x
      dragGrabDy = e.clientY - y
      dragStartClientX = e.clientX
      dragStartClientY = e.clientY
      dragStartTime = performance.now()
      dragPathLen = 0
      dragSpinAccum = 0
      dragHasLastVec = false
      dragMovedRef.current = false
      phase = 'drag'
      wrap.setPointerCapture(e.pointerId)
    }

    const handlePointerMove = (e) => {
      if (!dragActive || e.pointerId !== dragPointerId) return
      const maxX = window.innerWidth - BALL_SIZE - EDGE_MARGIN
      const maxY = window.innerHeight - BALL_SIZE - EDGE_MARGIN
      const groundX = clamp(e.clientX - dragGrabDx, EDGE_MARGIN, maxX)
      const groundY = clamp(e.clientY - dragGrabDy, EDGE_MARGIN, maxY)
      tiltDeg = clamp((e.movementX || 0) * 1.4, -MAX_TILT, MAX_TILT)
      x = groundX
      y = groundY - DRAG_LIFT
      if (Math.hypot(e.clientX - dragStartClientX, e.clientY - dragStartClientY) > DRAG_MOVE_THRESHOLD) {
        dragMovedRef.current = true
      }

      const vecX = e.movementX || 0
      const vecY = e.movementY || 0
      const dist = Math.hypot(vecX, vecY)
      dragPathLen += dist
      if (dragHasLastVec && dist > 0.5 && Math.hypot(dragLastVecX, dragLastVecY) > 0.5) {
        const angle1 = Math.atan2(dragLastVecY, dragLastVecX)
        const angle2 = Math.atan2(vecY, vecX)
        let delta = angle2 - angle1
        while (delta > Math.PI) delta -= Math.PI * 2
        while (delta < -Math.PI) delta += Math.PI * 2
        dragSpinAccum += Math.abs(delta)
      }
      if (dist > 0.5) {
        dragLastVecX = vecX
        dragLastVecY = vecY
        dragHasLastVec = true
      }
    }

    const endDrag = (e) => {
      if (!dragActive || e.pointerId !== dragPointerId) return
      dragActive = false
      if (wrap.hasPointerCapture?.(e.pointerId)) {
        wrap.releasePointerCapture(e.pointerId)
      }
      y += DRAG_LIFT
      phase = 'idle'
      phaseStart = performance.now()
      idleDuration = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN)
      tiltDeg = 0
      ball.className = 'ball ball--land'
      spawnDust(x + BALL_SIZE / 2, y + BALL_SIZE * 0.92)
      setTimeout(() => {
        if (ball) ball.className = 'ball'
      }, 140)

      const dragElapsed = Math.max(performance.now() - dragStartTime, 1)
      const avgSpeed = dragPathLen / dragElapsed
      if (dragSpinAccum > DIZZY_SPIN_THRESHOLD && avgSpeed > DIZZY_SPEED_THRESHOLD) {
        setDizzy(true)
        clearTimeout(dizzyTimeoutRef.current)
        dizzyTimeoutRef.current = setTimeout(() => setDizzy(false), DIZZY_DURATION)
      }
    }

    wrap.addEventListener('pointerdown', handlePointerDown)
    wrap.addEventListener('pointermove', handlePointerMove)
    wrap.addEventListener('pointerup', endDrag)
    wrap.addEventListener('pointercancel', endDrag)

    return () => {
      cancelAnimationFrame(raf)
      wrap.removeEventListener('pointerdown', handlePointerDown)
      wrap.removeEventListener('pointermove', handlePointerMove)
      wrap.removeEventListener('pointerup', endDrag)
      wrap.removeEventListener('pointercancel', endDrag)
    }
  }, [])

  return (
    <>
      <div ref={shadowRef} className="ball-shadow" aria-hidden="true" />
      <div ref={dustRef} className="dust-burst" aria-hidden="true">
        {DUST_PARTICLES.map((p, i) => (
          <span
            key={i}
            className="dust-particle"
            style={{
              width: p.size,
              height: p.size,
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              animationDelay: `${p.delay}ms`,
            }}
          />
        ))}
      </div>
      <div ref={bubbleRef} className="ball-bubble-wrap" aria-hidden="true">
        <div className={`ball-bubble ${confused ? 'ball-bubble--visible' : ''}`}>?</div>
      </div>
      <button
        ref={wrapRef}
        type="button"
        className="ball-wrap"
        onClick={(e) => {
          if (dragMovedRef.current) {
            dragMovedRef.current = false
            return
          }
          onClick?.(e)
        }}
        aria-label="Ver estadísticas"
      >
        <div ref={tiltRef} className="ball-tilt">
          <div ref={ballRef} className="ball">
            <BlobFigure
              seed={seed}
              expression={confused ? unsure : undefined}
              className={`blob-figure ${dizzy ? 'blob-figure--hide-eyes' : ''}`}
            />
            {dizzy && <DizzyEyes />}
          </div>
        </div>
      </button>
    </>
  )
}

const stats = [
  { label: 'Energía', value: 32, tone: 'energy', icon: '⚡' },
  { label: 'Salud mental', value: 45, tone: 'sanity', icon: '🧠' },
]

const orbStats = [
  { label: 'Vida', value: 86, tone: 'life' },
  { label: 'Hambre', value: 54, tone: 'hunger' },
  { label: 'Sed', value: 68, tone: 'thirst' },
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

function Orb({ label, value, tone }) {
  return (
    <div className={`orb orb--${tone}`} aria-label={`${label}: ${value}%`}>
      <div className="orb-clip">
        <div className="orb-fill" style={{ height: `${value}%` }}>
          <span className="orb-wave-strip orb-wave-strip--1" />
          <span className="orb-wave-strip orb-wave-strip--2" />
        </div>
        <span className="orb-sheen" aria-hidden="true" />
        <span className="orb-percent">{value}%</span>
      </div>
    </div>
  )
}

function OrbCluster() {
  return (
    <div className="orb-cluster">
      {orbStats.map((orb) => (
        <Orb key={orb.label} {...orb} />
      ))}
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
          <IntelligenceStat />
        </div>
      </div>
    </aside>
  )
}

const HATCH_CLICKS = 10

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
      setTimeout(onHatch, 620)
    }
  }

  return (
    <>
      <div className={`hatch-backdrop ${hatching ? 'hatch-backdrop--active' : ''}`} aria-hidden="true" />
      <div className={`egg-scene ${hatching ? 'egg-scene--hatching' : ''}`}>
        <img className="nest-layer" src={nestImage} alt="" aria-hidden="true" />

        <button
          type="button"
          className="egg-button"
          onClick={handleClick}
          aria-label="Toca el huevo para incubarlo"
        >
          <div
            key={shakeKey}
            className={`egg ${hatching ? 'egg--hatch' : 'egg--shake'}`}
            style={{ backgroundImage: `url(${eggOnlyImage})` }}
          >
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
      </div>
    </>
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
      <TerrainBackground />

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

      {hasCreature && <OrbCluster />}

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
