import { useEffect, useRef, useState } from 'react'
import { getStream, proxied } from './api'

// BloodFang's own video player (custom-player plan, M3).
// Resolves a real HLS stream via /api/stream, plays it through our /api/proxy
// relay with hls.js, and gives us what the embeds never could:
//   • ~2 min pre-load buffer (no more mid-episode buffering)
//   • a real subtitle-language menu and quality menu
//   • no pop-up ads (we own the page)
// On any failure it calls onFail(reason) so EmbedPlayer can drop back to an
// embed server — the app never dead-ends.

// The whole point: keep ~2 min buffered ahead when bandwidth allows.
const HLS_CONFIG = {
  maxBufferLength: 120, // target seconds buffered ahead
  maxMaxBufferLength: 240, // hard ceiling (~4 min)
  maxBufferSize: 120 * 1000 * 1000, // ~120 MB
  backBufferLength: 60, // keep 1 min behind for instant rewind
  enableWorker: true,
}

const posKey = (id, ep) => `bloodfang:pos:${id}:${ep}`
function loadPos(id, ep) {
  try {
    return Number(localStorage.getItem(posKey(id, ep))) || 0
  } catch {
    return 0
  }
}
function savePos(id, ep, t) {
  try {
    localStorage.setItem(posKey(id, ep), String(Math.floor(t)))
  } catch {
    /* storage unavailable — resume just won't work */
  }
}

const langLabel = (s) => s?.name || s?.lang || s?.label || 'Unknown'

