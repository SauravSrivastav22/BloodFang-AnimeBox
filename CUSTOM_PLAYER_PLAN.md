# BloodFang — Custom Player: Step-by-Step Build Plan

_Created: 2026-07-16 · Status: PLANNED (not started)_

Our own video player so we can control the stream — the goal that started this:
**pre-load ~2 minutes ahead so buffering stops mid-episode**. Owning the player
also unlocks a real subtitle-language menu and removes pop-up/new-tab ads.

> **Why we need this:** today the video is a third-party player inside a
> cross-origin `<iframe>` (Vidnest/VidLink). Browser security blocks us from
> touching anything inside it — buffer, subtitles, ads. To control those, we must
> play the raw stream in **our own** player instead of embedding theirs.

---

## 0. The goal in one line of code

Once we own the player, the 2-minute buffer is just an hls.js config:

```js
const hls = new Hls({
  maxBufferLength: 120,              // keep ~2 min buffered ahead when bandwidth allows
  maxMaxBufferLength: 240,           // hard ceiling ~4 min
  maxBufferSize: 120 * 1000 * 1000,  // ~120 MB cap
  backBufferLength: 60,              // keep 1 min behind for instant rewind
})
```

Everything below exists to get us to the point where we can run that.

---

## 1. Architecture (what we're building)

```
  Browser (BloodFang, static on Firebase — FREE)
        │
        │  1) "give me the stream for anime 21, ep 1069, dub"
        ▼
  Our Backend  (Node/Express on a FREE always-on host)
        │  2) scrape/resolve the provider → real .m3u8 URL + subtitle tracks
        │  3) return { m3u8, subtitles[], headers }
        ▼
  Browser plays it with OUR hls.js player
        │  4) video segments (.ts/.m4s) —
        ▼      proxied through our backend if the CDN blocks CORS
  Stream CDN
```

**Two new pieces:** a **backend** (resolver + CORS proxy) and a **frontend
player** (hls.js). The rest of BloodFang stays exactly as-is.

---

## 2. Tech stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Player core | **hls.js** | Buffer control, quality, subtitle tracks |
| Player UI | **Vidstack** (or Plyr) | Nice controls, captions, keyboard; React-friendly |
| Backend | **Node + Express** | Reuse our existing `server/` patterns + cache |
| Extractor | scraper module (per provider) | Resolves the `.m3u8`; the fragile part |
| Host | **Oracle Cloud "Always Free" VM** | 24/7, ~$0, ~10 TB/mo egress (see §6) |
| Frontend host | **Firebase Hosting** (unchanged) | Still free static |

---

## 3. PHASE 1 — Backend: stream resolver (the hard part)

**Goal:** an endpoint that turns (anime id, episode, sub/dub) into a playable
`.m3u8` URL + subtitle tracks.

Steps:
1. **Scaffold** a new service (or extend `server/`):
   - `GET /api/stream?anilist=<id>&ep=<n>&type=sub|dub`
   - Response: `{ ok, m3u8, subtitles: [{lang, url}], headers }`
2. **Pick a source strategy** (choose one to start, add more later):
   - **Self-hosted extractor** (e.g. a Consumet-style resolver we run) — most
     control, most maintenance.
   - **Reverse a provider** (Vidnest/VidLink/other) to read its `.m3u8` — fragile,
     breaks when they change.
3. **Cache** resolved URLs briefly (reuse `server/index.js cached()`), because
   stream links expire — short TTL (e.g. 5–10 min).
4. **Return subtitle tracks** when the source exposes them (this is what makes a
   real language menu possible).
5. **Handle failure** gracefully: `{ ok:false }` → frontend falls back to the old
   embed player.

**Deliverable:** hitting `/api/stream?anilist=21&ep=1069&type=dub` returns a JSON
with a working `.m3u8`.

---

## 4. PHASE 2 — Backend: CORS segment proxy

Many stream CDNs block cross-origin playback (browser can't fetch the segments
directly). Fix: proxy them through our backend.

Steps:
1. Add `GET /api/proxy?url=<segment-or-playlist-url>` that streams the remote
   resource back with `Access-Control-Allow-Origin: *`.
2. Rewrite the `.m3u8` so segment URLs point at `/api/proxy?url=...`.
3. **Forward required headers** (Referer/Origin/User-Agent) the CDN expects.
4. **Stream, don't buffer** the whole file (pipe response) to keep memory low.
5. Watch bandwidth — this route carries all the video (see cost §6).

**Deliverable:** the `.m3u8` from Phase 1 plays end-to-end through the proxy with
no CORS errors.

---

## 5. PHASE 3 — Frontend: our hls.js player

**Goal:** a `NativePlayer.jsx` that plays the resolved stream with the 2-min
buffer.

Steps:
1. `npm i hls.js` (+ `vidstack` or `plyr` for UI).
2. New `src/NativePlayer.jsx`:
   - Fetch `/api/stream?...` → get `m3u8` + subtitles.
   - Create hls.js with the **buffer config from §0**.
   - `hls.loadSource(m3u8)` → `hls.attachMedia(videoEl)`.
   - Add subtitle `<track>`s from the returned `subtitles[]` → **real language
     menu**.
   - Native HLS fallback for Safari/iOS (`video.canPlayType('application/vnd.apple.mpegurl')`).
3. **Wire into `EmbedPlayer` as a new server option** — add "Native (beta)" to the
   Server switch, keep Vidnest/VidLink as fallback. If Native fails → auto-fall
   back to an embed. This keeps the app working the whole time.
4. Carry over existing niceties: remember-position, next-episode, Sub/Dub toggle
   (now real audio tracks / re-resolve), keyboard shortcuts.
5. (Optional) A **Settings slider** for buffer length (30 s – 4 min).

