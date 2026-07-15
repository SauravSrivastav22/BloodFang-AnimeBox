import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DIRECT, getInfo, getDub } from './api'
import { saveProgress, getWatchedEpisodes, markEpisodeWatched } from './history'
import { isFavorite, toggleFavorite } from './favorites'
import { enter3D, reveal3D } from './anim'
import EmbedPlayer from './EmbedPlayer'

// Episodes per range chunk, so a 1000+ episode title doesn't render every button.
const EP_PAGE = 100

function stripHtml(html = '') {
  return html.replace(/<[^>]*>/g, '')
}

// SEQUEL → "Sequel", SIDE_STORY → "Side Story", etc.
function prettyRelation(rel = '') {
  return rel.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// Small poster used in the Related / Recommendations rows.
function MiniCard({ item, label, onOpen }) {
  const title =
    item.title?.english || item.title?.romaji || item.title?.userPreferred || 'Untitled'
  return (
    <button className="mini-card" onClick={() => onOpen?.(item.id)} title={title}>
      <div className="mini-poster">
        {item.image ? (
          <img src={item.image} alt={title} loading="lazy" />
        ) : (
          <div className="card-noimg">No image</div>
        )}
        {label && <span className="mini-tag">{label}</span>}
        {typeof item.rating === 'number' && (
          <span className="card-rating">★ {(item.rating / 10).toFixed(1)}</span>
        )}
      </div>
      <span className="mini-title">{title}</span>
    </button>
  )
}

export default function DetailPage({ id, onBack, onOpen, startEpisode = null, onEpisodeChange }) {
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // The episode number currently playing (null = nothing selected yet).
  // Seeded from `startEpisode` (Continue Watching or an ?ep=… deep link).
  const [activeEp, setActiveEp] = useState(startEpisode)
  // Bump to re-trigger the fetch (the "Try again" button).
  const [reloadKey, setReloadKey] = useState(0)
  // Dub availability — loaded separately, AFTER info, so it never delays paint.
  // null = unknown (stay dub-first); false = positively sub-only (hide Dub).
  const [dubAvailable, setDubAvailable] = useState(null)
  // Whether this title is in My List (favorites).
  const [fav, setFav] = useState(() => isFavorite(id))
  // Episodes already watched for this title (drives the ✓ markers).
  const [watched, setWatched] = useState(() => getWatchedEpisodes(id))
  // First episode of the visible range chunk (for long-running series).
  const [rangeStart, setRangeStart] = useState(0)
  // Brief "Copied!" state for the share button.
  const [copied, setCopied] = useState(false)
  // Refs for the 3D entrance.
  const heroRef = useRef(null)
  const episodesRef = useRef(null)

  // Reset per-title state when navigating to a different anime.
  useEffect(() => {
    setFav(isFavorite(id))
    setWatched(getWatchedEpisodes(id))
  }, [id])

  // Keep the visible episode range aligned with the playing episode.
  useEffect(() => {
    if (activeEp) setRangeStart(Math.floor((activeEp - 1) / EP_PAGE) * EP_PAGE)
  }, [activeEp])

  // 3D entrance once the title has loaded: hero drops in, episodes cascade.
  useLayoutEffect(() => {
    if (loading || error) return
    enter3D(heroRef.current)
    if (episodesRef.current) reveal3D(episodesRef.current.children)
  }, [loading, error, id])

  // Fetch the title's info once per id (and on retry). Kept separate from the
  // episode sync below so changing the episode never refetches everything.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getInfo(id)
      .then((data) => {
        if (!cancelled) setInfo(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, reloadKey])

  // After info arrives, fetch dub availability in the background and merge it in.
  useEffect(() => {
    if (!info) return
    let cancelled = false
    setDubAvailable(null)
    const title = info.title?.romaji || info.title?.english || ''
    getDub(info.id || id, title)
      .then((r) => {
        if (!cancelled) setDubAvailable(r?.dubAvailable ?? null)
      })
      .catch(() => {
        /* dub unknown → stay dub-first */
      })
    return () => {
      cancelled = true
    }
  }, [info, id])

  // Keep the playing episode in sync with the incoming ?ep deep link / resume.
  useEffect(() => {
    setActiveEp(startEpisode)
  }, [startEpisode])

  // Keyboard shortcuts: ← / → change episode while watching, Esc goes back.
  // Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Escape') return onBack?.()
      if (!activeEp) return
      const total = info?.streamingEpisodes?.length || info?.totalEpisodes || 0
      if (e.key === 'ArrowLeft' && activeEp > 1) play(activeEp - 1)
      else if (e.key === 'ArrowRight' && (!total || activeEp < total)) play(activeEp + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEp, info, onBack])

  const play = (episodeNumber) => {
    setActiveEp(episodeNumber)
    // Reflect the episode in the URL (?ep=…) so it's shareable/bookmarkable.
    onEpisodeChange?.(episodeNumber)
    const key = info?.id || id
    // Save to "Continue Watching" and mark the episode watched (✓).
    if (info) {
      saveProgress({
        id: key,
        title:
          info.title?.english || info.title?.romaji || info.title?.userPreferred || 'Untitled',
        image: info.image,
        episode: episodeNumber,
      })
    }
    markEpisodeWatched(key, episodeNumber)
    setWatched(getWatchedEpisodes(key))
    // Scroll the player into view.
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (loading)
    return (
      <div className="detail">
        <button className="back-btn" onClick={onBack}>
          ← Back to browse
        </button>
        {/* Skeleton hero while the title loads */}
        <div className="detail-hero detail-hero-skeleton">
          <div className="detail-hero-inner">
            <div className="skeleton detail-poster" />
            <div className="detail-info" style={{ width: '100%' }}>
              <div className="skeleton skeleton-line" style={{ width: '60%', height: 24 }} />
              <div className="skeleton skeleton-line" style={{ width: '40%' }} />
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line short" />
            </div>
          </div>
        </div>
      </div>
    )
  if (error)
    return (
      <div className="detail">
        <button className="back-btn" onClick={onBack}>
          ← Back to browse
        </button>
        <div className="state-box">
          <div className="state-icon">⚠️</div>
          <p className="state-title">Couldn’t load this title</p>
          <p className="state-msg">
            The data source may be temporarily down. Try again in a moment.
            <br />
            <small style={{ opacity: 0.7 }}>{error}</small>
          </p>
          <div className="state-actions">
            <button className="btn" onClick={onBack}>
              ← Back
            </button>
            <button className="btn btn-primary" onClick={() => setReloadKey((k) => k + 1)}>
              ↻ Try again
            </button>
          </div>
        </div>
      </div>
    )
  if (!info) return null

  const title =
    info.title?.english || info.title?.romaji || info.title?.userPreferred || 'Untitled'
  const anilistId = info.id || id
  // AniList's rich episode list (thumbnails + titles) if available.
  const richEpisodes = info.streamingEpisodes ?? []
  // Best-known episode count: explicit total, else (for airing shows) the latest
  // aired episode via nextAiringEpisode, else however many rich episodes we have.
  const airedCount = info.nextAiringEpisode ? info.nextAiringEpisode - 1 : 0
  const knownCount = info.totalEpisodes || info.currentEpisode || airedCount || 0
  const totalEps = Math.max(knownCount, richEpisodes.length)
  // Use rich cards (thumbnails) only when they cover EVERY episode; otherwise a
  // numbered list so all episodes stay selectable (e.g. One Piece: 69 → 1169).
  const useRich = richEpisodes.length > 0 && richEpisodes.length >= totalEps
  const rangeCount = Math.ceil(totalEps / EP_PAGE)
  // Prev / Next targets for the in-player episode nav (clamped to range).
  const prevEp = activeEp && activeEp > 1 ? activeEp - 1 : null
  const nextEp = activeEp && totalEps && activeEp < totalEps ? activeEp + 1 : null

  // Copy the current deep link (title + ?ep) to the clipboard.
  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked (insecure context / denied) — no-op */
    }
  }

  const onToggleFav = () => {
    const { favorited } = toggleFavorite({
      id: anilistId,
      title,
      image: info.image,
      type: info.type,
      totalEpisodes: info.totalEpisodes,
      releaseDate: info.releaseDate,
      rating: info.rating,
    })
    setFav(favorited)
  }

  return (
    <div className="detail">
      <button className="back-btn" onClick={onBack}>
        ← Back to browse
      </button>

      {/* Player (embed) */}
      {activeEp && (
        <section className="watch">
          <h2 className="section-title">
            {title} · Episode {activeEp}
          </h2>
          {/* Prev / Next episode — in-place, so it skips the blood loader. */}
          <div className="ep-nav" data-no-loader>
            <button className="btn" disabled={!prevEp} onClick={() => prevEp && play(prevEp)}>
              ◀ Prev
            </button>
            <span className="ep-nav-label">
              Episode {activeEp}
              {totalEps ? ` / ${totalEps}` : ''}
            </span>
            <button className="btn" disabled={!nextEp} onClick={() => nextEp && play(nextEp)}>
              Next ▶
            </button>
          </div>
          <EmbedPlayer
            anilistId={anilistId}
            malId={info.malId}
            episode={activeEp}
            dubAvailable={dubAvailable !== false}
            dubUnverified={DIRECT}
          />
        </section>
      )}

      <div
        ref={heroRef}
        className="detail-hero"
        style={info.cover ? { backgroundImage: `url(${info.cover})` } : undefined}
      >
        <div className="detail-hero-inner">
          {info.image && <img className="detail-poster" src={info.image} alt={title} />}
          <div className="detail-info">
            <h1>{title}</h1>
            <div className="detail-actions">
              <button
                className={`fav-toggle ${fav ? 'fav-on' : ''}`}
                data-no-loader
                aria-pressed={fav}
                onClick={onToggleFav}
              >
                {fav ? '♥ In My List' : '♡ Add to My List'}
              </button>
              <button className="fav-toggle share-btn" data-no-loader onClick={onShare}>
                {copied ? '✓ Copied!' : '⤴ Share'}
              </button>
            </div>
            <div className="detail-tags">
              {info.status && <span className="tag">{info.status}</span>}
              {typeof info.rating === 'number' && (
                <span className="tag tag-rating">★ {(info.rating / 10).toFixed(1)}</span>
              )}
              {info.totalEpisodes && <span className="tag">{info.totalEpisodes} eps</span>}
              {info.duration && <span className="tag">{info.duration} min</span>}
              {info.releaseDate && <span className="tag">{info.releaseDate}</span>}
              {info.type && <span className="tag">{info.type}</span>}
            </div>
            <div className="detail-genres">
              {(info.genres || []).map((g) => (
                <span key={g} className="chip chip-on">
                  {g}
                </span>
              ))}
            </div>
            {info.description && <p className="detail-desc">{stripHtml(info.description)}</p>}
          </div>
        </div>
      </div>

      {/* Episodes — clicking any episode plays it in the in-app embed player. */}
      <section className="episodes">
        <h2 className="section-title">Episodes</h2>

        {/* Range selector for long-running series (1–100, 101–200, …) */}
        {totalEps > EP_PAGE && (
          <div className="ep-ranges" data-no-loader>
            {Array.from({ length: rangeCount }, (_, r) => {
              const start = r * EP_PAGE
              return (
                <button
                  key={start}
                  className={`chip ${start === rangeStart ? 'chip-on' : ''}`}
                  onClick={() => setRangeStart(start)}
                >
                  {start + 1}–{Math.min(start + EP_PAGE, totalEps)}
                </button>
              )
            })}
          </div>
        )}

        {/* Rich list from AniList (thumbnails + titles) — when it covers all eps */}
        {useRich && (
          <div className="stream-grid" ref={episodesRef}>
            {richEpisodes.slice(rangeStart, rangeStart + EP_PAGE).map((ep, i) => {
              const n = rangeStart + i + 1
              const seen = watched.has(n)
              return (
                <button
                  key={ep.id || n}
                  className={`stream-card ${activeEp === n ? 'stream-card-on' : ''} ${
                    seen ? 'ep-watched' : ''
                  }`}
                  onClick={() => play(n)}
                >
                  <div className="stream-thumb">
                    {ep.image ? <img src={ep.image} alt={ep.title} loading="lazy" /> : null}
                    <span className="stream-play">▶</span>
                    {seen && <span className="ep-check">✓</span>}
                  </div>
                  <span className="stream-title">{ep.title || `Episode ${n}`}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Numbered list — used when rich data is absent OR incomplete (long
            series like One Piece), so every episode stays selectable */}
        {!useRich && totalEps > 0 && (
          <div className="episode-grid" ref={episodesRef}>
            {Array.from(
              { length: Math.min(EP_PAGE, totalEps - rangeStart) },
              (_, i) => rangeStart + i + 1,
            ).map((n) => {
              const seen = watched.has(n)
              return (
                <button
                  key={n}
                  className={`episode ${activeEp === n ? 'episode-on' : ''} ${
                    seen ? 'ep-watched' : ''
                  }`}
                  onClick={() => play(n)}
                  title={`Play episode ${n}`}
                >
                  <span className="episode-num">{seen ? '✓' : n}</span>
                  <span className="episode-title">Episode {n}</span>
                </button>
              )
            })}
          </div>
        )}

        {totalEps === 0 && (
          <div className="state-box">
            <div className="state-icon">📺</div>
            <p className="state-title">No episodes listed yet</p>
            <p className="state-msg">
              The streaming source is down or hasn’t indexed this title. You can
              still try the player below, or check back later.
            </p>
            <div className="state-actions">
              <button className="btn btn-primary" onClick={() => setReloadKey((k) => k + 1)}>
                ↻ Try again
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Trailer (YouTube embed) */}
      {info.trailer && (
        <section className="trailer">
          <h2 className="section-title">Trailer</h2>
          <div className="trailer-frame">
            <iframe
              src={`https://www.youtube.com/embed/${info.trailer.id}`}
              title={`${title} trailer`}
              allowFullScreen
              allow="autoplay; encrypted-media; picture-in-picture"
            />
          </div>
        </section>
      )}

      {/* Characters */}
      {info.characters?.length > 0 && (
        <section className="characters">
          <h2 className="section-title">Characters</h2>
          <div className="char-scroll">
            {info.characters.map((c, i) => (
              <div className="char-card" key={i}>
                {c.image ? (
                  <img src={c.image} alt={c.name} loading="lazy" />
                ) : (
                  <div className="card-noimg">?</div>
                )}
                <span className="char-name" title={c.name}>
                  {c.name}
                </span>
                {c.role && <span className="char-role">{prettyRelation(c.role)}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Related titles (sequels / prequels / side stories) */}
      {info.related?.length > 0 && (
        <section className="rel-row">
          <h2 className="section-title">Related</h2>
          <div className="row-scroll">
            {info.related.map((r) => (
              <MiniCard key={r.id} item={r} label={prettyRelation(r.relation)} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}

      {/* Recommendations */}
      {info.recommendations?.length > 0 && (
        <section className="rel-row">
          <h2 className="section-title">You might also like</h2>
          <div className="row-scroll">
            {info.recommendations.map((r) => (
              <MiniCard key={r.id} item={r} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
