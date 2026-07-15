import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createTimeline, animate, set } from 'animejs'

// When the blood vial fills up, this popup takes over: a full vial tips and
// POURS a stream of blood into the loading orb, which fills + rains — then the
// ritual "summons" a random anime (poster + Watch button) out of the blood.
// Controlled by the `summon` prop (the anime to reveal), null = hidden.
const N_DROPS = 12

function FullVial() {
  return (
    <svg className="pour-vial-svg" viewBox="0 0 60 92" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff2d4e" />
          <stop offset="100%" stopColor="#7f0a1c" />
        </linearGradient>
        <clipPath id="pvClip">
          <path d="M18 12 L18 64 Q18 82 30 82 Q42 82 42 64 L42 12 Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#pvClip)">
        <rect x="18" y="12" width="24" height="72" fill="url(#pvGrad)" />
      </g>
      <path d="M18 12 L18 64 Q18 82 30 82 Q42 82 42 64 L42 12 Z" fill="none" stroke="#e6dfe6" strokeWidth="3" />
      <rect x="13" y="5" width="34" height="8.5" rx="3" fill="#5a1520" />
    </svg>
  )
}

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function BloodPour({ summon, onWatch, onClose }) {
  const [phase, setPhase] = useState('pour') // 'pour' | 'reveal'
  const rootRef = useRef(null)

  // Restart at the pour phase each time a new summon begins.
  useEffect(() => {
    if (summon) setPhase('pour')
  }, [summon])

  // Phase 1: the pour animation, then hand off to the reveal.
  useLayoutEffect(() => {
    if (!summon || phase !== 'pour') return
    const root = rootRef.current
    if (!root) return
    const toReveal = () => setPhase('reveal')

    if (reduced()) {
      const t = setTimeout(toReveal, 500)
      return () => clearTimeout(t)
    }

    const vial = root.querySelector('.pour-vial')
    const stream = root.querySelector('.pour-stream')
    const pool = root.querySelector('.pour-pool')
    set(vial, { rotate: 0, opacity: 0, translateY: -20 })
    set(stream, { scaleY: 0 })
    set(pool, { scaleY: 0.12 })

    const tl = createTimeline({ defaults: { ease: 'outExpo' }, onComplete: toReveal })
    tl.add(vial, { opacity: [0, 1], translateY: [-20, 0], duration: 360 }, 0)
    tl.add(vial, { rotate: [0, -26], duration: 440 }, '+=120')
    tl.add(stream, { scaleY: [0, 1], duration: 400 }, '-=170')
    tl.add(pool, { scaleY: [0.12, 1], duration: 1000, ease: 'inOutQuad' }, '-=120')
    tl.add({}, { duration: 500 }) // brief hold before the reveal
    return () => tl.pause()
  }, [summon, phase])

  // Phase 2: reveal the summoned anime; auto-dismiss after a while.
  useLayoutEffect(() => {
    if (phase !== 'reveal') return
    const root = rootRef.current
    if (root && !reduced()) {
      const card = root.querySelector('.summon-card')
      const flash = root.querySelector('.summon-flash')
      if (flash) animate(flash, { opacity: [0.9, 0], scale: [0.2, 2.4], duration: 620, ease: 'outExpo' })
      if (card) animate(card, { opacity: [0, 1], scale: [0.6, 1], rotateY: [40, 0], duration: 640, ease: 'outExpo' })
    }
    const t = setTimeout(() => onClose?.(), 9000)
    return () => clearTimeout(t)
  }, [phase, onClose])

  if (!summon) return null
  const title =
    summon.title?.english || summon.title?.romaji || summon.title?.userPreferred || 'Untitled'

  return (
    <div className="pour-overlay" ref={rootRef} role="status" aria-live="polite" aria-label="Summoning">
      {phase === 'pour' ? (
        <>
          <p className="pour-text">Blood full — Summoning</p>
          <div className="pour-vial" aria-hidden="true">
            <FullVial />
          </div>
          <div className="pour-stream" aria-hidden="true" />
          <div className="orb pour-orb" aria-hidden="true">
            <div className="rain">
              {Array.from({ length: N_DROPS }).map((_, i) => (
                <span
                  className="drop"
                  key={i}
                  style={{
                    left: `${(i * 100) / N_DROPS + (i % 2 ? 3 : -2)}%`,
                    animationDuration: `${0.6 + (i % 5) * 0.12}s`,
                    animationDelay: `${-((i % 7) * 0.16)}s`,
                  }}
                />
              ))}
            </div>
            <div className="orb-pool pour-pool" />
          </div>
        </>
      ) : (
        <>
          <div className="summon-flash" aria-hidden="true" />
          <p className="pour-text">🩸 The blood summons…</p>
          <div className="summon-card">
            <div className="summon-poster">
              {summon.image ? <img src={summon.image} alt={title} /> : <div className="card-noimg">No image</div>}
            </div>
            <h3 className="summon-title" title={title}>
              {title}
            </h3>
            <div className="summon-actions">
              <button className="btn btn-primary" data-no-loader onClick={() => onWatch?.(summon.id)}>
                ▶ Watch now
              </button>
              <button className="btn" data-no-loader onClick={() => onClose?.()}>
                ✕ Dismiss
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
