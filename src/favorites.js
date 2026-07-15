// "My List" — favorite titles, persisted in the browser (localStorage).
// One entry per anime, newest first. Nothing leaves the user's machine.

const KEY = 'devilapp:favorites'
const MAX = 200

// Fired after any local write so cloud sync (sync.js) can push the change.
function emitChange() {
  try {
    window.dispatchEvent(new Event('bloodfang:datachange'))
  } catch {
    /* no window — ignore */
  }
}

export function getFavorites() {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function persist(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* storage full / disabled — ignore */
  }
}

// User-path write: persist + notify sync.
function save(list) {
  persist(list)
  emitChange()
}

// Sync-path write: replace the whole list WITHOUT notifying (avoids a push loop).
export function replaceFavorites(list) {
  persist(Array.isArray(list) ? list : [])
  return getFavorites()
}

export function isFavorite(id) {
  return getFavorites().some((e) => String(e.id) === String(id))
}

// Add (or refresh) a favorite. `entry` = { id, title, image, type, ... }.
export function addFavorite(entry) {
  if (!entry?.id) return getFavorites()
  const rest = getFavorites().filter((e) => String(e.id) !== String(entry.id))
  const next = [{ ...entry, savedAt: Date.now() }, ...rest]
  save(next)
  return next
}

export function removeFavorite(id) {
  const next = getFavorites().filter((e) => String(e.id) !== String(id))
  save(next)
  return next
}

// Add if missing, remove if present. Returns { list, favorited }.
export function toggleFavorite(entry) {
  if (!entry?.id) return { list: getFavorites(), favorited: false }
  if (isFavorite(entry.id)) {
    return { list: removeFavorite(entry.id), favorited: false }
  }
  return { list: addFavorite(entry), favorited: true }
}
