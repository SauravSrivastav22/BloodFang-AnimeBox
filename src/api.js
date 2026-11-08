// Frontend API client — talks to the BloodFang backend (see server/index.js).
// In dev, Vite proxies /api → http://localhost:3001.
//
// STATIC/HOSTED build: when built with VITE_DATA_MODE=direct (Firebase Hosting,
// no backend), the data calls go straight to AniList from the browser instead of
// to /api. Local `npm run prod` leaves this unset and uses the Express backend.
import { getSettings } from './settings'
import { getInfoDirect, getTrendingDirect, searchDirect } from './anilist-direct'

// True in the static/hosted build (talks straight to AniList, no backend).
export const DIRECT = import.meta.env.VITE_DATA_MODE === 'direct'

// Fetch with a hard timeout so the UI can never hang forever waiting on a slow
// or stuck backend — instead the caller's error/retry state kicks in.
async function get(path, timeoutMs = 20000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res
  try {
    res = await fetch(path, { signal: controller.signal })
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Request timed out. The source may be down — try again.')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    throw new Error(message)
  }
  return res.json()
}

export const getTrending = (page = 1) =>
  DIRECT ? getTrendingDirect(page) : get(`/api/trending?page=${page}`)

// Combined search + genre (category) filter + sort + advanced filters
// (year / season / format / status). Empty values are omitted (treated as "any").
export function searchAnime({
  query = '',
  genres = [],
  sort = '',
  year = '',
  season = '',
  format = '',
  status = '',
  page = 1,
} = {}) {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (genres.length) params.set('genres', genres.join(','))
  if (sort) params.set('sort', sort)
  if (year) params.set('year', String(year))
  if (season) params.set('season', season)
  if (format) params.set('format', format)
  if (status) params.set('status', status)
  // Include 18+ titles only when the user has opted in (Settings).
  const adult = getSettings().adult
  if (DIRECT) {
    return searchDirect({ query, genres, sort, year, season, format, status, adult, page })
  }
  if (adult) params.set('adult', '1')
  params.set('page', String(page))
  return get(`/api/search?${params.toString()}`)
}

// Sort options for the browse view (key must match the backend SORT_MAP).
export const SORTS = [
  { key: '', label: 'Default' },
  { key: 'trending', label: 'Trending' },
  { key: 'popular', label: 'Most Popular' },
  { key: 'score', label: 'Top Rated' },
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'title', label: 'Title A–Z' },
]

// Advanced-filter options for the browse view. `key` is the value sent to the
// backend (AniList enum / year); '' means "any".
export const SEASONS = [
  { key: '', label: 'Any season' },
  { key: 'WINTER', label: 'Winter' },
  { key: 'SPRING', label: 'Spring' },
  { key: 'SUMMER', label: 'Summer' },
  { key: 'FALL', label: 'Fall' },
]
export const FORMATS = [
  { key: '', label: 'Any format' },
  { key: 'TV', label: 'TV' },
  { key: 'TV_SHORT', label: 'TV Short' },
  { key: 'MOVIE', label: 'Movie' },
  { key: 'OVA', label: 'OVA' },
  { key: 'ONA', label: 'ONA' },
  { key: 'SPECIAL', label: 'Special' },
  { key: 'MUSIC', label: 'Music' },
]
export const STATUSES = [
  { key: '', label: 'Any status' },
  { key: 'RELEASING', label: 'Airing' },
  { key: 'FINISHED', label: 'Finished' },
  { key: 'NOT_YET_RELEASED', label: 'Upcoming' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'HIATUS', label: 'Hiatus' },
]
// Years from next year back to 1960 (built at import; fine for a client app).
export const YEARS = (() => {
  const now = new Date().getFullYear()
  const list = [{ key: '', label: 'Any year' }]
  for (let y = now + 1; y >= 1960; y--) list.push({ key: String(y), label: String(y) })
  return list
})()

export const getInfo = (id) =>
  DIRECT ? getInfoDirect(id) : get(`/api/info/${encodeURIComponent(id)}`)

// Dub availability, fetched separately after the detail page paints (the check
// is slow/flaky, so it must not block the first render). Not available in the
// static build (needs the scraper) → null = stay dub-first.
export const getDub = (id, title = '') =>
  DIRECT
    ? Promise.resolve({ dubAvailable: null })
    : get(`/api/dub/${encodeURIComponent(id)}?title=${encodeURIComponent(title)}`)

// Category filter chips. Real AniList genres + popular TAGS (Isekai, etc.) — the
// backend routes each chip to genre_in or tag_in automatically.
export const GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Horror',
  'Isekai',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
]

// ─── Our own player (custom HLS) ─────────────────────────────────────────────
// Base URL of the stream backend (/api/stream + /api/proxy). Local build: same
// origin (''). Hosted static build: only available when VITE_STREAM_API points
// at a deployed backend; otherwise our player is hidden and embeds are used.
export const STREAM_API = (import.meta.env.VITE_STREAM_API || '').replace(/\/$/, '')
export const HAS_STREAM_API = !DIRECT || Boolean(STREAM_API)

// Resolve (AniList id, episode, sub|dub) → { ok, m3u8, subtitles, headers, ... }.
// Never throws for "not found" — returns { ok:false, error } so the player can
// fall back to an embed server.
export async function getStream(anilistId, episode, type) {
  const q = `anilist=${encodeURIComponent(anilistId)}&ep=${encodeURIComponent(episode)}&type=${type}`
  try {
    return await get(`${STREAM_API}/api/stream?${q}`, 60000)
  } catch (err) {
    return { ok: false, error: err?.message || 'Stream service unreachable' }
  }
}

// Route a media/subtitle URL through our relay (CORS + Referer handling).
export const proxied = (url, referer) =>
  `${STREAM_API}/api/proxy?url=${encodeURIComponent(url)}${
    referer ? `&ref=${encodeURIComponent(referer)}` : ''
  }`
