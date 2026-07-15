// Cloud sync via Firebase (Google sign-in + Firestore). Optional: if
// firebase-config.js isn't filled in, everything here no-ops and BloodFang runs
// fully local (localStorage only).
//
// Model: your data (My List, Continue Watching, watched episodes, settings) lives
// in localStorage as always. When you sign in we MERGE the cloud copy with the
// local copy (union — nothing is lost), write the result back locally, and push
// the union to Firestore. After that, every local change is pushed (debounced),
// so signing in on another device pulls your data back.
import { firebaseConfig, isConfigured } from './firebase-config'
import { getFavorites, replaceFavorites } from './favorites'
import { getHistory, getWatchedMap, replaceHistory, replaceWatched } from './history'
import { getSettings, applySettings } from './settings'

export const syncEnabled = isConfigured

let auth = null
let db = null
let provider = null
let currentUser = null
let pushTimer = null
let applying = false // true while writing pulled data (suppresses the push loop)
let started = false // initSync guard (run once)
const listeners = new Set() // UI subscribers to the signed-in state

function notify() {
  for (const cb of listeners) cb(currentUser)
}

// Subscribe to sign-in state. Fires immediately with the current user, then on
// every change. Returns an unsubscribe fn.
export function subscribe(cb) {
  listeners.add(cb)
  cb(currentUser)
  return () => listeners.delete(cb)
}

// Lazily load the Firebase SDK only when configured, so the bundle/app work
// without it. Returns the auth + firestore helpers.
async function ensureFirebase() {
  if (auth && db) return true
  if (!isConfigured) return false
  const { initializeApp } = await import('firebase/app')
  const { getAuth, GoogleAuthProvider } = await import('firebase/auth')
  const { getFirestore } = await import('firebase/firestore')
  const app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  db = getFirestore(app)
  provider = new GoogleAuthProvider()
  return true
}

// Snapshot of all synced data from localStorage.
function gather() {
  return {
    history: getHistory(),
    favorites: getFavorites(),
    watched: getWatchedMap(),
    settings: getSettings(),
    updatedAt: Date.now(),
  }
}

// Merge two lists of {id, ...} keeping the entry with the newer timestamp.
function mergeById(a = [], b = [], tsKey) {
  const map = new Map()
  for (const item of [...a, ...b]) {
    if (!item || item.id == null) continue
    const k = String(item.id)
    const prev = map.get(k)
    if (!prev || Number(item[tsKey] || 0) >= Number(prev[tsKey] || 0)) map.set(k, item)
  }
  return [...map.values()].sort((x, y) => Number(y[tsKey] || 0) - Number(x[tsKey] || 0))
}

// Union the watched maps (id → [episodes]).
function mergeWatched(a = {}, b = {}) {
  const out = {}
  for (const src of [a || {}, b || {}]) {
    for (const [id, eps] of Object.entries(src)) {
      const set = new Set(out[id] || [])
      for (const e of Array.isArray(eps) ? eps : []) set.add(Number(e))
      out[id] = [...set].sort((x, y) => x - y)
    }
  }
  return out
}

function mergeData(local, cloud) {
  if (!cloud) return local
  return {
    history: mergeById(local.history, cloud.history, 'updatedAt').slice(0, 20),
    favorites: mergeById(local.favorites, cloud.favorites, 'savedAt').slice(0, 200),
    watched: mergeWatched(local.watched, cloud.watched),
    // Cloud settings win field-by-field so your saved preferences come back.
    settings: { ...local.settings, ...(cloud.settings || {}) },
    updatedAt: Date.now(),
  }
}

// Write merged data into localStorage without triggering a push, then tell the
// UI (App re-reads My List / Continue Watching; settings refresh live).
function apply(data) {
  applying = true
  replaceHistory(data.history)
  replaceFavorites(data.favorites)
  replaceWatched(data.watched)
  applySettings(data.settings)
  applying = false
  try {
    window.dispatchEvent(new Event('bloodfang:datasynced'))
  } catch {
    /* no window */
  }
}

async function pushNow() {
  if (!currentUser || !db) return
  try {
    const { doc, setDoc } = await import('firebase/firestore')
    await setDoc(doc(db, 'users', currentUser.uid), gather())
  } catch {
    /* offline / rules — will retry on the next change */
  }
}

function schedulePush() {
  if (!currentUser || applying) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(pushNow, 1200)
}

async function pullAndMerge() {
  if (!currentUser || !db) return
  try {
    const { doc, getDoc } = await import('firebase/firestore')
    const snap = await getDoc(doc(db, 'users', currentUser.uid))
    const cloud = snap.exists() ? snap.data() : null
    apply(mergeData(gather(), cloud))
    await pushNow() // store the union so the cloud has everything too
  } catch {
    /* offline — keep local, try again next change */
  }
}

// Start sync once at app boot. Safe to call when not configured (does nothing).
// UI subscribes via subscribe() instead of a callback here.
export async function initSync() {
  if (started) return
  started = true
  if (!(await ensureFirebase())) return
  const { onAuthStateChanged } = await import('firebase/auth')
  onAuthStateChanged(auth, async (user) => {
    currentUser = user
    notify()
    if (user) await pullAndMerge()
  })
  // Push local edits (favorite toggle, progress, settings…) while signed in.
  window.addEventListener('bloodfang:datachange', schedulePush)
}

export async function signInWithGoogle() {
  if (!(await ensureFirebase())) return
  const { signInWithPopup } = await import('firebase/auth')
  await signInWithPopup(auth, provider)
}

export async function signOutUser() {
  if (!auth) return
  const { signOut } = await import('firebase/auth')
  await signOut(auth)
}

export const getCurrentUser = () => currentUser
