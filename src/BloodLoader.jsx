import { useEffect, useRef, useState } from 'react'
import { getSettings } from './settings'

// Simple loading orb: a centered circle with blood raining inside it (like rain).
// Shows on any button click (unless [data-no-loader]) for ~2s, then fades out.
// Honors prefers-reduced-motion (shorter, no fuss) and the Settings loader toggle.
const N_DROPS = 14

export default function BloodLoader() {
  const [show, setShow] = useState(false)
  const [fading, setFading] = useState(false)
  const playingRef = useRef(false)

  useEffect(() => {
    const onClick = (e) => {
      if (getSettings().loader === false) return // disabled in Settings
      const el = e.target.closest('button, [role="button"]')
      if (!el || el.closest('[data-no-loader]')) return
      if (playingRef.current) return // don't restart while already showing
      playingRef.current = true
      setFading(false)
      setShow(true)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  useEffect(() => {
    if (!show) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const hold = reduce ? 500 : 2000
    const t1 = setTimeout(() => setFading(true), hold)
    const t2 = setTimeout(() => {
      setShow(false)
      setFading(false)
      playingRef.current = false
    }, hold + 450)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [show])

  if (!show) return null

  return (
    <div
      className={`blood-loader ${fading ? 'bl-fade' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className="orb" aria-hidden="true">
        <div className="rain">
          {Array.from({ length: N_DROPS }).map((_, i) => {
            const left = (i * 100) / N_DROPS + (i % 2 ? 3 : -2)
            const dur = 0.7 + (i % 5) * 0.13
            const delay = -((i % 7) * 0.19) // negative → drops already mid-fall (seamless)
            const w = i % 3 === 0 ? 6 : 4
            return (
              <span
                className="drop"
                key={i}
                style={{
                  left: `${left}%`,
                  width: `${w}px`,
                  animationDuration: `${dur}s`,
                  animationDelay: `${delay}s`,
                }}
              />
            )
          })}
        </div>
        <div className="orb-pool" />
      </div>
    </div>
  )
}
