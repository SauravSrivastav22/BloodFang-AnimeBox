import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { FORMATS, GENRES, SEASONS, SORTS, STATUSES, YEARS, getTrending, searchAnime } from './api'
import { getHistory, removeFromHistory } from './history'
import { getFavorites, removeFavorite, toggleFavorite } from './favorites'
import DetailPage from './DetailPage'
import BloodLoader from './BloodLoader'
import BloodPour from './BloodPour'
import SettingsPanel from './SettingsPanel'
import ScrollTopButton from './ScrollTopButton'
import AccountButton from './AccountButton'
import { addBlood, getBlood, MAX_BLOOD, resetBlood } from './blood'
import { reveal3D, useTilt } from './anim'
import './App.css'

// Current anime season (AniList seasonYear convention: December rolls into the
// next year's WINTER). Used by the "Trending this Season" home row.
function currentSeason() {
  const now = new Date()
  const m = now.getMonth() // 0–11
  let season
  let year = now.getFullYear()
  if (m === 11) {
    season = 'WINTER'
    year += 1
  } else if (m <= 1) season = 'WINTER'
  else if (m <= 4) season = 'SPRING'
  else if (m <= 7) season = 'SUMMER'
  else season = 'FALL'
  return { season, year }
}
const SEASON_NOW = currentSeason()
const SEASON_LABEL =
  (SEASONS.find((s) => s.key === SEASON_NOW.season)?.label ?? SEASON_NOW.season) +
  ` ${SEASON_NOW.year}`

function AnimeCard({ anime, onOpen, isFav, onToggleFav, resumeEp, onResume }) {
  const title =
    anime.title?.english || anime.title?.romaji || anime.title?.userPreferred || 'Untitled'
  const tiltRef = useTilt()
  return (
    <article ref={tiltRef} className="card" onClick={() => onOpen(anime.id)} role="button" tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' ? onOpen(anime.id) : null)}>
      <div className="card-poster">
        {anime.image ? (
          <img src={anime.image} alt={title} loading="lazy" />
        ) : (
          <div className="card-noimg">No image</div>
        )}
        {typeof anime.rating === 'number' && (
          <span className="card-rating">★ {(anime.rating / 10).toFixed(1)}</span>
        )}
        {/* Heart toggle — in-place, doesn't open the card or fire the loader */}
        <button
          className={`fav-btn ${isFav ? 'fav-on' : ''}`}
          data-no-loader
          title={isFav ? 'Remove from My List' : 'Add to My List'}
          aria-pressed={isFav}
          onClick={(e) => {
            e.stopPropagation()
            onToggleFav(anime)
          }}
        >
          {isFav ? '♥' : '♡'}
        </button>
        {/* Resume ribbon — shown for titles already in Continue Watching. Jumps
            straight to the last-watched episode. */}
        {resumeEp != null && (
          <button
            className="resume-ribbon"
            title={`Resume episode ${resumeEp}`}
            onClick={(e) => {
              e.stopPropagation()
              onResume(anime.id, resumeEp)
            }}
          >
            ▶ Resume EP {resumeEp}
          </button>
        )}
      </div>
      <h3 className="card-title" title={title}>
        {title}
      </h3>
      <p className="card-meta">
        {(anime.type || 'ANIME')}
        {anime.totalEpisodes ? ` · ${anime.totalEpisodes} eps` : ''}
        {anime.releaseDate ? ` · ${anime.releaseDate}` : ''}
      </p>
    </article>
  )
}

