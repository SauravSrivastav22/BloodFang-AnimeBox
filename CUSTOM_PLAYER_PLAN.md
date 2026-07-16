# BloodFang — Custom Player Plan & Session Notes

_Last updated: 2026-07-16_

This file records what we discussed about streaming/buffering and the plan to
build our **own** video player (so we don't lose the context).

---

## 1. Why the buffer / pre-load can't be controlled today

Right now BloodFang **does not host or control the video**. When you press play,
the player you see is a **third-party player inside a cross-origin `<iframe>`**
(Vidnest / VidLink). That provider's player owns:

- how many seconds it buffers ahead,
- video quality / ABR,
- the ads, the subtitle CC menu — **everything**.

Browser security (same-origin policy) means **our JavaScript cannot reach inside
that iframe**. Same wall that blocked:
- the pop-up/new-tab ad fix (sandbox breaks their anti-adblock → "Please Disable
  Sandbox"), and
- adding a subtitle-language dropdown.

**Result:** we cannot tell their player "buffer 2 minutes ahead." That knob is in
*their* code.

### User's actual request (keep for reference)
> While streaming, the video should pre-load at least ~2 minutes ahead of the
> current position (e.g. watching at 5:45 → buffered out to ~7:45) when the
> connection is good, so buffering doesn't interrupt playback.

This is a **valid, standard idea** — it's just not reachable through an embed.

---

## 2. The custom player — IS it possible? YES.

Building our own player is feasible. It requires moving from "embed someone
else's player" to "play the raw stream ourselves." That's a real
re-architecture, not a toggle.

### What it needs
| Piece | Detail |
|-------|--------|
| **Own player** | `hls.js` + a UI (Plyr / Vidstack / custom). Then we set the forward buffer directly. |
| **The real stream URL** | The `.m3u8` (HLS) URL. Providers hide this inside their player, so we need a **scraper/extractor** to resolve it per episode. |
| **A backend server** | The scraper must run server-side (CORS + obfuscation). Cannot run on the current **free static Firebase Hosting** — needs an always-on Node host (Render/Railway/Fly/VPS), likely **paid**. |
| **CORS proxy** | Many stream CDNs block cross-origin playback; often need to proxy segments through our server. |
| **Legal note** | Scraping + re-serving streams is a bigger DMCA/ToS exposure than embedding. Repo is public. |

### The part the user wants (the 2-min buffer) — trivial ONCE we own the player
With `hls.js` we just configure the forward buffer, e.g.:

```js
const hls = new Hls({
  maxBufferLength: 120,      // seconds of forward buffer to keep (~2 min) when bandwidth allows
  maxMaxBufferLength: 240,   // hard ceiling (~4 min)
  maxBufferSize: 120 * 1000 * 1000, // ~120 MB cap so we don't over-buffer on huge streams
  backBufferLength: 60,      // keep 1 min behind for instant rewind
})
hls.loadSource(streamUrl)    // the resolved .m3u8
hls.attachMedia(videoEl)
```

`maxBufferLength: 120` = exactly "load ~2 minutes ahead when the internet is
good." hls.js already buffers adaptively; this raises the target so good
connections pre-fetch further and small dips don't cause a stall.

---

## 3. Rough build steps (when we decide to do it)

1. **Backend** (new Node service, always-on host):
   - `GET /stream?anilist=<id>&ep=<n>&type=sub|dub` → resolve provider → return
     `{ m3u8, subtitles[], headers }`.
   - Add a `/proxy` route for CORS'd HLS segments if needed.
   - Reuse the existing server cache pattern to avoid re-scraping.
2. **Frontend** — new `HlsPlayer.jsx`:
   - Replace `EmbedPlayer` (or add as "Server: Native (beta)" alongside embeds).
   - hls.js with the buffer config above; Plyr/Vidstack for controls, quality,
     subtitle tracks (real language menu becomes possible here!).
   - Keep the embed servers as fallback when extraction fails.
3. **Wire settings** — buffer length could even be a Settings slider later.
4. **Deploy** — frontend still static on Firebase; backend on the paid host;
   point the app at the backend URL via env.

### Bonus wins this unlocks (things also blocked today)
- Real **subtitle-language** menu (Eng/others) from the stream's tracks.
- **No pop-up/new-tab ads** (we control the DOM now).
- **Buffer-ahead / instant rewind** (the request that started this).
- Consistent UI, remember-position, next-episode autoplay, etc.

### Trade-offs / costs
- A **paid always-on server** (free tiers sleep and add cold-start lag).
- **Maintenance**: extractors break when providers change — ongoing upkeep.
- **Legal**: higher exposure than embeds (public repo).

---

## 4. Decision status

- **Discussed & documented:** 2026-07-16.
- **Decision:** DEFERRED — current app stays on the embed players (free, static,
  lower risk). Custom player is a **future project** to be scoped when we're
  ready to add a paid backend.
- **Meanwhile:** for buffering, switching **Server (Vidnest ↔ VidLink)** changes
  the CDN and often helps most.

---

## 5. This session's completed work (2026-07-16) — for the record

- ✅ Google login + cross-device **cloud sync** (Firebase Auth + Firestore) — LIVE.
- ✅ Per-user Firestore security rules (`auth.uid == users/{uid}`).
- ✅ `profile` (name/email/photo/uid) stamped on each user doc.
- ✅ Account/Sign-in button pinned **top-right** in both headers + responsive
  mobile popovers.
- ✅ Player **pop-up ad** investigation: sandbox blocks them but breaks playback
  ("Please Disable Sandbox") → reverted; added in-player **uBlock Origin** tip.
- ✅ Default audio = **Dub** (hosted build too).
- ✅ Subtitle-language note pointing to the player's own CC/⚙ menu.
- ✅ Language selector (Eng/Hindi/JP) — NOT feasible for anime beyond Sub/Dub via
  embeds (sources don't carry those tracks / can't reach the iframe) — dropped.
- ▶️ **Buffer / 2-min pre-load** → this doc (needs the custom player above).
