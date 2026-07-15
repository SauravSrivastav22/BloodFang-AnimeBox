import { useEffect, useRef, useState } from 'react'
import { getSettings, setSettings } from './settings'

// Gear button in the header → a small preferences popover. Changes persist and
// broadcast immediately (see settings.js), so the loader/player/animations pick
// them up without a reload. Whole widget is [data-no-loader] so toggling never
// triggers the blood loader.
export default function SettingsPanel() {
  const [open, setOpen] = useState(false)
  const [s, setS] = useState(getSettings)
  const ref = useRef(null)

  // Close on outside click / Escape while open.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onEsc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const update = (patch) => setS(setSettings(patch))

  return (
    <div className="settings" data-no-loader ref={ref}>
      <button
        className="gear-btn"
        title="Settings"
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ⚙
      </button>
      {open && (
        <div className="settings-panel" role="dialog" aria-label="Settings">
          <h3>Settings</h3>
          <div className="settings-row">
            <span>Default audio</span>
            <div className="seg">
              <button
                className={`chip ${s.audio === 'sub' ? 'chip-on' : ''}`}
                onClick={() => update({ audio: 'sub' })}
              >
                Sub
              </button>
              <button
                className={`chip ${s.audio === 'dub' ? 'chip-on' : ''}`}
                onClick={() => update({ audio: 'dub' })}
              >
                Dub
              </button>
            </div>
          </div>
          <label className="settings-row">
            <span>Blood loader</span>
            <input
              type="checkbox"
              checked={s.loader}
              onChange={(e) => update({ loader: e.target.checked })}
            />
          </label>
          <label className="settings-row">
            <span>3D animations</span>
            <input
              type="checkbox"
              checked={s.animations}
              onChange={(e) => update({ animations: e.target.checked })}
            />
          </label>
          <label className="settings-row">
            <span>Show adult (18+)</span>
            <input
              type="checkbox"
              checked={s.adult}
              onChange={(e) => update({ adult: e.target.checked })}
            />
          </label>
        </div>
      )}
    </div>
  )
}