// Blood vial shown before the wordmark. Fills as the user opens pages; when it
// tops out, BloodPour empties it into the loading orb.
function BloodGlass() {
  const [level, setLevel] = useState(getBlood)
  useEffect(() => {
    const on = (e) => setLevel(e.detail?.level ?? getBlood())
    window.addEventListener('bloodfang:blood', on)
    return () => window.removeEventListener('bloodfang:blood', on)
  }, [])
  const ratio = level / MAX_BLOOD
  return (
    <span
      className={`blood-glass ${level >= MAX_BLOOD ? 'glass-full' : ''}`}
      title={`Blood ${level}/${MAX_BLOOD} — fills as you open pages`}
      data-no-loader
    >
      <svg viewBox="0 0 24 32" aria-hidden="true">
        <defs>
          <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff2d4e" />
            <stop offset="100%" stopColor="#7f0a1c" />
          </linearGradient>
          <clipPath id="tubeClip">
            <path d="M8 5 L8 24 Q8 29 12 29 Q16 29 16 24 L16 5 Z" />
          </clipPath>
        </defs>
        <g clipPath="url(#tubeClip)">
          <rect
            className="glass-fill"
            x="8"
            y="5"
            width="8"
            height="24"
            fill="url(#bgGrad)"
            style={{ transform: `scaleY(${ratio})` }}
          />
        </g>
        <path
          d="M8 5 L8 24 Q8 29 12 29 Q16 29 16 24 L16 5 Z"
          fill="none"
          stroke="#dcd5df"
          strokeWidth="1.3"
        />
        <rect x="6" y="2.5" width="12" height="3.4" rx="1.4" fill="#5a1520" />
      </svg>
    </span>
  )
}

// Horror fang-with-blood mark shown before the "BloodFang" wordmark.
function FangIcon() {
  return (
    <svg className="brand-fang" viewBox="0 0 32 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="fangG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#d6c6cf" />
        </linearGradient>
      </defs>
      {/* gum / blood smear */}
      <path d="M5 6 Q16 2 27 6 Q16 11 5 6 Z" fill="#8f0b1f" />
      {/* fang tooth */}
      <path
        d="M7 5 Q16 3 25 5 Q23 15 16 27 Q9 15 7 5 Z"
        fill="url(#fangG)"
        stroke="#b7a5b0"
        strokeWidth="0.5"
      />
      {/* blood drip from the tip */}
      <path d="M16 24 q-2.6 4.5 0 8.5 q2.6 -4 0 -8.5 Z" fill="#c81030" />
      <circle cx="16" cy="33.4" r="1.5" fill="#c81030" />
    </svg>
  )
}

// Shimmer placeholder shown in the grid while page 1 loads.
function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <div className="skeleton skeleton-poster" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line short" />
    </div>
  )
}

// Genre rows shown on the home view (like a streaming service's landing page).
const FEATURED_GENRES = [
  'Action',
  'Adventure',
  'Isekai',
  'Comedy',
  'Slice of Life',
  'Romance',
  'Fantasy',
  'Sci-Fi',
]
// Cache each home row for the session (keyed by cacheKey) so returning home
// doesn't refetch.
const rowCache = new Map()

