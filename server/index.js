// BloodFang backend — proxies anime data via @consumet/extensions.
// The React frontend talks ONLY to this server, which handles CORS and the
// scraping/aggregation. Metadata + search + genre filtering come from AniList.
// For in-app streaming we keep SEVERAL providers (HiAnime, AnimePahe, AnimeKai)
// and fall back across them, since any single scraper source is often down.
import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { META, ANIME } from '@consumet/extensions'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.join(__dirname, '..', 'dist')
const HAS_BUILD = fs.existsSync(path.join(DIST_DIR, 'index.html'))

const app = express()
app.use(cors())

const PORT = process.env.PORT || 3001
const PER_PAGE = 24

// AniList catalog engine (trending/popular) and a raw HiAnime provider used only
// for the sub/dub availability check.
const anilist = new META.Anilist(new ANIME.Hianime())
const rawHianime = new ANIME.Hianime()

// Small wrapper so every route reports upstream failures cleanly instead of
// hanging or crashing the process (these providers break/rate-limit often).
const route = (handler) => async (req, res) => {
  try {
    res.json(await handler(req))
  } catch (err) {
    console.error(`[${req.path}]`, err?.message || err)
    res.status(502).json({ error: err?.message || 'Upstream provider error' })
  }
}

const page = (req) => Number(req.query.page) || 1

// Tiny in-memory TTL cache for AniList responses. AniList rate-limits (and
// occasionally 5xxs), so caching identical calls for a few minutes smooths out
// the browse/detail experience. Only successful results are cached.
const _cache = new Map()
async function cached(key, ttlMs, fn) {
  const hit = _cache.get(key)
  if (hit && hit.exp > Date.now()) return hit.val
  const val = await fn()
  _cache.set(key, { val, exp: Date.now() + ttlMs })
  // Opportunistic cleanup so the map can't grow unbounded.
  if (_cache.size > 500) {
    const now = Date.now()
    for (const [k, v] of _cache) if (v.exp < now) _cache.delete(k)
  }
  return val
}
const CACHE_META = 10 * 60 * 1000 // metadata/episodes change rarely
const CACHE_SEARCH = 5 * 60 * 1000 // search/browse results

// Reliable episode list straight from AniList (always up, unlike the scraper
// mirrors). Returns episodes with titles, thumbnails and legal streaming links
// (Crunchyroll, etc.). Used so the detail page always shows episodes even when
// the in-app streaming provider is down.
function fetchAniListEpisodes(id) {
  return cached(`eps:${id}`, CACHE_META, async () => {
    const query = `query($id:Int){Media(id:$id,type:ANIME){episodes streamingEpisodes{title thumbnail url site}}}`
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { id: Number(id) } }),
    })
    if (!res.ok) throw new Error(`AniList responded ${res.status}`)
    const json = await res.json()
    const media = json?.data?.Media
    const list = media?.streamingEpisodes ?? []
    // Normalise to the same shape the UI already uses for episodes.
    return list.map((ep, i) => ({
      id: ep.url, // external link acts as the id here
      number: i + 1,
      title: ep.title,
      image: ep.thumbnail,
      url: ep.url,
      site: ep.site,
      external: true, // opens the legal streaming site in a new tab
    }))
  })
}

// Shared GraphQL selection + mapper for a "card" (grid poster) — reused by the
// related/recommendations lists so they match the shape the UI grid expects.
const MEDIA_CARD_FIELDS = `idMal title{romaji english userPreferred} coverImage{extraLarge large} averageScore episodes format startDate{year}`
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

