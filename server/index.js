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
import { HiAnime } from 'aniwatch'

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
  }
  lastAired: Page(perPage:1){ airingSchedules(mediaId:$id,notYetAired:false,sort:EPISODE_DESC){ episode } }
  }`
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables: { id: Number(id) } }),
  })
  if (!res.ok) throw new Error(`AniList responded ${res.status}`)
  const data = (await res.json())?.data
  const m = data?.Media
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
    // Latest aired episode from the schedule — covers long runners/hiatus shows
    // that have no `episodes` total AND no nextAiringEpisode (e.g. Chiikawa).
    lastAiredEpisode: data?.lastAired?.airingSchedules?.[0]?.episode ?? null,
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

// `resolver` lets us confirm which build is live: 'aniwatch' = the M1 fix is
// deployed; absent = still the old Consumet-only build. `build` bumps whenever we
// ship a change we need to confirm actually landed (Render's auto-deploy has been
// flaky about picking up new commits).
app.get('/api/health', (_req, res) => res.json({ ok: true, resolver: 'aniwatch', build: 'probe-1' }))

// ─── Diagnostic · why is the source blocking us? ─────────────────────────────
// One decisive test: from wherever this server runs (e.g. Render's datacenter IP),
// hit the source directly with realistic browser headers and report the RAW HTTP
// status + Cloudflare headers + a body snippet. This tells us which block we face:
//   • 403 + "Just a moment" / cf challenge body  → JS challenge  (needs a browser)
//   • 403/503 + cf-ray, no challenge to solve     → IP hard-block (browser won't help)
//   • 200 but body is HTML, not our data          → endpoint moved / different cause
//   • connection error / timeout                  → TLS fingerprint or network block
// Purely diagnostic; safe to remove once we know the answer.
app.get(
  '/api/probe',
  route(async () => {
    const targets = [
      'https://hianime.to/',
      'https://hianime.to/ajax/search/suggest?keyword=frieren',
    ]
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://hianime.to/',
    }
    const results = []
    for (const url of targets) {
      try {
        const r = await withTimeout(fetch(url, { headers, redirect: 'manual' }), 12000, 'probe')
        const body = await r.text().catch(() => '')
        results.push({
          url,
          status: r.status,
          server: r.headers.get('server'),
          cfRay: r.headers.get('cf-ray'),
          cfMitigated: r.headers.get('cf-mitigated'),
          location: r.headers.get('location'),
          contentType: r.headers.get('content-type'),
          bodyLen: body.length,
          isChallenge: /just a moment|checking your browser|cf-challenge|__cf_chl|turnstile|attention required/i.test(
            body,
          ),
          bodySnippet: body.slice(0, 400),
        })
      } catch (err) {
        results.push({ url, error: err?.message || String(err) })
      }
    }
    return { ok: true, from: 'server-side fetch', results }
  }),
)

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

// Demo stream for building/testing our player while the real source is
// blocked: Apple's public HLS example (multiple qualities + subtitle tracks).
const STREAM_DEMO = process.env.STREAM_DEMO === '1'
const DEMO_STREAM = {
  ok: true,
  m3u8: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
  subtitles: [],
  headers: {},
  intro: null,
  provider: 'demo (Apple HLS example)',
}

// Primary resolver: the maintained `aniwatch` HiAnime scraper. Consumet's own
// providers are currently rotted (every source times out even from a datacenter
// IP — confirmed on Render 2026-07-27), so aniwatch is tried first and Consumet
// is only a last-ditch fallback below.
const hianime = new HiAnime.Scraper()

// Lightweight AniList title lookup (romaji + english) so we can search HiAnime,
// which is title-based (no AniList-id mapping). Cached with the rest of the meta.
function fetchTitles(id) {
  return cached(`titles:${id}`, CACHE_META, async () => {
    const query = `query($id:Int){Media(id:$id,type:ANIME){title{romaji english}format}}`
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { id: Number(id) } }),
    })
    if (!res.ok) throw new Error(`AniList responded ${res.status}`)
    return (await res.json())?.data?.Media ?? null
  })
}

// Loose title key for matching AniList titles against HiAnime search results.
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

async function resolveViaAniwatch({ anilistId, episode, type }) {
  const category = type === 'dub' ? 'dub' : 'sub'
  const meta = await withTimeout(fetchTitles(anilistId), 8000, 'AniList title')
  const titles = [meta?.title?.english, meta?.title?.romaji].filter(Boolean)
  if (!titles.length) throw new Error('No title for that AniList id')

  // 1) Find the matching anime on HiAnime by title.
  let anime = null
  for (const t of titles) {
    const r = await withTimeout(hianime.search(t), 12000, 'search')
    const list = r?.animes ?? []
    if (!list.length) continue
    anime =
      list.find((a) => norm(a.name) === norm(t)) ||
      list.find((a) => norm(a.jname) === norm(t)) ||
      list[0]
    if (anime) break
  }
  if (!anime?.id) throw new Error('Title not found on source')

  // 2) Episode list → the requested number.
  const eps = await withTimeout(hianime.getEpisodes(anime.id), 12000, 'episodes')
  const ep = (eps?.episodes ?? []).find((e) => Number(e.number) === Number(episode))
  if (!ep?.episodeId) throw new Error(`Episode ${episode} not found`)

  // 3) Pick a sub/dub server, then resolve its sources (try each until one works).
  const servers = await withTimeout(hianime.getEpisodeServers(ep.episodeId), 12000, 'servers')
  const avail = servers?.[category] ?? []
  if (!avail.length) throw new Error(`No ${category} stream for episode ${episode}`)
  let data = null
  let lastErr = null
  for (const s of avail) {
    try {
      data = await withTimeout(
        hianime.getEpisodeSources(ep.episodeId, s.serverName, category),
        15000,
        `sources (${s.serverName})`,
      )
      if (data?.sources?.length) break
    } catch (e) {
      lastErr = e
    }
  }
  const m3u8 =
    data?.sources?.find((s) => s.isM3U8)?.url || data?.sources?.[0]?.url
  if (!m3u8) throw new Error(lastErr?.message || 'No playable stream found')
  return {
    ok: true,
    m3u8,
    // Subtitle tracks power the real language menu in our player (M3).
    subtitles: (data?.subtitles ?? [])
      .filter((s) => s?.url && (s.lang || '').toLowerCase() !== 'thumbnails')
      .map((s) => ({ lang: s.lang, url: s.url })),
    // The CDN often needs these (Referer/Origin) — the M2 proxy forwards them.
    headers: data?.headers ?? {},
    intro: data?.intro ?? null,
    provider: 'hianime(aniwatch)',
    type: category,
  }
}

// Last-ditch fallback via Consumet's AniList→HiAnime mapper (kept in case
// aniwatch breaks but Consumet's source is briefly alive).
async function resolveViaConsumet({ anilistId, episode, type }) {
  const dub = type === 'dub'
  const info = await withTimeout(anilist.fetchAnimeInfo(anilistId, dub), 15000, 'anime info')
  const match = (info?.episodes ?? []).find((e) => Number(e.number) === Number(episode))
  if (!match) throw new Error(`Episode ${episode} not found (${dub ? 'dub' : 'sub'})`)
  const data = await withTimeout(anilist.fetchEpisodeSources(match.id), 15000, 'episode sources')
  const sources = data?.sources ?? []
  const m3u8 =
    sources.find((s) => s.quality === 'auto' && s.isM3U8)?.url ||
    sources.find((s) => s.isM3U8)?.url ||
    sources[0]?.url
  if (!m3u8) throw new Error('No playable stream found')
  return {
    ok: true,
    m3u8,
    subtitles: (data?.subtitles ?? [])
      .filter((s) => s?.url && (s.lang || '').toLowerCase() !== 'thumbnails')
      .map((s) => ({ lang: s.lang, url: s.url })),
    headers: data?.headers ?? {},
    provider: 'hianime(consumet)',
    type: dub ? 'dub' : 'sub',
  }
}

async function resolveStream(opts) {
  try {
    return await resolveViaAniwatch(opts)
  } catch (err) {
    // aniwatch failed — try Consumet before giving up.
    try {
      return await resolveViaConsumet(opts)
    } catch {
      throw err // surface the primary (aniwatch) error, it's the informative one
    }
  }
}

app.get(
  '/api/stream',
  route(async (req) => {
    const anilistId = Number(req.query.anilist)
    const episode = Number(req.query.ep)
    const type = req.query.type === 'dub' ? 'dub' : 'sub'
    if (!anilistId || !episode) return { ok: false, error: 'anilist and ep are required' }
    // Demo mode (STREAM_DEMO=1): serve a public test stream so the player can be
    // built/tested while the real source is blocked. Same response shape.
    if (STREAM_DEMO) return { ...DEMO_STREAM, type }
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

// ─── M2 · HLS relay (CORS proxy) ─────────────────────────────────────────────
// Stream CDNs usually refuse cross-origin playback and often require a Referer.
// Our player loads everything through here instead:
//   GET /api/proxy?url=<absolute http(s) url>&ref=<referer to send, optional>
// Playlists (.m3u8) are rewritten so every segment / key / sub-playlist / init
// map ALSO goes through this route; media is streamed straight through (Range
// requests supported, nothing buffered in memory).
const PRIVATE_HOST =
  /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd])/i

function proxify(target, ref) {
  return `/api/proxy?url=${encodeURIComponent(target)}${ref ? `&ref=${encodeURIComponent(ref)}` : ''}`
}

// Rewrite every URI in an HLS playlist to go through the relay.
function rewritePlaylist(text, baseUrl, ref) {
  const abs = (u) => proxify(new URL(u, baseUrl).href, ref)
  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim()
      if (!t) return line
      if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${abs(u)}"`)
      return abs(t)
    })
    .join('\n')
}

