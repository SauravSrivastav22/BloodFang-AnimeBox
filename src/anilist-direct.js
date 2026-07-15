// Browser-side AniList data layer — used by the STATIC (Firebase-hosted) build,
// where there's no Express backend. AniList's GraphQL API allows cross-origin
// browser requests, so the app can fetch catalog/metadata/search directly.
//
// This mirrors the server's queries (server/index.js). The local `npm run prod`
// build still uses the Express backend; only a build with VITE_DATA_MODE=direct
// uses this module (see api.js).

const ENDPOINT = 'https://graphql.anilist.co'
const PER_PAGE = 24

// --- Client-side cache + throttle + 429 retry -------------------------------
// The static build calls AniList directly (no server cache) and AniList rate-
// limits to ~30 req/min. A normal home load fires ~10 queries, so without this
// the site trips HTTP 429 during ordinary browsing. To prevent that we:
//   • cache responses in memory + sessionStorage (so a reload refetches nothing),
//   • de-dupe identical in-flight requests,
//   • cap concurrency so the home load doesn't burst,
//   • retry on 429, honoring the Retry-After header.
const SS_PREFIX = 'bloodfang:acache:'
const TTL_SEARCH = 5 * 60 * 1000 // trending/search results
const TTL_INFO = 10 * 60 * 1000 // metadata/episodes (change rarely)
const mem = new Map() // key -> { exp, data }
const inflight = new Map() // key -> Promise

function cacheGet(key) {
  const hit = mem.get(key)
  if (hit && hit.exp > Date.now()) return hit.data
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + key)
    if (raw) {
      const o = JSON.parse(raw)
      if (o.exp > Date.now()) {
        mem.set(key, o)
        return o.data
      }
      sessionStorage.removeItem(SS_PREFIX + key)
    }
  } catch {
    /* sessionStorage unavailable — memory cache still applies */
  }
  return null
}

function cacheSet(key, data, ttlMs) {
  const o = { exp: Date.now() + ttlMs, data }
  mem.set(key, o)
  try {
    sessionStorage.setItem(SS_PREFIX + key, JSON.stringify(o))
  } catch {
    /* quota / disabled — ignore */
  }
}