// Reliable title metadata straight from AniList GraphQL (always up, fast).
// We use this instead of Consumet's fetchAnilistInfoById, which couples the
// metadata call to the HiAnime scraper and HANGS when that source is down.
// Returns the same shape the detail page already expects.
function fetchAniListMeta(id) {
  return cached(`meta:${id}`, CACHE_META, () => _fetchAniListMeta(id))
}
async function _fetchAniListMeta(id) {
  const query = `query($id:Int){Media(id:$id,type:ANIME){
    id idMal title{romaji english userPreferred native}
    coverImage{extraLarge large} bannerImage description
    genres averageScore episodes duration status format startDate{year}
    nextAiringEpisode{ episode }
    trailer{ id site thumbnail }
    characters(sort:ROLE,perPage:12){ edges{ role node{ name{ full } image{ large } } } }
    relations{ edges{ relationType node{ id type ${MEDIA_CARD_FIELDS} } } }
    recommendations(sort:RATING_DESC,perPage:12){ nodes{ mediaRecommendation{ id type ${MEDIA_CARD_FIELDS} } } }
  }}`
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables: { id: Number(id) } }),
  })
  if (!res.ok) throw new Error(`AniList responded ${res.status}`)
  const m = res && (await res.json())?.data?.Media
  if (!m) throw new Error('Title not found on AniList')
  // Related titles (sequels/prequels/etc.) — anime only, tagged with the relation.
  const related = (m.relations?.edges ?? [])
    .filter((e) => e.node?.type === 'ANIME')
    .map((e) => ({ ...toCard(e.node), relation: e.relationType }))
  // "You might also like" — anime only, de-duped, best first.
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
    rating: m.averageScore, // 0–100, matches Consumet's convention
    totalEpisodes: m.episodes,
    duration: m.duration,
    status: m.status,
    type: m.format,
    releaseDate: m.startDate?.year,
    // For airing shows, the next episode number → (n-1) is the latest aired,
    // used to list ALL episodes when `episodes` is null (e.g. One Piece).
    nextAiringEpisode: m.nextAiringEpisode?.episode ?? null,
    // Only YouTube trailers can be embedded; ignore other hosts.
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

// AniList's fixed genre list. Anything a user selects that ISN'T one of these
// (e.g. "Isekai") is an AniList *tag*, so we route it to tag_in instead.
const ANILIST_GENRES = new Set([
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror',
  'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance',
  'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller',
])

// Direct AniList search — supports free text, genres, TAGS (Isekai, etc.) and
// sort (rating/date/popularity). Reliable (AniList is always up) and returns the
// same result shape the grid already uses.
function fetchAniListSearch(opts) {
  return cached(`search:${JSON.stringify(opts)}`, CACHE_SEARCH, () => _fetchAniListSearch(opts))
}
async function _fetchAniListSearch({
  query,
  genres = [],
  tags = [],
  sort,
  year,
  season,
  format,
  status,
  allowAdult = false,
  page = 1,
}) {
  // AniList treats isAdult:null as a literal filter (matches nothing), so to show
  // adult titles we OMIT the argument entirely rather than passing null.
  const adultArg = allowAdult ? '' : 'isAdult:false,'
  const gql = `query($page:Int,$perPage:Int,$search:String,$genres:[String],$tags:[String],$sort:[MediaSort],$year:Int,$season:MediaSeason,$format:MediaFormat,$status:MediaStatus){
    Page(page:$page,perPage:$perPage){
      pageInfo{ hasNextPage currentPage }
      media(type:ANIME,${adultArg}search:$search,genre_in:$genres,tag_in:$tags,sort:$sort,seasonYear:$year,season:$season,format:$format,status:$status){
        id idMal title{romaji english userPreferred}
        coverImage{extraLarge large} averageScore episodes format startDate{year} genres
      }
    }
  }`
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      query: gql,
      variables: {
        page,
        perPage: PER_PAGE,
        search: query || undefined,
        genres: genres.length ? genres : undefined,
        tags: tags.length ? tags : undefined,
        sort,
        year: year || undefined,
        season: season || undefined,
        format: format || undefined,
        status: status || undefined,
      },
    }),
  })
  if (!res.ok) throw new Error(`AniList responded ${res.status}`)
  const data = (await res.json())?.data?.Page
  const results = (data?.media ?? []).map((m) => ({
    id: m.id,
    malId: m.idMal,
    title: m.title,
    image: m.coverImage?.extraLarge || m.coverImage?.large,
    rating: m.averageScore, // 0–100 (card shows /10)
    totalEpisodes: m.episodes,
    type: m.format,
    releaseDate: m.startDate?.year,
    genres: m.genres ?? [],
  }))
  return { results, currentPage: data?.pageInfo?.currentPage ?? page, hasNextPage: Boolean(data?.pageInfo?.hasNextPage) }
}

