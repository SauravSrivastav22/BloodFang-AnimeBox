// User preferences, persisted in localStorage. Nothing leaves the machine.
// Changing a setting dispatches `bloodfang:settings` so live components (the
// loader, the player, the settings panel) can react without a reload.

const KEY = 'bloodfang:settings'
const EVENT = 'bloodfang:settings'

const DEFAULTS = {
  audio: 'dub', // default player audio: 'dub' | 'sub'
  loader: true, // show the blood "Summoning…" loader on clicks
  animations: true, // 3D card/hero animations (also gated by reduced-motion)
  adult: false, // include 18+ titles in search/browse results
}

export function getSettings() {
  try {
    const raw = localStorage.getItem(KEY)
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) }
  } catch {
    return { ...DEFAULTS }
  }
}

function persist(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj))
  } catch {
    /* storage full / disabled — ignore */
  }
}

// Merge a partial update, persist, and notify listeners. Returns the new settings.
// Also fires a data-change event so cloud sync (sync.js) pushes it.
export function setSettings(patch) {
  const next = { ...getSettings(), ...patch }
  persist(next)
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }))
  window.dispatchEvent(new Event('bloodfang:datachange'))
  return next
}

// Sync-path write: replace settings from the cloud and refresh live UI, but WITHOUT
// firing the data-change event (avoids a push loop when applying pulled data).
export function applySettings(obj) {
  const next = { ...DEFAULTS, ...(obj || {}) }
  persist(next)
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }))
  return next
}

export const SETTINGS_EVENT = EVENT