**Deliverable:** picking "Native" plays the episode in our player, buffered ~2
min ahead, with a working subtitle menu and no pop-up ads.

---

## 6. PHASE 4 — Hosting: Oracle Cloud "Always Free" (the FREE path)

The frontend stays free on Firebase. Only the backend needs a home. Cheapest
always-on option is Oracle's free VM.

Steps:
1. Create an **Oracle Cloud** account → **Always Free** tier.
2. Launch a free **ARM (Ampere) VM** (e.g. 2 cores / 12 GB, Ubuntu).
3. Open the firewall / security list for the app port (e.g. 8080) + 80/443.
4. Install Node, clone the backend, run it under **pm2** (auto-restart).
5. Put **Caddy or Nginx** in front for HTTPS (Let's Encrypt) → a clean
   `https://api.bloodfang...` URL. (A free domain or DuckDNS works.)
6. In BloodFang, set the backend base URL via env (`VITE_STREAM_API=...`);
   rebuild `npm run build:static`; `firebase deploy --only hosting`.

**Free alternatives (if Oracle is a pain):**
- **Railway / Render / Fly / Koyeb free tier** — push-to-deploy, but they *sleep*
  (cold start ~30–60 s) and may limit heavy video bandwidth.
- **No-backend Path C** — public stream API + browser hls.js (zero infra, least
  reliable; breaks often).

**Cost:** **$0** on Oracle Always Free (~10 TB/mo egress is plenty for us). Paid
fallback if it ever gets popular: **Hetzner CX22 ~€4/mo** (20 TB) or **Railway
~$5/mo**. Do **not** use serverless (Vercel/Netlify/Lambda) for the video proxy —
timeouts + metered egress make it the wrong tool.

> Bandwidth reality: ~1.5–3 GB/hr per 1080p viewer through the proxy. Just us =
> negligible; a crowd = revisit the paid VPS options.

---

## 7. PHASE 5 — Test & verify

- [ ] `/api/stream` returns a valid `.m3u8` for sub AND dub on several titles
      (One Piece deep ep, a movie, a new season).
- [ ] Stream plays through `/api/proxy` with no CORS errors.
- [ ] Buffer really reaches ~2 min ahead on a good connection (check
      `video.buffered` / hls stats).
- [ ] Subtitle language menu shows + switches tracks.
- [ ] No pop-up/new-tab ads (we own the DOM now).
- [ ] Native fails → auto-falls back to the embed player (no dead end).
- [ ] Works on desktop + mobile (iOS native HLS path).

---

## 8. Maintenance (the real ongoing cost)

- Extractors **break when providers change their site** → periodic fixes.
- Keep the **embed players as a permanent fallback** so a broken extractor never
  takes the whole app down.
- Stream URLs **expire** → keep resolver TTL short; re-resolve on playback error.
- Watch host **uptime/bandwidth**; Oracle can reclaim idle free VMs — keep the
  deploy scripted so re-standing-up is quick.

---

## 9. Milestone checklist (build order)

- [~] **M1** — `/api/stream` resolves a real `.m3u8` (Phase 1) — **CODE DONE**, live
      verification deferred to M4 (see note below)
- [ ] **M2** — `/api/proxy` plays it past CORS (Phase 2)
- [ ] **M3** — `NativePlayer.jsx` plays with 2-min buffer + subtitles (Phase 3)
- [ ] **M4** — deployed on Oracle free VM behind HTTPS, wired via env (Phase 4)
      — **verify M1 here** (sources aren't blocked from a datacenter IP)
- [ ] **M5** — tested + embed fallback confirmed (Phase 5)
- [ ] **M6** — (optional) buffer-length Settings slider, autoplay-next polish

### M1 status note (2026-07-24)

`/api/stream` was built on the existing AniList→HiAnime Consumet mapper
(`server/index.js`). The endpoint, short-TTL cache, and `{ok:false}` fallback are
done and lint-clean. **It could NOT be verified from the dev machine** because
every anime source domain (hianime.to, animepahe, animekai, …) is unreachable
from this home connection: `hianime.to` returns HTTP 000 (TCP/SNI blocked) while
its mirror `aniwatch.to` returns 200, and DNS resolves fine — the signature of
ISP / Cloudflare domain blocking, not a code bug. Both Consumet and the
`aniwatch` scraper hardcode the blocked domain, so neither resolves locally.

**Decision (user):** this is exactly why the resolver belongs on the cloud host.
Keep the M1 code as-is and verify it end-to-end at **M4**, running on the Oracle
free VM (foreign datacenter IP → sources reachable). If Consumet's providers are
still rotted there, swap the resolver to the maintained **`aniwatch`** npm package
(dedicated HiAnime scraper) — the `/api/stream` contract stays identical.

---

## 10. Decision / risks recap

- **Feasible & free?** Yes — Oracle Always Free covers the backend at $0; hls.js +
  Firebase static are already free. Money is not the blocker.
- **Real costs:** setup effort + ongoing extractor maintenance + free-tier
  reliability + higher DMCA/ToS exposure (repo is public).
- **Decision (2026-07-16):** plan documented; **build deferred** until we choose to
  start. When we do, follow M1 → M6 in order.
- **Meanwhile:** on the current embed player, switching **Server (Vidnest ↔
  VidLink)** changes the CDN and helps buffering most.

---

## Appendix — this session's shipped work (2026-07-16)

Already LIVE on https://bloodfang-anime.web.app (not part of this plan, just
record): Google login + cloud sync (Firebase Auth/Firestore), per-user rules,
profile on each doc, account button top-right + responsive, default audio = Dub,
pop-up investigation (reverted sandbox + uBlock tip), subtitle-language note.