// Best-effort dub check: search HiAnime for the title and read its dub episode
// count. Returns true/false when known, or null when the source is unreachable
// (caller treats null as "offer dub" so we stay dub-first by default).
async function checkDubAvailable(title) {
  if (!title) return null
  try {
    const res = await withTimeout(rawHianime.search(title), 3000, 'dub check')
    const hit = res?.results?.[0]
    if (!hit) return null
    const dub = Number(hit.dub ?? hit.episodes?.dub ?? 0)
    return dub > 0
  } catch {
    return null
  }
}

// Race a promise against a timeout so a down/slow provider can't hang a request.
const withTimeout = (promise, ms, label = 'request') =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ])

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// Home feed
app.get('/api/trending', route((req) => anilist.fetchTrendingAnime(page(req), PER_PAGE)))
app.get('/api/popular', route((req) => anilist.fetchPopularAnime(page(req), PER_PAGE)))

// Friendly sort keys → AniList MediaSort enums (used by advancedSearch).
const SORT_MAP = {
  trending: ['TRENDING_DESC'],
  popular: ['POPULARITY_DESC'],
  score: ['SCORE_DESC'], // top rated
  newest: ['START_DATE_DESC'],
  oldest: ['START_DATE'],
  title: ['TITLE_ROMAJI'],
}

// Search + category filter (genres AND tags like Isekai) + sort, in one endpoint.
// /api/search?q=naruto&genres=Action,Isekai&sort=score
app.get(
  '/api/search',
  route((req) => {
    const q = (req.query.q || '').toString().trim()
    const chips = (req.query.genres || '')
      .toString()
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean)
    const sortKey = (req.query.sort || '').toString()
    // Advanced filters (all optional). Year/season/format/status map straight to
    // AniList media args; empty strings are treated as "any".
    const year = Number(req.query.year) || undefined
    const season = (req.query.season || '').toString().toUpperCase() || undefined
    const format = (req.query.format || '').toString().toUpperCase() || undefined
    const status = (req.query.status || '').toString().toUpperCase() || undefined
    const allowAdult = req.query.adult === '1'
    const hasAdvanced = Boolean(year || season || format || status)

    // Nothing selected → home feed (trending).
    if (!q && !chips.length && !sortKey && !hasAdvanced)
      return anilist.fetchTrendingAnime(page(req), PER_PAGE)

    // Split selected chips into real AniList genres vs tags (e.g. Isekai).
    const genres = chips.filter((c) => ANILIST_GENRES.has(c))
    const tags = chips.filter((c) => !ANILIST_GENRES.has(c))
    // Chosen sort, else relevance for a text query, else most-popular.
    const sort = SORT_MAP[sortKey] || (q ? ['SEARCH_MATCH'] : ['POPULARITY_DESC'])

    return fetchAniListSearch({
      query: q || null,
      genres,
      tags,
      sort,
      year,
      season,
      format,
      status,
      allowAdult,
      page: page(req),
    })
  }),
)

// Full details for one title (AniList id) — FAST PATH.
// Only the two quick, reliable AniList calls (metadata + episode list) run here,
// in parallel, so the detail page paints in ~1–2s even when the scraper sources
// are down. The slower dub check moves to /api/dub, which the page fetches after
// it has painted (see below). `dubAvailable: null` here → dub-first by default.
app.get(
  '/api/info/:id',
  route(async (req) => {
    const id = req.params.id
    const [metaRes, streamRes] = await Promise.allSettled([
      withTimeout(fetchAniListMeta(id), 8000, 'AniList metadata'),
      withTimeout(fetchAniListEpisodes(id), 6000, 'AniList episodes'),
    ])
    if (metaRes.status !== 'fulfilled') throw metaRes.reason // no metadata → 502 → retry UI
    const streamingEpisodes = streamRes.status === 'fulfilled' ? streamRes.value : []
    return { ...metaRes.value, streamingEpisodes, dubAvailable: null }
  }),
)

