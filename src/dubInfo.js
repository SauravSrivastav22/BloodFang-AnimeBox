// Knows when a dub doesn't exist, which the embed players never tell us: asked
// for a dub they often just play the Japanese audio. Two public, regularly
// updated lists, read directly by the browser so the static site gets this too:
//   • AniSchedule: airing dubs and their next episode (per-episode answer)
//   • MAL-Dubs: every title with an English dub (per-title answer)
// Any doubt returns null (no warning): a false "no dub" is worse than none.

const SCHEDULE_URL = 'https://raw.githubusercontent.com/RockinChaos/AniSchedule/master/raw/dub-schedule.json'
const TITLES_URL = 'https://raw.githubusercontent.com/MAL-Dubs/MAL-Dubs/main/data/dubInfo.json'
const CACHE_KEY = 'bloodfang:dubdata:v1'
const CACHE_MS = 6 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 5000

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY))
    return cached && Date.now() - cached.savedAt < CACHE_MS ? cached : null
  } catch {
    return null
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    /* storage full or disabled: we just fetch again next time */
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Dub list responded ${res.status}`)
  return res.json()
}

async function fetchDubData() {
  const [schedule, titles] = await Promise.all([fetchJson(SCHEDULE_URL), fetchJson(TITLES_URL)])
  const data = {
    savedAt: Date.now(),
    airing: schedule
      .filter((s) => s.media?.media?.id && s.episodeNumber && s.episodeDate)
      .map((s) => ({ id: s.media.media.id, next: s.episodeNumber, date: s.episodeDate })),
    dubbedMalIds: titles.dubbed ?? [],
  }
  writeCache(data)
  return data
}

let dubData = null
function loadDubData() {
  if (!dubData) {
    const cached = readCache()
    dubData = cached
      ? Promise.resolve(cached)
      : fetchDubData().catch(() => {
          dubData = null // a later episode can try again
          return null
        })
  }
  return dubData
}

// Returns null if a dub may exist, otherwise why it doesn't:
//   { kind: 'episode', lastDubbed } or { kind: 'title' }
export async function findDubGap({ anilistId, malId, episode }) {
  const data = await loadDubData()
  if (!data) return null

  const airing = data.airing.find((a) => a.id === Number(anilistId))
  if (airing) {
    const nextIsOut = new Date(airing.date).getTime() <= Date.now()
    const lastDubbed = nextIsOut ? airing.next : airing.next - 1
    if (Number(episode) <= lastDubbed) return null
    return lastDubbed > 0 ? { kind: 'episode', lastDubbed } : { kind: 'title' }
  }

  if (malId && data.dubbedMalIds.length && !data.dubbedMalIds.includes(Number(malId))) {
    return { kind: 'title' }
  }
  return null
}