// One horizontally-scrolling home row. `criteria` is any searchAnime() filter
// (a genre, or a season+year). Fetches once, caches, and hides itself if the
// row has no results or the request fails.
function Row({ title, cacheKey, criteria, onOpen, favIds, onToggleFav, resumeMap, onResume, onSeeAll }) {
  const [items, setItems] = useState(() => rowCache.get(cacheKey) ?? null)
  const [failed, setFailed] = useState(false)
  const rowRef = useRef(null)

  // 3D reveal the row's cards once they're in the DOM.
  useLayoutEffect(() => {
    if (items && rowRef.current) reveal3D(rowRef.current.children)
  }, [items])

  useEffect(() => {
    if (items) return // already have it (cached)
    let cancelled = false
    searchAnime({ ...criteria, page: 1 })
      .then((data) => {
        if (cancelled) return
        const list = (data?.results ?? []).slice(0, 15)
        rowCache.set(cacheKey, list)
        setItems(list)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
    // criteria is rebuilt each render; cacheKey identifies it. Fetch once per key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])

  if (failed || (items && items.length === 0)) return null

  return (
    <section className="genre-row">
      <div className="genre-row-head">
        <h2 className="section-title">{title}</h2>
        {onSeeAll && (
          <button className="see-all" onClick={onSeeAll}>
            See all →
          </button>
        )}
      </div>
      <div className="row-scroll" ref={rowRef}>
        {items
          ? items.map((a) => (
              <AnimeCard
                key={a.id}
                anime={a}
                onOpen={onOpen}
                isFav={favIds.has(String(a.id))}
                onToggleFav={onToggleFav}
                resumeEp={resumeMap.get(String(a.id)) ?? null}
                onResume={onResume}
              />
            ))
          : Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </section>
  )
}

// Route wrapper for /anime/:id — reads the id and optional ?ep from the URL and
// renders the detail page. Playing an episode updates ?ep so the exact episode
// stays bookmarkable/shareable. Back returns to browse (router history).
function DetailRoute() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const ep = searchParams.get('ep')

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <BloodGlass />
          <FangIcon />
          Blood<span>Fang</span>
        </h1>
        <AccountButton />
        <SettingsPanel />
      </header>
      <main className="content">
        <DetailPage
          id={id}
          startEpisode={ep ? Number(ep) : null}
          onBack={() => navigate(-1)}
          onOpen={(newId) => {
            navigate(`/anime/${newId}`)
            window.scrollTo(0, 0)
          }}
          onEpisodeChange={(n) => setSearchParams({ ep: String(n) }, { replace: true })}
        />
      </main>
      <footer className="footer">🧛 BloodFang · Dark · Blood</footer>
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Seed the search + genre filter from the URL so shared links like
  // /?q=naruto&genres=Action open pre-filtered.
  const [query, setQuery] = useState(() => searchParams.get('q') || '')
  const [activeGenres, setActiveGenres] = useState(() => {
    const g = searchParams.get('genres')
    return g ? g.split(',').filter(Boolean) : []
  })
  const [activeSort, setActiveSort] = useState(() => searchParams.get('sort') || '')
  // Advanced filters (year / season / format / status), also seeded from the URL.
  const [advanced, setAdvanced] = useState(() => ({
    year: searchParams.get('year') || '',
    season: searchParams.get('season') || '',
    format: searchParams.get('format') || '',
    status: searchParams.get('status') || '',
  }))
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [heading, setHeading] = useState('Trending Now')
  const [history, setHistory] = useState(() => getHistory())
  const [favorites, setFavorites] = useState(() => getFavorites())
  // The anime "summoned" when the blood vial fills (null = no summon popup).
  const [summon, setSummon] = useState(null)
  // Pagination / infinite scroll state.
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // Remembers the browse scroll position so Back restores it.
  const scrollRef = useRef(0)
  const sentinelRef = useRef(null)
  // Search input, so the "/" keyboard shortcut can focus it.
  const searchRef = useRef(null)
  // Runs the first fetch immediately (skip the debounce on mount).
  const firstRun = useRef(true)
  // Key of the last search actually run, so the debounce doesn't repeat it.
  const lastKey = useRef(null)
  // 3D reveal bookkeeping for the results grid.
  const gridRef = useRef(null)
  const gridRevealedRef = useRef(0) // how many cards already revealed
  const freshResultsRef = useRef(true) // true = replace (reveal all), false = append

  const isBrowse = location.pathname === '/'

  // Reflect the current search/genre filter into the URL (replace, so it doesn't
  // spam history) — makes the browse view shareable/bookmarkable.
  const syncUrl = useCallback(
    (q, genres, sort, adv = {}) => {
      const params = {}
      if (q) params.q = q
      if (genres.length) params.genres = genres.join(',')
      if (sort) params.sort = sort
      if (adv.year) params.year = adv.year
      if (adv.season) params.season = adv.season
      if (adv.format) params.format = adv.format
      if (adv.status) params.status = adv.status
      setSearchParams(params, { replace: true })
    },
    [setSearchParams],
  )

  // Add a drop to the blood vial on each page open; when it tops out, "summon"
  // a random anime (excluding the one just opened) for the reveal popup.
  const bumpBlood = (excludeId) => {
    if (addBlood() < MAX_BLOOD) return
    const pool = results.filter((a) => String(a.id) !== String(excludeId))
    const pick = (pool.length ? pool : results)[Math.floor(Math.random() * (pool.length || results.length || 1))]
    if (pick) setSummon(pick)
  }

  // Navigate to a detail page, remembering scroll first so Back restores it.
  const openTitle = (id) => {
    scrollRef.current = window.scrollY
    bumpBlood(id)
    navigate(`/anime/${id}`)
  }
  const openResume = (entry) => {
    scrollRef.current = window.scrollY
    bumpBlood(entry.id)
    navigate(`/anime/${entry.id}?ep=${entry.episode}`)
  }

  // On (re)entering the browse view: refresh saved lists and restore scroll.
  useEffect(() => {
    if (isBrowse) {
      setHistory(getHistory())
      setFavorites(getFavorites())
      const y = scrollRef.current
      requestAnimationFrame(() => window.scrollTo(0, y))
    }
  }, [isBrowse])

  // After a cloud sign-in merges data, re-read My List + Continue Watching.
  useEffect(() => {
    const onSynced = () => {
      setHistory(getHistory())
      setFavorites(getFavorites())
    }
    window.addEventListener('bloodfang:datasynced', onSynced)
    return () => window.removeEventListener('bloodfang:datasynced', onSynced)
  }, [])

  // Quick id lookup so cards can show the right heart state.
  const favIds = new Set(favorites.map((f) => String(f.id)))
  // id → last-watched episode, so grid cards can show a "Resume EP X" ribbon.
  const resumeMap = new Map(history.map((h) => [String(h.id), h.episode]))

  // Open a title straight at a given episode (used by the card resume ribbon).
  const openAtEpisode = (id, episode) => {
    scrollRef.current = window.scrollY
    bumpBlood(id)
    navigate(`/anime/${id}?ep=${episode}`)
  }

  // "Watch now" on the summon reveal → open it (without re-filling the vial).
  const openSummoned = (id) => {
    setSummon(null)
    resetBlood()
    scrollRef.current = window.scrollY
    navigate(`/anime/${id}`)
  }
  const closeSummon = () => {
    setSummon(null)
    resetBlood()
  }

  // "See all →" on a genre row → filter the main grid to that genre.
  const onSeeAll = (genre) => {
    setQuery('')
    setActiveGenres([genre])
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // "Surprise me" → open a random popular title (picks from a random page).
  const onSurprise = async () => {
    try {
      const p = Math.floor(Math.random() * 40) + 1
      const data = await searchAnime({ sort: 'popular', page: p })
      const list = data?.results ?? []
      if (list.length) openTitle(list[Math.floor(Math.random() * list.length)].id)
    } catch {
      /* ignore — network hiccup, just do nothing */
    }
  }

  // "See all →" on the seasonal row → filter the grid to this season's titles.
  const onSeeAllSeason = () => {
    setQuery('')
    setActiveGenres([])
    setActiveSort('trending')
    setAdvanced({ year: String(SEASON_NOW.year), season: SEASON_NOW.season, format: '', status: '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Toggle a title in My List. Store enough to render its card later.
  const onToggleFav = (anime) => {
    const { list } = toggleFavorite({
      id: anime.id,
      title:
        anime.title?.english || anime.title?.romaji || anime.title?.userPreferred || 'Untitled',
      image: anime.image,
      type: anime.type,
      totalEpisodes: anime.totalEpisodes,
      releaseDate: anime.releaseDate,
      rating: anime.rating,
    })
    setFavorites(list)
  }

  // 3D-reveal newly rendered result cards. On a fresh search we reveal all; on
  // infinite-scroll we reveal only the freshly appended ones (nice cascade).
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) {
      gridRevealedRef.current = 0
      return
    }
    const cards = grid.children
    const start = freshResultsRef.current ? 0 : gridRevealedRef.current
    reveal3D(Array.from(cards).slice(start))
    gridRevealedRef.current = cards.length
    freshResultsRef.current = false
  }, [results])

  // Fetch one page from the right endpoint (trending vs search+genres+sort+adv).
  const fetchPage = useCallback((q, genres, sort, adv = {}, pageNum) => {
    const advActive = Boolean(adv.year || adv.season || adv.format || adv.status)
    const isDefault = !q && genres.length === 0 && !sort && !advActive
    return isDefault
      ? getTrending(pageNum)
      : searchAnime({ query: q, genres, sort, ...adv, page: pageNum })
  }, [])

  // Fresh search → replace results with page 1.
  const runSearch = useCallback(
    async (q, genres, sort, adv = {}) => {
      const advKey = `${adv.year || ''}:${adv.season || ''}:${adv.format || ''}:${adv.status || ''}`
      lastKey.current = `${q}::${genres.join(',')}::${sort}::${advKey}`
      setLoading(true)
      setError(null)
      try {
        const data = await fetchPage(q, genres, sort, adv, 1)
        freshResultsRef.current = true // fresh page → reveal the whole grid
        setResults(data?.results ?? [])
        setPage(1)
        setHasMore(Boolean(data?.hasNextPage))
        const advActive = Boolean(adv.year || adv.season || adv.format || adv.status)
        const sortLabel = SORTS.find((s) => s.key === sort)?.label
        setHeading(
          !q && genres.length === 0 && !sort && !advActive
            ? 'Trending Now'
            : `${sort ? `${sortLabel}` : 'Results'}${q ? ` · “${q}”` : ''}${
                genres.length ? ` · ${genres.join(', ')}` : ''
              }`,
        )
      } catch (err) {
        setError(err.message)
        setResults([])
        setHasMore(false)
      } finally {
        setLoading(false)
      }
    },
    [fetchPage],
  )

  // Infinite scroll → append the next page (de-duped by id).
  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore) return
    const next = page + 1
    setLoadingMore(true)
    try {
      const data = await fetchPage(query, activeGenres, activeSort, advanced, next)
      const incoming = data?.results ?? []
      setResults((prev) => {
        const seen = new Set(prev.map((a) => a.id))
        return [...prev, ...incoming.filter((a) => !seen.has(a.id))]
      })
      setPage(next)
      setHasMore(Boolean(data?.hasNextPage))
    } catch {
      setHasMore(false)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, loading, hasMore, page, query, activeGenres, activeSort, advanced, fetchPage])

  // Auto-load more when the sentinel scrolls into view. Re-runs when returning to
  // browse (isBrowse) so the observer re-attaches to the freshly mounted sentinel.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !isBrowse) return
    const io = new IntersectionObserver(
      (entries) => entries[0].isIntersecting && loadMore(),
      { rootMargin: '600px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [loadMore, isBrowse])

  // Search-as-you-type: debounce query + genre changes (~450ms) so results
  // update live while typing, without a request per keystroke. First run is
  // immediate; already-run searches are skipped via lastKey. Mirrors into URL.
  useEffect(() => {
    const advKey = `${advanced.year}:${advanced.season}:${advanced.format}:${advanced.status}`
    const key = `${query}::${activeGenres.join(',')}::${activeSort}::${advKey}`
    if (firstRun.current) {
      firstRun.current = false
      runSearch(query, activeGenres, activeSort, advanced)
      syncUrl(query, activeGenres, activeSort, advanced)
      return
    }
    const t = setTimeout(() => {
      if (lastKey.current === key) return // e.g. Enter already ran it
      runSearch(query, activeGenres, activeSort, advanced)
      syncUrl(query, activeGenres, activeSort, advanced)
    }, 450)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeGenres, activeSort, advanced])

  // "/" focuses the search box (browse view), unless already typing in a field.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || !isBrowse) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isBrowse])

  const toggleGenre = (genre) => {
    setActiveGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    )
  }

  // Enter searches immediately (accelerator over the debounce).
  const onSubmit = (e) => {
    e.preventDefault()
    runSearch(query, activeGenres, activeSort, advanced)
    syncUrl(query, activeGenres, activeSort, advanced)
  }

  const advActive = Boolean(advanced.year || advanced.season || advanced.format || advanced.status)
  const hasFilters = Boolean(query) || activeGenres.length > 0 || Boolean(activeSort) || advActive

  // Re-run the current search (used by the error/empty "Try again" buttons).
  const retry = () => {
    runSearch(query, activeGenres, activeSort, advanced)
    syncUrl(query, activeGenres, activeSort, advanced)
  }

  // Update one advanced-filter field (year / season / format / status).
  const setAdvField = (field, value) => setAdvanced((a) => ({ ...a, [field]: value }))
  const emptyAdvanced = { year: '', season: '', format: '', status: '' }

  // Clear the search box + genres + sort + advanced and go back to trending
  // (immediately; the debounce effect then skips the repeat via lastKey).
  const resetBrowse = () => {
    setQuery('')
    setActiveGenres([])
    setActiveSort('')
    setAdvanced(emptyAdvanced)
    runSearch('', [], '', emptyAdvanced)
    syncUrl('', [], '', emptyAdvanced)
  }

  const browseView = (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">
          <BloodGlass />
          <FangIcon />
          Blood<span>Fang</span>
        </h1>
        <form className="searchbar" onSubmit={onSubmit}>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anime… (press / to focus)"
            aria-label="Search anime"
          />
          <button type="submit">Search</button>
        </form>
        <AccountButton />
        <SettingsPanel />
      </header>

      <section className="filters" aria-label="Sort and category filter">
        <label className="sort-control">
          <span>Sort</span>
          <select
            value={activeSort}
            onChange={(e) => setActiveSort(e.target.value)}
            aria-label="Sort results"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="sort-control">
          <span>Year</span>
          <select
            value={advanced.year}
            onChange={(e) => setAdvField('year', e.target.value)}
            aria-label="Filter by year"
          >
            {YEARS.map((y) => (
              <option key={y.key} value={y.key}>
                {y.label}
              </option>
            ))}
          </select>
        </label>
        <label className="sort-control">
          <span>Season</span>
          <select
            value={advanced.season}
            onChange={(e) => setAdvField('season', e.target.value)}
            aria-label="Filter by season"
          >
            {SEASONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="sort-control">
          <span>Format</span>
          <select
            value={advanced.format}
            onChange={(e) => setAdvField('format', e.target.value)}
            aria-label="Filter by format"
          >
            {FORMATS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="sort-control">
          <span>Status</span>
          <select
            value={advanced.status}
            onChange={(e) => setAdvField('status', e.target.value)}
            aria-label="Filter by status"
          >
            {STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="chip surprise-btn" onClick={onSurprise}>
          🎲 Surprise me
        </button>
        {GENRES.map((genre) => (
          <button
            key={genre}
            type="button"
            className={`chip ${activeGenres.includes(genre) ? 'chip-on' : ''}`}
            onClick={() => toggleGenre(genre)}
          >
            {genre}
          </button>
        ))}
        {(activeGenres.length > 0 || activeSort || advActive) && (
          <button
            type="button"
            className="chip chip-clear"
            onClick={() => {
              setActiveGenres([])
              setActiveSort('')
              setAdvanced(emptyAdvanced)
            }}
          >
            Clear ✕
          </button>
        )}
      </section>

      <main className="content">
        {/* Continue Watching — only on the default view, when history exists */}
        {history.length > 0 && !hasFilters && (
          <section className="continue">
            <h2 className="section-title">Continue Watching</h2>
            <div className="grid">
              {history.map((h) => (
                <article className="card cw-card" key={h.id}>
                  <button
                    className="cw-remove"
                    title="Remove"
                    data-no-loader
                    onClick={() => setHistory(removeFromHistory(h.id))}
                  >
                    ✕
                  </button>
                  <div
                    className="card-poster"
                    role="button"
                    tabIndex={0}
                    onClick={() => openResume(h)}
                    onKeyDown={(e) => (e.key === 'Enter' ? openResume(h) : null)}
                  >
                    {h.image ? (
                      <img src={h.image} alt={h.title} loading="lazy" />
                    ) : (
                      <div className="card-noimg">No image</div>
                    )}
                    <span className="card-rating cw-ep">EP {h.episode}</span>
                    <span className="cw-resume">▶ Resume</span>
                  </div>
                  <h3 className="card-title" title={h.title} onClick={() => openResume(h)}>
                    {h.title}
                  </h3>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* My List (favorites) — only on the default view, when it has entries */}
        {favorites.length > 0 && !hasFilters && (
          <section className="continue">
            <h2 className="section-title">♥ My List</h2>
            <div className="grid">
              {favorites.map((f) => (
                <article className="card cw-card" key={f.id}>
                  <button
                    className="cw-remove"
                    title="Remove from My List"
                    data-no-loader
                    onClick={() => setFavorites(removeFavorite(f.id))}
                  >
                    ✕
                  </button>
                  <div
                    className="card-poster"
                    role="button"
                    tabIndex={0}
                    onClick={() => openTitle(f.id)}
                    onKeyDown={(e) => (e.key === 'Enter' ? openTitle(f.id) : null)}
                  >
                    {f.image ? (
                      <img src={f.image} alt={f.title} loading="lazy" />
                    ) : (
                      <div className="card-noimg">No image</div>
                    )}
                    {typeof f.rating === 'number' && (
                      <span className="card-rating">★ {(f.rating / 10).toFixed(1)}</span>
                    )}
                  </div>
                  <h3 className="card-title" title={f.title} onClick={() => openTitle(f.id)}>
                    {f.title}
                  </h3>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Landing rows — only on the default home view */}
        {!hasFilters && (
          <div className="genre-rows">
            {/* Trending this season leads the home page */}
            <Row
              title={`Trending this Season · ${SEASON_LABEL}`}
              cacheKey={`season:${SEASON_NOW.season}:${SEASON_NOW.year}`}
              criteria={{ season: SEASON_NOW.season, year: SEASON_NOW.year, sort: 'trending' }}
              onOpen={openTitle}
              favIds={favIds}
              onToggleFav={onToggleFav}
              resumeMap={resumeMap}
              onResume={openAtEpisode}
              onSeeAll={onSeeAllSeason}
            />
            {FEATURED_GENRES.map((g) => (
              <Row
                key={g}
                title={g}
                cacheKey={`genre:${g}`}
                criteria={{ genres: [g] }}
                onOpen={openTitle}
                favIds={favIds}
                onToggleFav={onToggleFav}
                resumeMap={resumeMap}
                onResume={openAtEpisode}
                onSeeAll={() => onSeeAll(g)}
              />
            ))}
          </div>
        )}

        <h2 className="section-title">{heading}</h2>

        {/* Loading page 1 → shimmer skeleton grid (feels faster than a spinner) */}
        {loading && (
          <div className="grid">
            {Array.from({ length: 12 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Error → friendly box with a Retry (source/backend can be flaky) */}
        {!loading && error && (
          <div className="state-box">
            <div className="state-icon">⚠️</div>
            <p className="state-title">Couldn’t load anime</p>
            <p className="state-msg">
              The data source may be down or the backend isn’t running. Start both
              with <code>npm start</code>, or try again.
              <br />
              <small style={{ opacity: 0.7 }}>{error}</small>
            </p>
            <div className="state-actions">
              <button className="btn btn-primary" onClick={retry}>
                ↻ Try again
              </button>
            </div>
          </div>
        )}

        {/* Empty → friendly box; offer to clear filters or reset to trending */}
        {!loading && !error && results.length === 0 && (
          <div className="state-box">
            <div className="state-icon">🔍</div>
            <p className="state-title">
              {hasFilters ? 'No matches found' : 'Nothing to show right now'}
            </p>
            <p className="state-msg">
              {hasFilters
                ? 'Try a different search term or fewer genre filters.'
                : 'The source may be busy. Give it a moment and try again.'}
            </p>
            <div className="state-actions">
              {hasFilters && (
                <button className="btn" onClick={resetBrowse}>
                  ✕ Clear filters
                </button>
              )}
              <button className="btn btn-primary" onClick={retry}>
                ↻ Try again
              </button>
            </div>
          </div>
        )}

        {!loading && !error && results.length > 0 && (
          <div className="grid" ref={gridRef}>
            {results.map((anime) => (
              <AnimeCard
                key={anime.id}
                anime={anime}
                onOpen={openTitle}
                isFav={favIds.has(String(anime.id))}
                onToggleFav={onToggleFav}
                resumeEp={resumeMap.get(String(anime.id)) ?? null}
                onResume={openAtEpisode}
              />
            ))}
          </div>
        )}

        {/* Infinite-scroll trigger + status */}
        <div ref={sentinelRef} className="sentinel" aria-hidden="true" />
        {loadingMore && (
          <p className="status" style={{ textAlign: 'center' }}>
            <span className="spinner" />
            Loading more…
          </p>
        )}
        {!loading && !hasMore && results.length > 0 && (
          <p className="status end-note">You’ve reached the end.</p>
        )}
      </main>

      <footer className="footer">
        🧛 BloodFang · Dark · Blood
      </footer>
    </div>
  )

  return (
    <>
      <BloodLoader />
      <BloodPour summon={summon} onWatch={openSummoned} onClose={closeSummon} />
      <ScrollTopButton />
      <Routes>
        <Route path="/" element={browseView} />
        <Route path="/anime/:id" element={<DetailRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