app.get('/api/proxy', async (req, res) => {
  let target
  try {
    target = new URL(String(req.query.url || ''))
  } catch {
    return res.status(400).json({ error: 'bad url' })
  }
  if (!/^https?:$/.test(target.protocol) || PRIVATE_HOST.test(target.hostname)) {
    return res.status(400).json({ error: 'url not allowed' })
  }
  const ref = req.query.ref ? String(req.query.ref) : ''
  const headers = { 'User-Agent': 'Mozilla/5.0 BloodFang-relay' }
  if (ref) {
    headers.Referer = ref
    try {
      headers.Origin = new URL(ref).origin
    } catch {
      /* ignore bad referer */
    }
  }
  if (req.headers.range) headers.Range = req.headers.range

  try {
    const upstream = await fetch(target.href, { headers, redirect: 'follow' })
    const type = upstream.headers.get('content-type') || ''
    const isPlaylist =
      /mpegurl|m3u/i.test(type) || /\.m3u8(\?|$)/i.test(upstream.url || target.href)
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (isPlaylist) {
      const text = await upstream.text()
      if (!upstream.ok || !text.trimStart().startsWith('#EXTM3U')) {
        return res.status(upstream.ok ? 502 : upstream.status).send(text.slice(0, 200))
      }
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
      res.setHeader('Cache-Control', 'no-store')
      return res.send(rewritePlaylist(text, upstream.url || target.href, ref))
    }

    // Media / keys / subtitles: stream through untouched.
    res.status(upstream.status)
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const v = upstream.headers.get(h)
      if (v) res.setHeader(h, v)
    }
    if (!upstream.body) return res.end()
    const { Readable } = await import('node:stream')
    Readable.fromWeb(upstream.body).on('error', () => res.end()).pipe(res)
  } catch (err) {
    if (!res.headersSent) res.status(502).json({ error: err?.message || 'relay failed' })
  }
})

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
