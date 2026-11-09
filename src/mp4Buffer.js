// Plays a single-file MP4 with OUR buffer target. Browsers decide on their own
// how far to pre-load a plain MP4 (Chrome stops around 30s), so we download it
// in byte ranges, repackage it with mp4box and feed it to the video element
// through Media Source, stopping once TARGET_AHEAD seconds are loaded.

const TARGET_AHEAD = 120 // seconds kept loaded ahead of the playhead
const BACK_BUFFER = 60 // seconds kept behind it for instant rewind
const CHUNK_BYTES = 1024 * 1024
const SAMPLES_PER_SEGMENT = 200
const MAX_FETCH_RETRIES = 5
const CHUNK_TIMEOUT_MS = 60000 // only for truly stuck downloads: some hosts send 1 MB in ~15s

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// End of the loaded stretch containing time t, or t if nothing is loaded there.
function loadedUntil(video, t) {
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= t + 0.5 && video.buffered.end(i) > t) return video.buffered.end(i)
  }
  return t
}

// Starts playback and returns a function that tears it down. Falls back to the
// browser's own MP4 handling if this browser or file can't be repackaged.
export function playMp4Buffered(video, src, onFatal) {
  let stopped = false
  let cleanup = () => {}
  const playPlain = () => {
    video.src = src
  }

  async function run() {
    if (typeof MediaSource === 'undefined') return playPlain()
    const { default: MP4Box } = await import('mp4box')
    if (stopped) return

    const mediaSource = new MediaSource()
    const objectUrl = URL.createObjectURL(mediaSource)
    video.src = objectUrl
    await new Promise((resolve) =>
      mediaSource.addEventListener('sourceopen', resolve, { once: true }),
    )
    if (stopped) return

    const file = MP4Box.createFile()
    const tracks = []
    let ready = false
    let parseError = null
    let offset = 0
    let size = Infinity
    let finished = false
    let seekGeneration = 0
    let chunkAbort = null

    const drain = (track) => {
      if (stopped || track.sb.updating || !track.queue.length) return
      const op = track.queue.shift()
      try {
        if (op.remove) track.sb.remove(op.remove[0], op.remove[1])
        else track.sb.appendBuffer(op.buffer)
      } catch (err) {
        if (err.name !== 'QuotaExceededError') throw err
        // Browser memory limit: put it back and retry once playback moves on.
        track.queue.unshift(op)
        setTimeout(() => drain(track), 1000)
      }
    }

    const busy = () => tracks.some((t) => t.sb.updating || t.queue.length)

    file.onError = (e) => {
      parseError = new Error(String(e))
    }
    file.onReady = (info) => {
      try {
        for (const t of info.tracks) {
          if (!t.video && !t.audio) continue
          const mime = `video/mp4; codecs="${t.codec}"`
          if (!MediaSource.isTypeSupported(mime)) throw new Error(`Unsupported codec ${t.codec}`)
          const track = { id: t.id, sb: mediaSource.addSourceBuffer(mime), queue: [] }
          track.sb.addEventListener('updateend', () => drain(track))
          tracks.push(track)
          file.setSegmentOptions(t.id, track, { nbSamples: SAMPLES_PER_SEGMENT })
        }
        mediaSource.duration = info.duration / info.timescale
        for (const init of file.initializeSegmentation()) {
          init.user.queue.push({ buffer: init.buffer })
          drain(init.user)
        }
        ready = true
        file.start()
      } catch (err) {
        parseError = err
      }
    }
    file.onSegment = (id, track, buffer, sampleNumber) => {
      track.queue.push({ buffer })
      drain(track)
      file.releaseUsedSamples(id, sampleNumber)
    }

    const onSeeking = () => {
      if (!ready) return
      // Carry on from the end of what's already loaded around the new position.
      const from = loadedUntil(video, video.currentTime)
      seekGeneration++
      chunkAbort?.abort()
      for (const t of tracks) t.queue = t.queue.filter((op) => op.remove)
      offset = file.seek(from, true).offset
      finished = false
    }
    video.addEventListener('seeking', onSeeking)

    cleanup = () => {
      chunkAbort?.abort()
      video.removeEventListener('seeking', onSeeking)
      URL.revokeObjectURL(objectUrl)
    }

    const evictBehind = () => {
      const keepFrom = video.currentTime - BACK_BUFFER
      for (const t of tracks) {
        if (t.sb.buffered.length && t.sb.buffered.start(0) < keepFrom) {
          t.queue.push({ remove: [0, keepFrom] })
          drain(t)
        }
      }
    }

    const fetchChunk = async (start, generation) => {
      for (let attempt = 0; ; attempt++) {
        const abort = new AbortController()
        chunkAbort = abort
        const timer = setTimeout(() => abort.abort(), CHUNK_TIMEOUT_MS)
        try {
          const res = await fetch(src, {
            headers: { Range: `bytes=${start}-${start + CHUNK_BYTES - 1}` },
            signal: chunkAbort.signal,
          })
          if (!res.ok) throw new Error(`Video server responded ${res.status}`)
          const total = Number(res.headers.get('content-range')?.split('/')[1])
          if (total) size = total
          return await res.arrayBuffer()
        } catch (err) {
          if (stopped || generation !== seekGeneration) return null
          if (attempt >= MAX_FETCH_RETRIES) throw err
          await sleep(500 * (attempt + 1))
        } finally {
          clearTimeout(timer)
        }
      }
    }

    while (!stopped) {
      if (parseError) throw parseError
      const ahead = loadedUntil(video, video.currentTime) - video.currentTime
      const nearEnd =
        ready && loadedUntil(video, video.currentTime) >= mediaSource.duration - 0.5
      if (finished || busy() || (ready && (ahead >= TARGET_AHEAD || nearEnd))) {
        await sleep(250)
        continue
      }

      if (offset >= size) {
        file.flush()
        while (!stopped && busy()) await sleep(50)
        if (!stopped && mediaSource.readyState === 'open') mediaSource.endOfStream()
        finished = true
        continue
      }

      const generation = seekGeneration
      const start = offset
      const chunk = await fetchChunk(start, generation)
      if (stopped || !chunk || generation !== seekGeneration) continue
      chunk.fileStart = start
      const next = file.appendBuffer(chunk)
      offset = typeof next === 'number' && next > start ? next : start + chunk.byteLength
      evictBehind()
    }
  }

  const guardedRun = async () => {
    try {
      await run()
    } catch (err) {
      if (stopped) return
      if (video.readyState === 0) {
        // Couldn't repackage this file: still play it, with the browser's buffer.
        cleanup()
        cleanup = () => {}
        return playPlain()
      }
      onFatal(err?.message || 'The video stopped loading')
    }
  }
  guardedRun()

  return () => {
    stopped = true
    cleanup()
  }
}
