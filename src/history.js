// "Continue Watching" history, persisted in the browser (localStorage).
// One entry per anime; playing a new episode updates that anime's entry and
// bumps it to the front. Nothing leaves the user's machine.

const KEY = 'devilapp:continue-watching'
const MAX = 20

// Fired after any local data write so cloud sync (sync.js) can push the change.
function emitChange() {
  try {
    window.dispatchEvent(new Event('bloodfang:datachange'))
  } catch {
    /* no window — ignore */
  }
}

export function getHistory() {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

// Low-level persist (no change event — used by both user writes and sync apply).
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

// Sync-path write: replace the whole list WITHOUT notifying (avoids a push loop
// when applying data pulled from the cloud).
export function replaceHistory(list) {
  persist(Array.isArray(list) ? list : [])
  return getHistory()
}

// Record (or update) progress for an anime. `entry` = { id, title, image, episode }.
export function saveProgress(entry) {
  if (!entry?.id) return getHistory()
  const rest = getHistory().filter((e) => String(e.id) !== String(entry.id))
  const next = [{ ...entry, updatedAt: Date.now() }, ...rest]
  save(next)
  return next
}

export function removeFromHistory(id) {
  const next = getHistory().filter((e) => String(e.id) !== String(id))
  save(next)
  return next
}

export function clearHistory() {
  save([])
  return []
}

// Set of ALL episodes ever played per title (id → [episode numbers]), so the
// detail page can mark episodes you've already watched. Separate from the
// "last episode" tracked above, which only remembers where to resume.
const WATCHED_KEY = 'devilapp:watched'

function readWatched() {
  try {
    const raw = localStorage.getItem(WATCHED_KEY)
    const map = raw ? JSON.parse(raw) : {}
    return map && typeof map === 'object' ? map : {}
  } catch {
    return {}
  }
}

// Whole watched map (id → [episode numbers]) — used by cloud sync.
export function getWatchedMap() {
  return readWatched()
}

// Episode numbers already watched for one title, as a Set for quick lookup.
export function getWatchedEpisodes(id) {
  const list = readWatched()[String(id)]
  return new Set(Array.isArray(list) ? list : [])
}

function persistWatched(map) {
  try {
    localStorage.setItem(WATCHED_KEY, JSON.stringify(map && typeof map === 'object' ? map : {}))
  } catch {
    /* storage full / disabled — ignore */
  }
}

// Record one episode as watched for a title (idempotent) + notify sync.
export function markEpisodeWatched(id, episode) {
  const map = readWatched()
  const key = String(id)
  const set = new Set(Array.isArray(map[key]) ? map[key] : [])
  set.add(Number(episode))
  map[key] = [...set].sort((a, b) => a - b)
  persistWatched(map)
  emitChange()
}

// Sync-path write for the watched map (no change event).
export function replaceWatched(map) {
  persistWatched(map)
}