// Dub availability — fetched separately by the detail page AFTER it paints, so
// the slow/flaky HiAnime dub check never delays the first render. `?title=…`
// comes from the metadata the page already has. Returns null when unknown
// (→ the page stays dub-first, hiding Dub only when we positively know it's
// sub-only).
app.get(
  '/api/dub/:id',
  route(async (req) => {
    const dubAvailable = await checkDubAvailable((req.query.title || '').toString())
    return { dubAvailable }
  }),
)

// ─── M1 · Custom-player stream resolver ──────────────────────────────────────
// Turns (AniList id, episode number, sub/dub) into a real .m3u8 URL + subtitle
// tracks so OUR OWN hls.js player (M3) can play it with a 2-min pre-load buffer,
// a real subtitle-language menu, and no pop-up ads. Built on the same
// AniList→HiAnime mapper the rest of the server already uses.
//
//   GET /api/stream?anilist=<id>&ep=<n>&type=sub|dub
//   →   { ok:true, m3u8, subtitles:[{lang,url}], headers, provider, type }
//   or  { ok:false, error }   ← frontend falls back to the embed player
//
// Stream links expire quickly, so results are cached only briefly. Failures are
// NOT cached, so a retry can still succeed after a transient provider hiccup.
const CACHE_STREAM = 5 * 60 * 1000

async function resolveStream({ anilistId, episode, type }) {
  const dub = type === 'dub'
  // 1) Map the AniList id → provider episode list. Dub episodes have their own
  //    ids on HiAnime, so we ask for the dub list when type=dub.
  const info = await withTimeout(anilist.fetchAnimeInfo(anilistId, dub), 15000, 'anime info')
  const episodes = info?.episodes ?? []
  const match = episodes.find((e) => Number(e.number) === Number(episode))
  if (!match) throw new Error(`Episode ${episode} not found (${dub ? 'dub' : 'sub'})`)
  // 2) Resolve the real stream sources for that episode.
  const data = await withTimeout(anilist.fetchEpisodeSources(match.id), 15000, 'episode sources')
  const sources = data?.sources ?? []
  // Prefer the adaptive "auto" HLS playlist (lets hls.js pick quality), then any
  // m3u8, then whatever the provider gave us.
  const m3u8 =
    sources.find((s) => s.quality === 'auto' && s.isM3U8)?.url ||
    sources.find((s) => s.isM3U8)?.url ||
    sources[0]?.url
  if (!m3u8) throw new Error('No playable stream found')
  return {
    ok: true,
    m3u8,
    // Subtitle tracks power the real language menu in our player (M3).
    subtitles: (data?.subtitles ?? [])
      .filter((s) => s?.url && (s.lang || '').toLowerCase() !== 'thumbnails')
      .map((s) => ({ lang: s.lang, url: s.url })),
    // The CDN often needs these (Referer/Origin) — the M2 proxy will forward them.
    headers: data?.headers ?? {},
    provider: 'hianime',
    type: dub ? 'dub' : 'sub',
  }
}

app.get(
  '/api/stream',
  route(async (req) => {
    const anilistId = Number(req.query.anilist)
    const episode = Number(req.query.ep)
    const type = req.query.type === 'dub' ? 'dub' : 'sub'
    if (!anilistId || !episode) return { ok: false, error: 'anilist and ep are required' }
    const key = `stream:${anilistId}:${episode}:${type}`
    try {
      return await cached(key, CACHE_STREAM, () => resolveStream({ anilistId, episode, type }))
    } catch (err) {
      // Graceful fallback: never 502 here — the frontend reads ok:false and drops
      // back to the embed player, so the app never dead-ends on a broken source.
      return { ok: false, error: err?.message || 'Could not resolve stream' }
    }
  }),
)

// In production, this one server also serves the built React app (dist/), so the
// whole thing runs on a single port with no Vite. In dev there's no build, so we
// skip this and the Vite dev server handles the UI on :5173.
if (HAS_BUILD) {
  app.use(express.static(DIST_DIR))
  // SPA fallback: any non-API route serves index.html (Express 5-safe — no path
  // pattern, just a trailing middleware).
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  })
}

app.listen(PORT, () => {
  if (HAS_BUILD) {
    console.log(`BloodFang running at http://localhost:${PORT}  (app + API on one port)`)
  } else {
    console.log(`BloodFang API listening on http://localhost:${PORT}  (no build — run "npm run build" for production)`)
  }
})