export default function NativePlayer({ anilistId, episode, type, onFail, onEnded }) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const [status, setStatus] = useState('resolving') // resolving | loading | ready | error
  const [error, setError] = useState('')
  const [provider, setProvider] = useState('')
  const [extSubs, setExtSubs] = useState([]) // external VTT tracks [{lang,url}]
  const [levels, setLevels] = useState([]) // hls quality levels
  const [level, setLevel] = useState(-1) // -1 = auto
  const [subOptions, setSubOptions] = useState([]) // [{key,label}]
  const [subKey, setSubKey] = useState('off')
  const [ahead, setAhead] = useState(0) // seconds buffered ahead of playhead

  // Resolve + attach the stream whenever the episode / audio changes.
  useEffect(() => {
    let cancelled = false
    const video = videoRef.current
    setStatus('resolving')
    setError('')
    setLevels([])
    setLevel(-1)
    setSubOptions([])
    setSubKey('off')
    setExtSubs([])

    const fail = (reason) => {
      if (cancelled) return
      setStatus('error')
      setError(reason)
      onFail?.(reason)
    }

    ;(async () => {
      const s = await getStream(anilistId, episode, type)
      if (cancelled) return
      if (!s?.ok || !s.m3u8) return fail(s?.error || 'No stream found for this episode')
      setProvider(s.provider || '')
      const ref = s.headers?.Referer || s.headers?.referer || ''
      const src = proxied(s.m3u8, ref)
      const ext = (s.subtitles ?? []).map((t) => ({ lang: t.lang, url: proxied(t.url, ref) }))
      setExtSubs(ext)
      setStatus('loading')

      const resume = loadPos(anilistId, episode)
      const onReady = () => {
        if (cancelled) return
        if (resume > 5 && video.duration && resume < video.duration - 10) video.currentTime = resume
        setStatus('ready')
        video.play().catch(() => {}) // autoplay may be blocked — user presses play
      }

      const { default: Hls } = await import('hls.js')
      if (cancelled) return

      if (Hls.isSupported()) {
        const hls = new Hls(HLS_CONFIG)
        hlsRef.current = hls
        let netRetry = 0
        let mediaRetry = 0
        hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
          setLevels(data.levels.map((l, i) => ({ i, height: l.height, bitrate: l.bitrate })))
          onReady()
        })
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_e, data) => {
          const opts = data.subtitleTracks.map((t, i) => ({ key: `hls:${i}`, label: langLabel(t) }))
          setSubOptions((prev) => [...prev.filter((o) => !o.key.startsWith('hls:')), ...opts])
        })
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && netRetry++ < 2) return hls.startLoad()
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetry++ < 2)
            return hls.recoverMediaError()
          fail(`Playback error (${data.details})`)
        })
        hls.loadSource(src)
        hls.attachMedia(video)
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari / iOS: native HLS (buffer is browser-managed there).
        video.src = src
        video.addEventListener('loadedmetadata', onReady, { once: true })
      } else {
        fail('This browser cannot play HLS video')
      }
    })()

    return () => {
      cancelled = true
      hlsRef.current?.destroy()
      hlsRef.current = null
      if (video) {
        video.removeAttribute('src')
        video.load()
      }
    }
    // onFail is a callback prop; re-resolving only depends on what we play.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anilistId, episode, type])

  // External VTT tracks become menu options once their <track>s are rendered.
  useEffect(() => {
    const opts = extSubs.map((t, i) => ({ key: `ext:${i}`, label: t.lang || `Track ${i + 1}` }))
    setSubOptions((prev) => [...opts, ...prev.filter((o) => !o.key.startsWith('ext:'))])
    // Default to English if there is one.
    const en = extSubs.findIndex((t) => /^en|english/i.test(t.lang || ''))
    if (en >= 0) setSubKey(`ext:${en}`)
  }, [extSubs])

  // Apply the chosen subtitle (external <track> or in-stream HLS track).
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const [kind, idxStr] = subKey.split(':')
    const idx = Number(idxStr)
    Array.from(video.textTracks).forEach((tt, i) => {
      tt.mode = kind === 'ext' && i === idx ? 'showing' : 'disabled'
    })
    const hls = hlsRef.current
    if (hls) {
      hls.subtitleDisplay = kind === 'hls'
      hls.subtitleTrack = kind === 'hls' ? idx : -1
    }
  }, [subKey, subOptions])

  // Quality: -1 = auto (adaptive), otherwise lock to a level.
  useEffect(() => {
    if (hlsRef.current) hlsRef.current.currentLevel = level
  }, [level])

  // Live "buffered ahead" readout + periodic resume-position save.
  useEffect(() => {
    const id = setInterval(() => {
      const v = videoRef.current
      if (!v) return
      const t = v.currentTime
      let end = t
      for (let i = 0; i < v.buffered.length; i++) {
        if (v.buffered.start(i) <= t + 0.5 && v.buffered.end(i) > end) end = v.buffered.end(i)
      }
      setAhead(Math.max(0, end - t))
      if (!v.paused && t > 0) savePos(anilistId, episode, t)
    }, 1000)
    return () => clearInterval(id)
  }, [anilistId, episode])

  const qualityLabel = (l) => (l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)} kbps`)

  return (
    <div className="native-player">
      <div className="native-frame">
        <video
          ref={videoRef}
          controls
          playsInline
          crossOrigin="anonymous"
          onEnded={() => {
            savePos(anilistId, episode, 0)
            onEnded?.()
          }}
        >
          {extSubs.map((t, i) => (
            <track key={t.url} kind="subtitles" src={t.url} label={t.lang} srcLang={t.lang} data-i={i} />
          ))}
        </video>
        {(status === 'resolving' || status === 'loading') && (
          <div className="embed-overlay">
            <span className="spinner" />
            {status === 'resolving' ? 'Finding the stream…' : 'Loading video…'}
          </div>
        )}
        {status === 'error' && (
          <div className="embed-overlay native-error">⚠ {error}</div>
        )}
      </div>

      {status === 'ready' && (
        <div className="native-bar" data-no-loader>
          <label>
            Quality{' '}
            <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              <option value={-1}>Auto</option>
              {levels
                .slice()
                .sort((a, b) => (b.height || b.bitrate) - (a.height || a.bitrate))
                .filter((l, i, arr) => i === 0 || qualityLabel(l) !== qualityLabel(arr[i - 1]))
                .map((l) => (
                  <option key={l.i} value={l.i}>
                    {qualityLabel(l)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Subtitles{' '}
            <select value={subKey} onChange={(e) => setSubKey(e.target.value)}>
              <option value="off">Off</option>
              {subOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <span className="native-buffer" title="How much video is already downloaded ahead">
            Buffered ahead: <strong>{Math.round(ahead)}s</strong> / 120s
          </span>
          {provider && <span className="native-provider">source: {provider}</span>}
        </div>
      )}
    </div>
  )
}
