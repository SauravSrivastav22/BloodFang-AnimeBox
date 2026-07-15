// "Blood meter" — a little vial by the logo that fills as the user opens pages.
// When it reaches MAX, a pour animation empties it into the loading orb.
// Persisted in localStorage; broadcast via window events.
const KEY = 'bloodfang:blood'
export const MAX_BLOOD = 6

export function getBlood() {
  try {
    const v = parseInt(localStorage.getItem(KEY) || '0', 10)
    return Number.isFinite(v) ? Math.min(MAX_BLOOD, Math.max(0, v)) : 0
  } catch {
    return 0
  }
}

function write(v) {
  try {
    localStorage.setItem(KEY, String(v))
  } catch {
    /* ignore */
  }
}

// +1 drop. Broadcasts the new level; fires "full" when the vial tops out.
export function addBlood() {
  const v = Math.min(MAX_BLOOD, getBlood() + 1)
  write(v)
  window.dispatchEvent(new CustomEvent('bloodfang:blood', { detail: { level: v } }))
  if (v >= MAX_BLOOD) window.dispatchEvent(new Event('bloodfang:full'))
  return v
}

export function resetBlood() {
  write(0)
  window.dispatchEvent(new CustomEvent('bloodfang:blood', { detail: { level: 0 } }))
}
