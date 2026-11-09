import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getSettings } from './settings'
import { HAS_STREAM_API } from './api'
import NativePlayer from './NativePlayer'
import { findDubGap } from './dubInfo'

// Free in-app anime playback via third-party embed sources, keyed by AniList/MAL
// id + episode number (works for ANY title, independent of the scraper
// providers). These sources are volatile and can't be verified without a real
// browser, so we offer several servers — the user picks whichever plays, exactly
// like the "Server 1/2/3" switch on anime sites. Templates receive
// { anilist, mal, ep, type }.
// Ordered best-first by what actually resolves streams. Vidnest maps AniList
// ids reliably (default). VidLink/VidSrc have different catalogs so some titles
// won't be found on them — they're backups for when Vidnest lacks a title or is
// down. Each provider simply has a different library; a "not found" on one is
// expected, not a bug.
const SERVERS = [
  // Our own player comes first (no ads, 2-minute buffer) wherever a stream
  // backend is reachable: the local build (same-origin /api) or a hosted build
  // with VITE_STREAM_API set. It falls back to Vidnest when it can't play.
  ...(HAS_STREAM_API ? [{ key: 'native', label: 'BloodFang (beta)', native: true }] : []),
  {
    key: 'vidnest',
    label: 'Vidnest',
    url: ({ anilist, ep, type }) => `https://vidnest.fun/anime/${anilist}/${ep}/${type}`,
  },
  // NOTE: VidLink removed 2026-11-08 — its live anime player fetches episodes
  // from `http://localhost:8080/api/anime/...` (a broken deploy on their side),
  // so EVERY title showed "We couldn't find this episode". Re-add when fixed:
  //   { key: 'vidlink', label: 'VidLink',
  //     url: ({ anilist, ep, type }) => `https://vidlink.pro/anime/${anilist}/${ep}/${type}` },
  // Also dead (checked 2026-11-08): vidsrc.cc (522), megaplay.buzz (410 on every
  // title). Add a replacement here if a reliable AniList-id provider is found.
]

// Remember the server the user last PICKED so it's the default next time.
// (v2 key: drops old saved prefs that pinned people to the broken VidLink.)
const LS_SERVER = 'bloodfang:server:v2'
// If the iframe hasn't fired `load` within this window the server is probably
// dead/blocked (cross-origin: `load` fires even for the source's own error page,
// so this only catches truly unreachable servers — good enough to auto-skip).
const LOAD_TIMEOUT_MS = 9000

function loadServerPref() {
  try {
    return localStorage.getItem(LS_SERVER)
  } catch {
    return null
  }
}
function saveServerPref(key) {
  try {
    localStorage.setItem(LS_SERVER, key)
  } catch {
    /* ignore (private mode / disabled storage) */
  }
}
// Start on the last-working server if we have one remembered.
function initialServerIdx() {
  const i = SERVERS.findIndex((s) => s.key === loadServerPref())
  return i >= 0 ? i : 0
}

function dubGapMessage(gap, episode) {
  return gap.kind === 'episode'
    ? `Episode ${episode} isn’t dubbed yet (the dub has reached episode ${gap.lastDubbed}). Only Sub is available.`
    : 'This anime has no dub. Only Sub is available.'
}