// Simple concurrency limiter so ~10 home queries don't hit AniList all at once.
const MAX_CONCURRENT = 4
let active = 0
const waiters = []
function acquire() {
  if (active < MAX_CONCURRENT) {
    active++
    return Promise.resolve()
  }
  return new Promise((res) => waiters.push(res))
}
function release() {
  active--
  const next = waiters.shift()
  if (next) {
    active++
    next()
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function rawFetch(query, variables) {
  const MAX_RETRY = 3
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    if (res.status === 429 && attempt < MAX_RETRY) {
      // Honor Retry-After (seconds); fall back to exponential backoff.
      const wait = Number(res.headers.get('Retry-After')) || 2 ** attempt
      await sleep(wait * 1000)
      continue
    }
    if (!res.ok) throw new Error(`AniList responded ${res.status}`)
    const json = await res.json()
    if (json.errors?.length) throw new Error(json.errors[0]?.message || 'AniList error')
    return json.data
  }
}

async function gql(query, variables, ttlMs = TTL_SEARCH) {
  const key = query.replace(/\s+/g, ' ').trim() + '|' + JSON.stringify(variables ?? {})
  const cached = cacheGet(key)
  if (cached) return cached
  if (inflight.has(key)) return inflight.get(key) // de-dupe identical requests
  const p = (async () => {
    await acquire()
    try {
      const data = await rawFetch(query, variables)
      cacheSet(key, data, ttlMs)
      return data
    } finally {
      release()
      inflight.delete(key)
    }
  })()
  inflight.set(key, p)
  return p
}

// Real AniList genres — anything else a user picks (e.g. "Isekai") is a TAG.
const ANILIST_GENRES = new Set([
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror',
  'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance',
  'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller',
])

const SORT_MAP = {
  trending: ['TRENDING_DESC'],
  popular: ['POPULARITY_DESC'],
  score: ['SCORE_DESC'],
  newest: ['START_DATE_DESC'],
  oldest: ['START_DATE'],
  title: ['TITLE_ROMAJI'],
}

const CARD_FIELDS = `idMal title{romaji english userPreferred} coverImage{extraLarge large} averageScore episodes format startDate{year}`
const toCard = (m) => ({
  id: m.id,
  malId: m.idMal,
  title: m.title,
  image: m.coverImage?.extraLarge || m.coverImage?.large,
  rating: m.averageScore,
  totalEpisodes: m.episodes,
  type: m.format,
  releaseDate: m.startDate?.year,
})

// Shared Page(media) query — used by trending + search.
async function pageQuery(vars, adultArg, sort) {
  const query = `query($page:Int,$perPage:Int,$search:String,$genres:[String],$tags:[String],$sort:[MediaSort],$year:Int,$season:MediaSeason,$format:MediaFormat,$status:MediaStatus){
    Page(page:$page,perPage:$perPage){
      pageInfo{ hasNextPage currentPage }
      media(type:ANIME,${adultArg}search:$search,genre_in:$genres,tag_in:$tags,sort:$sort,seasonYear:$year,season:$season,format:$format,status:$status){
        id idMal title{romaji english userPreferred}
        coverImage{extraLarge large} averageScore episodes format startDate{year} genres
      }
    }
  }`
  const data = await gql(query, { ...vars, sort })
  const p = data?.Page
  return {
    results: (p?.media ?? []).map((m) => ({ ...toCard(m), genres: m.genres ?? [] })),
    currentPage: p?.pageInfo?.currentPage ?? vars.page,
    hasNextPage: Boolean(p?.pageInfo?.hasNextPage),
  }
}

export function getTrendingDirect(page = 1) {
  return pageQuery(
    { page, perPage: PER_PAGE, search: undefined, genres: undefined, tags: undefined },
    'isAdult:false,',
    ['TRENDING_DESC'],
  )
}

// Search + genre/tag + sort + advanced filters. Accepts the same shape the app's
// searchAnime() already builds (plus `adult`).
export function searchDirect({
  query = '',
  genres = [],
  sort = '',
  year = '',
  season = '',
  format = '',
  status = '',
  adult = false,
  page = 1,
} = {}) {
  const q = (query || '').trim()
  const chips = (genres || []).filter(Boolean)
  const advActive = Boolean(year || season || format || status)
  // Nothing selected → trending.
  if (!q && !chips.length && !sort && !advActive) return getTrendingDirect(page)

  const g = chips.filter((c) => ANILIST_GENRES.has(c))
  const tags = chips.filter((c) => !ANILIST_GENRES.has(c))
  const sortEnum = SORT_MAP[sort] || (q ? ['SEARCH_MATCH'] : ['POPULARITY_DESC'])
  const adultArg = adult ? '' : 'isAdult:false,'
  return pageQuery(
    {
      page,
      perPage: PER_PAGE,
      search: q || undefined,
      genres: g.length ? g : undefined,
      tags: tags.length ? tags : undefined,
      year: Number(year) || undefined,
      season: (season || '').toUpperCase() || undefined,
      format: (format || '').toUpperCase() || undefined,
      status: (status || '').toUpperCase() || undefined,
    },
    adultArg,
    sortEnum,
  )
}

async function fetchMeta(id) {
  const query = `query($id:Int){Media(id:$id,type:ANIME){
    id idMal title{romaji english userPreferred native}
    coverImage{extraLarge large} bannerImage description
    genres averageScore episodes duration status format startDate{year}
    trailer{ id site thumbnail }
    characters(sort:ROLE,perPage:12){ edges{ role node{ name{ full } image{ large } } } }
    relations{ edges{ relationType node{ id type ${CARD_FIELDS} } } }
    recommendations(sort:RATING_DESC,perPage:12){ nodes{ mediaRecommendation{ id type ${CARD_FIELDS} } } }
  }}`
  const m = (await gql(query, { id: Number(id) }, TTL_INFO))?.Media
  if (!m) throw new Error('Title not found on AniList')
  const related = (m.relations?.edges ?? [])
    .filter((e) => e.node?.type === 'ANIME')
    .map((e) => ({ ...toCard(e.node), relation: e.relationType }))
  const recommendations = (m.recommendations?.nodes ?? [])
    .map((n) => n.mediaRecommendation)
    .filter((r) => r?.type === 'ANIME')
    .map(toCard)
  return {
    id: m.id,
    malId: m.idMal,
    title: m.title,
    image: m.coverImage?.extraLarge || m.coverImage?.large,
    cover: m.bannerImage,
    description: m.description,
    genres: m.genres ?? [],
    rating: m.averageScore,
    totalEpisodes: m.episodes,
    duration: m.duration,
    status: m.status,
    type: m.format,
    releaseDate: m.startDate?.year,
    trailer: m.trailer?.site === 'youtube' ? { id: m.trailer.id, thumbnail: m.trailer.thumbnail } : null,
    characters: (m.characters?.edges ?? []).map((e) => ({
      name: e.node?.name?.full,
      image: e.node?.image?.large,
      role: e.role,
    })),
    related,
    recommendations,
  }
}

async function fetchEpisodes(id) {
  const query = `query($id:Int){Media(id:$id,type:ANIME){streamingEpisodes{title thumbnail url site}}}`
  const m = (await gql(query, { id: Number(id) }, TTL_INFO))?.Media
  return (m?.streamingEpisodes ?? []).map((ep, i) => ({
    id: ep.url,
    number: i + 1,
    title: ep.title,
    image: ep.thumbnail,
    url: ep.url,
    site: ep.site,
    external: true,
  }))
}

// /api/info equivalent: metadata + episodes together. Dub check isn't available
// client-side (needs the scraper), so dubAvailable stays null → dub-first.
export async function getInfoDirect(id) {
  const [meta, streamingEpisodes] = await Promise.all([
    fetchMeta(id),
    fetchEpisodes(id).catch(() => []),
  ])
  return { ...meta, streamingEpisodes, dubAvailable: null }
}