export default function EmbedPlayer({ anilistId, malId, episode, dubAvailable = true }) {
  const [serverIdx, setServerIdx] = useState(initialServerIdx)
  // Default audio = DUB (the user's Settings preference, which defaults to Dub),
  // unless the title has no dub or the user explicitly set Sub in Settings. If a
  // dub embed happens to be missing, the user can flip to Sub with the toggle.
  const [type, setType] = useState(() =>
    dubAvailable && getSettings().audio !== 'sub' ? 'dub' : 'sub',
  )
  const [status, setStatus] = useState('loading') // loading | loaded | timeout
  const [notice, setNotice] = useState('')
  const [dubGap, setDubGap] = useState(null)
  const [dubChecked, setDubChecked] = useState(false)
  const [dubForced, setDubForced] = useState(false) // "Try Dub anyway" for this episode
  const [dubPopupOpen, setDubPopupOpen] = useState(false)
  const dubPopupShown = useRef(false) // auto-popup once per title, not every episode
  // Servers already tried for the current episode (so auto-advance doesn't loop).
  const attempted = useRef(new Set())
  const timerRef = useRef(null)

  // `type` is what the user wants; `audio` is what we actually play. Keeping both
  // means Dub resumes by itself on episodes that have one.
  const dubBlocked = type === 'dub' && Boolean(dubGap) && !dubForced
  const audio = dubBlocked ? 'sub' : type
  // Don't start the wrong audio while we're still finding out whether a dub exists.
  const waitingForDubCheck = type === 'dub' && !dubChecked

  const server = SERVERS[serverIdx]
  const src = server.native
    ? ''
    : server.url({ anilist: anilistId, mal: malId ?? anilistId, ep: episode, type: audio })

  // Our player couldn't play this episode → fall back to the first embed server.
  const onNativeFail = (reason) => {
    const fallback = SERVERS.findIndex((s) => !s.native)
    if (fallback < 0) return
    setNotice(`BloodFang player: ${reason} — switched to “${SERVERS[fallback].label}”.`)
    attempted.current = new Set()
    setServerIdx(fallback)
  }

  // New episode / audio → start a fresh auto-advance chain, back on the preferred
  // server (a fallback on one episode shouldn't stick for the rest of the show).
  useEffect(() => {
    attempted.current = new Set()
    setNotice('')
    setServerIdx(initialServerIdx())
  }, [episode, audio])

  useEffect(() => {
    dubPopupShown.current = false
  }, [anilistId])

  useEffect(() => {
    let cancelled = false
    setDubChecked(false)
    setDubForced(false)
    findDubGap({ anilistId, malId, episode }).then((gap) => {
      if (cancelled) return
      setDubGap(gap)
      setDubChecked(true)
    })
    return () => {
      cancelled = true
    }
  }, [anilistId, malId, episode])

  useEffect(() => {
    if (dubBlocked && !dubPopupShown.current) {
      dubPopupShown.current = true
      setDubPopupOpen(true)
    }
  }, [dubBlocked])

  // Watchdog: mark this server attempted and wait for the iframe to load. If it
  // doesn't within LOAD_TIMEOUT_MS, auto-advance to the next untried server.
  useEffect(() => {
    if (server.native || waitingForDubCheck) return // NativePlayer handles its own failures
    setStatus('loading')
    attempted.current.add(server.key)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setStatus('timeout')
      const nextIdx = SERVERS.findIndex((s) => !s.native && !attempted.current.has(s.key))
      if (nextIdx >= 0) {
        setNotice(`“${server.label}” didn’t respond — trying “${SERVERS[nextIdx].label}”…`)
        setServerIdx(nextIdx)
      } else {
        setNotice('No server responded. Try “Open in new tab”, or reload the page.')
      }
    }, LOAD_TIMEOUT_MS)
    return () => clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, waitingForDubCheck])

  const onFrameLoad = () => {
    clearTimeout(timerRef.current)
    setStatus('loaded')
    setNotice('')
    // Don't save the server here: cross-origin `load` also fires for the
    // provider's own "couldn't find this episode" page, so saving on load
    // pinned people to a broken server. Only a manual pick is remembered.
  }

  // Manual server pick resets the auto-advance chain (user is in control now).
  const pickServer = (i) => {
    attempted.current = new Set()
    setNotice('')
    setServerIdx(i)
    saveServerPref(SERVERS[i].key)
  }

  // "Not playing? Try next server" — cycle to the next one.
  const tryNext = () => pickServer((serverIdx + 1) % SERVERS.length)

  const pickDub = () => {
    setType('dub')
    if (dubGap && !dubForced) setDubPopupOpen(true)
  }
  const tryDubAnyway = () => {
    setDubForced(true)
    setDubPopupOpen(false)
  }

  return (
    <div className="embed-wrap">
      <div className="embed-controls" data-no-loader>
        <span className="embed-label">Server:</span>
        {SERVERS.map((s, i) => (
          <button
            key={s.key}
            className={`chip ${i === serverIdx ? 'chip-on' : ''}`}
            onClick={() => pickServer(i)}
          >
            {s.label}
          </button>
        ))}
        <span className="embed-label embed-audio">Audio:</span>
        <button className={`chip ${audio === 'sub' ? 'chip-on' : ''}`} onClick={() => setType('sub')}>
          Sub
        </button>
        {/* Dub button only shown when the title has a dub. */}
        {dubAvailable && (
          <button
            className={`chip ${audio === 'dub' ? 'chip-on' : ''}`}
            onClick={pickDub}
          >
            Dub
          </button>
        )}
        {!server.native && (
          <a className="chip embed-open" href={src} target="_blank" rel="noopener noreferrer">
            Open in new tab ↗
          </a>
        )}
      </div>

      {/* Auto-recovery notice (server timed out / switched) */}
      {notice && <p className="embed-notice">⚠ {notice}</p>}
      {dubBlocked && <p className="embed-notice">🔈 {dubGapMessage(dubGap, episode)}</p>}

      {dubPopupOpen &&
        createPortal(
          <div className="dub-popup-backdrop" data-no-loader>
            <div className="dub-popup" role="dialog" aria-modal="true" aria-labelledby="dub-popup-title">
              <h3 id="dub-popup-title">Dub not available</h3>
              <p>{dubGap && dubGapMessage(dubGap, episode)}</p>
              <div className="dub-popup-actions">
                <button className="btn" onClick={() => setDubPopupOpen(false)} autoFocus>
                  OK, play Sub
                </button>
                <button className="chip" onClick={tryDubAnyway}>
                  Try Dub anyway
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {server.native ? (
        <p className="embed-note">
          ▶ BloodFang’s own player (beta): pre-loads ~2 minutes ahead, with its own
          Quality and Subtitles menus below the video and no pop-up ads. If an episode
          can’t be found it switches back to an embed server automatically.
        </p>
      ) : (
        <>
          <p className="embed-note">
            ▶ Playing “{server.label}”. Use <strong>Sub/Dub</strong> above for audio. For
            the <strong>subtitle language</strong> (if the title has more than one), open
            the player’s own <strong>CC / ⚙ menu</strong> at the bottom-right of the video.
            If the player is blank or says “couldn’t find this episode”, switch{' '}
            <strong>Audio to Sub</strong> (dubs are often missing)
            {SERVERS.length > 1 ? ' or pick another Server' : ''}. These free sources
            don’t carry every title, are volatile and may show ads.
          </p>
          <p className="embed-tip" data-no-loader>
            💡 These free servers open pop-up/new-tab ads on click — that’s the provider,
            not BloodFang, and blocking them in-app stops the video from playing. To kill
            the pop-ups, use a browser ad-blocker like{' '}
            <a href="https://ublockorigin.com/" target="_blank" rel="noopener noreferrer">
              uBlock Origin
            </a>{' '}
            or the Brave browser.
          </p>
        </>
      )}

      {waitingForDubCheck ? (
        <div className="embed-frame">
          <div className="embed-overlay">
            <span className="spinner" />
            Checking audio…
          </div>
        </div>
      ) : server.native ? (
        <NativePlayer
          anilistId={anilistId}
          episode={episode}
          type={audio}
          onFail={onNativeFail}
        />
      ) : (
      <div className="embed-frame">
        {/* NO `sandbox` attribute — these free embed providers detect it and
            refuse to play ("Please Disable Sandbox"): their anti-adblock checks
            require pop-up capability, so blocking pop-ups via sandbox also
            blocks the video (confirmed 2026-07-16). The trade-off is the source
            can open pop-up/new-tab ads. The only reliable way to stop those
            WITHOUT breaking playback is a browser-level blocker (uBlock Origin /
            Brave) — see the tip under the player. */}
        <iframe
          key={src}
          src={src}
          title={`Episode ${episode}`}
          onLoad={onFrameLoad}
          allowFullScreen
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          referrerPolicy="origin"
        />
        {status === 'loading' && (
          <div className="embed-overlay">
            <span className="spinner" />
            Loading “{server.label}”…
          </div>
        )}
      </div>
      )}

      {SERVERS.length > 1 && (
        <div className="embed-actions" data-no-loader>
          <button className="btn" onClick={tryNext}>
            ▶ Not playing? Try next server
          </button>
        </div>
      )}
    </div>
  )
}
