# BloodFang — Project History & Tracking

> Renamed from **DevilApp** → **BloodFang** on 2026-07-14. Historical entries
> below still say “DevilApp” (accurate to when they were written).

A React application. This file tracks the project's progress, decisions, and change history.

---

## Project Info

| Field | Value |
|-------|-------|
| **App Name** | BloodFang (was DevilApp) |
| **Type** | React (web) application |
| **Created** | 2026-07-07 |
| **Node** | v22.19.0 |
| **npm** | 10.9.3 |
| **Location** | `E:\Project\AnimeBox` |

---

## Changelog

### 2026-07-07
- 📝 Created `HISTORY.md` for project history & tracking.
- ⚡ Scaffolded React app with **Vite + React (JS)** in current folder.
- 🏷️ Set app name to **DevilApp** (`package.json`, `index.html` title).
- 📦 Installed dependencies (24 packages, 0 vulnerabilities).
- ✅ Verified production build succeeds (`npm run build`).
- 🧩 Chose data source: **Consumet aggregator** (via `@consumet/extensions`).
- 🖥️ Added **backend** (`server/index.js`, Express) using AniList metadata +
  **HiAnime** provider (the `hianimetv` source). Endpoints: `/api/trending`,
  `/api/popular`, `/api/search` (query + genre filter), `/api/info/:id`,
  `/api/watch/:episodeId`. Handles CORS.
- 🔌 Added Vite dev proxy `/api → localhost:3001`.
- 🎨 Built React UI: search bar + **category (genre) filter chips** + poster grid
  (`src/App.jsx`, `src/api.js`, dark "Devil" theme in `src/App.css`).
- 🧪 Verified live data: trending (24), search+genre, and genre-only all return
  real results from the provider.
- ▶️ Added scripts: `npm run server`, and `npm start` (runs API + web together
  via `concurrently`).
- 🎬 Built **detail page** (`src/DetailPage.jsx`): poster, banner, synopsis,
  genres, rating/status/episode/duration tags, and an episode list. Clicking a
  card opens it; back button returns to browse.
- ▶️ Built **episode player** (`src/Player.jsx`) with **hls.js** for HLS
  (`.m3u8`) streams + native/mp4 fallback and a quality switcher.
- 🛡️ Made `/api/info` **resilient**: metadata comes from AniList directly and
  always renders; episodes come from the provider with an **8s timeout** so a
  down source (currently returning 522) can't hang the page — UI shows a
  friendly "source unavailable" note instead.
- 🧪 Verified: `/api/info/21` returns HTTP 200 in ~10s during the HiAnime outage
  with full metadata (title, genres, 1602-char synopsis) + clear episode error.
  Player/episodes will work automatically once the provider recovers.
- 🔎 Diagnosed episode outage: all Consumet scraper sources (hianime.to + 7
  mirrors) are down (522) or structurally incompatible — inherent scraper
  fragility, not an app bug. `hianimetv.su` itself is reachable (HTTP 200) but
  Consumet's scraper expects `hianime.to`'s structure.
- ✅ Added **reliable episode fallback via AniList** `streamingEpisodes`
  (`fetchAniListEpisodes` in `server/index.js`): titles + thumbnails + legal
  streaming links (Crunchyroll, etc.). Detail page now **always shows episodes**
  — playable in-app when a scraper source is up, otherwise thumbnail cards that
  open official streaming. Verified: One Piece → 69 episodes returned.
- 📦 Produced a full project copy → `E:\Project\DevilApp-full-copy.zip`
  (source only, no `node_modules`; restore with `npm install`).
- 🔀 Added **multi-provider fallback** for in-app streaming: HiAnime → AnimePahe
  → AnimeKai, queried **in parallel** (`fetchEpisodesWithFallback`), first with
  episodes wins. Each episode is tagged with its `provider`; `/api/watch` routes
  to the matching source via `?provider=`. UI shows a green "source: …" badge.
- 🧪 Verified fallback: all three sources are currently unreachable from this
  network (hianime timeout, animepahe/animekai DNS failures — stale domains), so
  it correctly degraded to the AniList list (69 eps). When any source is up it's
  auto-selected and in-app playback works — no code change needed.
- ▶️ **Free in-app video playback** via embed sources (`src/EmbedPlayer.jsx`):
  iframe player keyed by AniList id + episode + sub/dub, with **Server 1
  (vidlink.pro) / Server 2 (vidnest.fun)** switch. Works for ANY title,
  independent of the dead Consumet scrapers. Verified both embed hosts return
  live player pages (HTTP 200) for AniList id 21 ep 1.
- 🔧 Rewrote `DetailPage.jsx`: every episode (rich AniList card OR numbered
  fallback) now plays **inside DevilApp** via the embed player instead of linking
  out to Crunchyroll. Numbered list covers titles with no rich data (e.g. Naruto).
- Note: embed sources are third-party (ads, volatile domains); the server switch
  + sub/dub toggle handle a source being down. `Player.jsx`/hls.js retained for
  when a scraper returns raw `.m3u8`.
- 🐞 Fixed in-app playback: embed players (Vidnest etc.) refused to run inside a
  sandboxed iframe ("Please Disable Sandbox"). Removed the `sandbox` attribute
  (kept `allow=…`); video now plays **inside DevilApp**. Trade-off: the source
  can open ad popups — unavoidable with free embeds.
- 🔀 Servers reordered best-first (VidLink → Vidnest → MegaPlay → VidSrc); moved
  the server/audio switcher **above** the player; added an **"Open in new tab ↗"**
  fallback link. Confirmed working: Death Note Ep 1 plays via Vidnest.
- ⏯️ Added **Continue Watching** history (`src/history.js`, localStorage): playing
  an episode saves {id,title,image,episode}; a "Continue Watching" row on the home
  view (hidden while searching/filtering) shows recent titles with an EP badge +
  ▶ Resume. Clicking resumes that episode directly; ✕ removes an entry. Capped at
  20, newest-first. All client-side — nothing leaves the browser.
- ⬅️➡️ Wired **browser Back + Forward**: opening a title `pushState`s a history
  entry carrying {id, episode}; `popstate` now reads that state — Back returns to
  browse (restores results + scroll), **Forward reopens the exact anime** (handy
  when you forget its name). Fully state-driven navigation.
- 🔀 Reordered players **Vidnest (default) → VidLink → VidSrc**; dropped MegaPlay
  (needs a HiAnime id, not AniList — always failed). Providers have different
  catalogs, so "not found" on one is expected; Vidnest resolves AniList ids most
  reliably.
- ♾️ Added **infinite scroll**: `fetchPage`/`loadMore` append the next page
  (de-duped by id) via an `IntersectionObserver` sentinel; works for trending and
  search+genre. Verified page 1 vs 2 return distinct results.
- 🔊 **Dub-first playback**: player now defaults to **Dub**. Backend `/api/info`
  adds `dubAvailable` (best-effort HiAnime search dub-count, 6s timeout, `null`
  when the source is unreachable). Player hides the **Dub** button only when a
  title has no dub (`dubAvailable === false`); `null`/unknown stays dub-first.
  (Right now the dub source is down → `null` → defaults to dub + both shown.)
- 📦 **Production build (local)** — one-command app. `server/index.js` now serves
  the built React app (`dist/`) **and** the API on a **single port** (3001):
  `express.static(dist)` + an Express-5-safe SPA fallback (non-`/api` routes →
  `index.html`). Added `npm run prod` (`vite build` → `node server/index.js`).
  In dev (no `dist/`) it skips static serving and just runs the API, so `npm
  start` is unchanged. Verified: `npm run build` (202 KB JS / 7.7 KB CSS gzip),
  then `/` serves DevilApp HTML, `/anime/21` (deep link) → 200 via SPA fallback,
  `/api/health` → `{"ok":true}`, `/api/trending` → 24 results — all on
  http://localhost:3001. **Run the whole app with `npm run prod`.**

### 2026-07-14
- 🔗 **URL routing (react-router-dom v7)** — pages are now shareable/bookmarkable
  and survive refresh. Routes: `/` (browse), `/anime/:id` (detail),
  `/anime/:id?ep=N` (deep-link straight to an episode), `*` → redirect home.
  Browse state (query, genres, filter) reflects into the URL as
  `/?q=…&genres=…` (replace, so it doesn't spam history). `main.jsx` wraps the
  app in `<BrowserRouter>`; `App.jsx` uses `<Routes>` with the browse markup as
  the `/` element and a `DetailRoute` wrapper (reads `:id` + `?ep`). Playing an
  episode updates `?ep` so the exact episode is bookmarkable. Back/Forward now go
  through the router; browse state lives in the always-mounted `App`, so Back
  restores results instantly and scroll is restored via `scrollRef`. The
  IntersectionObserver re-attaches on return to browse (`isBrowse` dep).
- 🧩 Split `DetailPage` fetch effect: info loads once per `id`; a separate effect
  syncs `activeEp` to `startEpisode`, so changing the episode via the URL no
  longer refetches the whole title. Added `onEpisodeChange` prop.
- 🧪 Verified (production build on :3001): `/`, `/anime/21`, `/anime/21?ep=3`,
  `/?q=naruto&genres=Action` all → 200 serving the app HTML (SPA fallback);
  `/api/health` → `{"ok":true}`. Lint clean, build OK (bundle 246 KB / 78.7 KB
  gzip, up from 202 KB — react-router).
- ✨ **Error / empty / loading polish** so the app never looks broken when a
  scraper is off:
  - **Skeleton loaders** — page-1 loads now show a shimmer grid of placeholder
    cards (and a skeleton hero on the detail page) instead of a bare “Loading…”.
  - **Friendly empty state** — a card with an icon + message; offers **Clear
    filters** (when a search/genre is active) and **↻ Try again**.
  - **Friendly error state** — explains the source/backend may be down, shows the
    raw error small, and gives a **↻ Try again** that re-runs the request
    (browse: `retry()`; detail: a `reloadKey` bump that refetches).
  - **“Load more” spinner** — infinite-scroll footer now shows a spinner.
  - **Detail “no episodes”** — replaced the red one-liner with a calm box (📺)
    that suggests trying the player or retrying.
  - New CSS: `@keyframes shimmer/spin`, `.skeleton*`, `.state-box`, `.btn`,
    `.spinner`. CSS 7.7 → 9.5 KB (gzip 2.5 KB). Lint clean, build OK, server
    smoke test green (`/`, `/api/health`, search → 24).
- 🔁 **Player auto-recovery** (`src/EmbedPlayer.jsx`) — the embed player now
  recovers from dead servers instead of showing a silent grey box:
  - **Remembers the last-working server** in `localStorage`
    (`devilapp:server`); the player opens on it next time (`initialServerIdx`).
  - **Load watchdog** — when the `<iframe>` doesn't fire `load` within 9s the
    server is treated as unreachable and the player **auto-advances to the next
    untried server**, showing a “‘X’ didn’t respond — trying ‘Y’…” notice. Tried
    servers are tracked per episode (`attempted` ref) so it never loops; if all
    time out it tells the user to use “Open in new tab”. (Cross-origin means
    `load` fires even for a source’s own “couldn’t find” page, so this only
    catches truly dead servers — the manual controls handle catalog misses.)
  - **Loading overlay** — a spinner sits over the frame until it loads.
  - **“▶ Not playing? Try next server”** button cycles servers manually; any
    manual pick resets the auto-advance chain (user takes control). On a
    successful `load` the working server is saved as the new default.
  - New CSS: `.embed-notice`, `.embed-overlay`, `.embed-actions`. Lint clean,
    build OK (JS 250 KB / 79.5 KB gzip), server smoke test green.
- 🧛 **Blood “Summoning…” loader** (`src/BloodLoader.jsx`) — an on-brand loading
  overlay: a spinning blood ring (masked conic gradient) around a pulsing 🧛
  vampire with dripping-blood drops, shown for **≥2s on any button click**.
  Implemented globally via a capture-phase `document` click listener (fires
  before navigation) so ANY `button`/`[role=button]` triggers it — rendered once
  at the app root so it overlays across all routes. Elements marked
  `[data-no-loader]` are exempt (the player’s Server/Audio switch + “Try next”
  and the Continue-Watching ✕ remove — in-place toggles where a 2s block would
  annoy). Honors `prefers-reduced-motion`. New CSS: `.blood-loader/.blood-ring/
  .blood-face/.blood-drip/.blood-text` + `@keyframes blood-fade/spin/pulse/fall`.
  CSS 9.9 → 12.0 KB (gzip 3.2 KB). Lint clean, build OK, smoke test green.
- ♥ **Favorites / My List** (`src/favorites.js`, localStorage
  `devilapp:favorites`, cap 200, newest-first) — mirrors the Continue Watching
  pattern; nothing leaves the browser. `getFavorites/isFavorite/addFavorite/
  removeFavorite/toggleFavorite`.
  - **Heart toggle on every grid card** (top-left, appears on hover or when
    favorited; rating stays top-right). Marked `data-no-loader` and
    `stopPropagation` so it toggles in place without opening the card or firing
    the vampire loader.
  - **“♥ In My List / ♡ Add to My List” button on the detail page** (under the
    title), synced to the saved state per `id`.
  - **“♥ My List” row on the home view** (like Continue Watching, hidden while
    searching/filtering): click a poster to open it, ✕ to remove.
  - New CSS: `.fav-btn`, `.fav-toggle`. CSS 12.0 → 12.9 KB (gzip 3.35 KB), JS
    253 KB / 80.3 KB gzip. Lint clean, build OK, smoke test green (`/`,
    `/anime/21`, `/api/health`).
- ▶ **Resume-at-episode from any card** — grid cards for titles already in
  Continue Watching now show a **“▶ Resume EP X” ribbon** across the bottom of
  the poster. Clicking it jumps **straight to that episode**
  (`/anime/:id?ep=X`) instead of the detail top; clicking elsewhere on the card
  still opens the detail normally. App builds a `resumeMap` (id → last-watched
  episode) from history and passes `resumeEp`/`onResume` to `AnimeCard`; new
  `openAtEpisode(id, ep)` helper. New CSS: `.resume-ribbon`. CSS 12.9 → 13.3 KB
  (gzip 3.41 KB). Lint clean, build OK, smoke test green.
- ⌨️ **Search-as-you-type (debounced)** — results now update live while typing.
  Replaced the on-`activeGenres` fetch effect with a debounced effect on
  `[query, activeGenres]` (~450ms) so there's no request per keystroke. First
  load runs immediately (`firstRun` ref); a `lastKey` ref records the last search
  actually run so pressing Enter (immediate) and the pending debounce don’t
  double-fetch. Genre toggles + the search box both flow through it and mirror
  into the URL. `resetBrowse` clears both filters and runs once. Placeholder
  updated to “results update as you type”. Deps scoped to `[query, activeGenres]`
  (setSearchParams isn’t referentially stable in RRv7). Lint clean, build OK
  (JS 254 KB / 80.4 KB gzip), smoke test green (`/`, `/api/health`, search
  ‘one’ → 24).
- 📱 **Mobile / responsive pass** (CSS-only) — verified the viewport meta is set
  and added breakpoints so it works on phones:
  - **≤900px:** tighter episode/stream grids.
  - **≤640px:** search bar drops to its own full-width row under the brand;
    filter chips become a single horizontally-scrollable row (no tall wall of
    wrapped chips, scrollbar hidden); poster grid → comfy 2–3 cols
    (minmax 140px); detail hero stacks with a centered poster and `min-width:0`
    info (no horizontal overflow); episode lists go 2-up; player audio toggle
    un-pins from the right; smaller blood loader; smaller section titles/padding.
  - **≤380px:** poster grid locked to exactly 2 columns; smaller brand.
  - **`@media (hover:none)`:** the card ♥ heart is always visible on touch
    devices (otherwise it only showed on hover — un-favoritable on a phone).
  - New CSS only. CSS 13.3 → 14.5 KB (gzip 3.70 KB). Lint clean, build OK, all 5
    media queries confirmed in the bundle, smoke test green.
- 🏠 **Genre landing rows on home** — the default view now has a streaming-style
  landing page: horizontally-scrolling rows for `FEATURED_GENRES`
  (Action, Adventure, Comedy, Romance, Fantasy, Sci-Fi), below Continue Watching
  / My List and above the Trending grid. New `GenreRow` component fetches its
  genre once (`searchAnime({genres:[g]})`, top 15), caches per session in a
  module-level `genreCache` so returning home doesn’t refetch, shows skeleton
  cards while loading, and **hides itself** if the genre is empty or errors.
  Cards reuse `AnimeCard` (heart + resume ribbon work in the rows too).
  **“See all →”** filters the main grid to that genre (`onSeeAll` → `setActiveGenres([g])`
  + scroll to top). Rows only render on the home view (`!query && no genres`).
  New CSS: `.genre-rows/.genre-row/.genre-row-head/.see-all/.row-scroll` +
  fixed-width row cards (150px, 132px on phones, scroll-snap, thin scrollbar).
  CSS 14.5 → 15.4 KB (gzip 3.92 KB), JS 255 KB / 80.7 KB gzip. Lint clean, build
  OK, smoke test green (Action/Romance rows → 24 each).
- 🏁 **Roadmap complete — kept LOCAL-ONLY by decision (2026-07-14).** #1–#8 done;
  **#9 (public deploy) intentionally skipped.** DevilApp embeds third-party
  pirate sources, so a public deploy would invite DMCA/takedowns + host-ToS
  bans, and the free embeds commonly block non-localhost referrers (public host
  would serve the UI but blank players). Personal use is fully covered by
  `npm run prod` → http://localhost:3001. If portability is ever needed, prefer a
  **private Docker self-host** over a public URL.
- 🏷️ **Renamed DevilApp → BloodFang** (user choice). Two-tone brand
  `Blood`(red)`Fang`(white) in both headers; tab `<title>`, `package.json` name
  (`bloodfang`), server log lines, README, and code comments updated. Footer set
  to **“🧛 BloodFang · Dark · Blood”** (replacing “DevilApp · data via Consumet …”).
  **localStorage keys kept as `devilapp:*`** on purpose so existing Continue
  Watching / My List / server prefs survive the rename.
- 🐛 **Fixed detail page hanging on the skeleton forever.** `/api/info/:id` used
  Consumet’s `fetchAnilistInfoById`, which couples metadata to the HiAnime
  scraper and hangs with no timeout when that source is down (e.g. `/anime/101922`
  stuck loading). Now metadata is fetched **directly from AniList GraphQL**
  (`fetchAniListMeta`, fast + always up) and **timeout-guarded** (8s), the
  AniList episodes call is timeout-guarded (6s), and the frontend API client
  (`get()`) has a **20s AbortController timeout** — so the page always resolves
  to real data or the **error + “↻ Try again”** screen, never an infinite
  skeleton.
- ⚡ **Detail page now paints in ~1–2s (fast-path split).** `/api/info/:id` was
  reduced to just the two quick, reliable AniList calls — **metadata + episode
  list**, run in parallel — and the slow/flaky **dub check moved to a new
  `/api/dub/:id`** the detail page fetches **after** it paints, then merges in.
  Measured: `info/101922` **1.83s cold** / `info/21` **0.92s warm** (was ~9.9s);
  the 3.2s dub check no longer blocks render. Frontend: `getDub(id,title)` +
  a `dubAvailable` state in `DetailPage` (null=unknown→dub-first,
  false=sub-only→hide Dub), passed to `EmbedPlayer`. Removed the now-unused
  `fetchEpisodesWithFallback` + `PROVIDER_ORDER` (scraper episode list wasn’t
  rendered by the UI anyway). Lint clean, build OK.
- 🧊 **3D cinematic effects via anime.js v4** (`animejs` 4.5, new `src/anim.js`):
  - **`reveal3D`** — signature staggered 3D entrance (rise + rotateX out of
    depth, `outExpo`, 35ms stagger) for the results grid and each genre row.
    Fresh searches reveal the whole grid; infinite-scroll reveals only the newly
    appended cards. No-flash (opacity set to 0 synchronously first).
  - **`useTilt`** — cards tilt in 3D following the cursor (rotateX/Y +
    translateZ) with a smooth return on leave. Mouse-only.
  - **`enter3D`** — the detail hero drops in with a 3D rotate; episode cards
    cascade in with `reveal3D`.
  - CSS: `perspective` on `.grid`/`.row-scroll`/`.stream-grid`/`.episode-grid`
    (1200px) and `.detail` (1400px); card hover swapped from a flat lift to a
    **blood-red glow** (transform is now anime.js-driven); `preserve-3d` +
    `will-change`.
  - All helpers **honor `prefers-reduced-motion`** (tilt also skips touch).
    Verified the anime.js API doesn’t throw. JS 255→291 KB (gzip 80.9→95.2 KB,
    anime.js ~36 KB). Lint clean, build OK, server serving the new bundle.
- 🩸 **Cinematic loader finale (vampire bite → full-screen blood splash → reveal)**
  — rebuilt `BloodLoader` as an anime.js **timeline**: (1) **Summon** — vampire
  rises in the spinning blood ring with a 3D `rotateY` flip; (2) **Bite** — the
  vampire lunges (`scale` + shake); (3) **Splash** — a full-screen blood blob
  bursts in 3D (`.blood-splash`, 230vmax radial gradient) with a white
  **fang-slash** streak and 18 **droplets** flung outward in a radial burst
  (function-based translate); (4) **Reveal** — the blood recedes/drips and the
  whole overlay fades over **~1.5s**, showing the page underneath slowly.
  New layers: `.bl-stage/.blood-splash/.fang-slash/.blood-splat`; loader given
  `perspective:1000px`. Initial states `set()` synchronously (no flash); a
  `playingRef` guard stops re-triggering mid-sequence; **reduced-motion** users
  get a quick fade instead. Validated `createTimeline` + positions + function
  values don’t throw. JS 291→296 KB (gzip 96.7 KB), CSS 15.6→16.6 KB. Lint
  clean, build OK, server serving it.
- 🧛 **Realistic(er) vampire + partial splash (loader v2).** Replaced the emoji
  with a **drawn SVG vampire** (`Vampire` component: pale face, Dracula high
  collar, widow’s-peak hair, **glowing red eyes**, white **fangs**). The bite now
  animates the vampire lunging, the **fangs striking** (`.vamp-fangs` scaleY from
  the gumline via `transform-box:fill-box`), and the **eyes flaring**. The splash
  is no longer a full-red screen fill — it’s a **partial central spatter** that
  fades to transparent by ~50% radius, and the **background blurs** at that
  moment (`.blood-loader.bl-splash { backdrop-filter: blur(15px) }`, toggled via
  the splash step’s `onBegin`). Blood still recedes over ~1.5s to reveal the
  page. JS 296→298 KB (gzip 97.5 KB), CSS 16.6→16.9 KB. Lint clean, build OK.
- 🩸 **Realistic vampire image (loader v3).** Per user pref, the loader now shows
  a **real photo** — **Count Orlok (Max Schreck, “Nosferatu”, 1922)**, public
  domain, hosted on Wikimedia — tinted blood-red via CSS filter
  (`sepia+saturate+hue-rotate` + red glow). Preloaded on mount; **falls back to
  the drawn SVG vampire** (`imgOk` state + `onError`) if the image can’t load
  (offline / URL change). Bite lunges the image; fang/eye tweens are guarded to
  the SVG path only. Ring enlarged (176px, 150 on phones) to frame the portrait.
  Caveat noted to user: needs internet at load; verify the license before any
  public use (this one is public domain). Verified both the 500px thumb and the
  original resolve 200/JPEG. Lint clean, build OK, server serving it.
- 🦇 **Loader v4 — no image; animated anime-style vampire that bites.** Per user
  (referenced a Vampire-Knight-style anime frame), removed the photo and went
  back to a **code-drawn SVG** restyled **anime**: grayscale palette, long dark
  hair (side curtains + forehead bangs), sharp **red almond eyes**, big **fangs**.
  The bite is now truly animated: the **mouth opens wide** (`.vamp-mouth` scaleY)
  with the **lower fangs dropping** (`.vamp-lower`), then the head **lunges and
  the jaw SNAPS shut** (chomp) → triggers the partial blood splash + blur, then
  the ~1.5s reveal. Removed the Orlok image / preload / fallback. Ring resized to
  156px. JS 298.9→299.8 KB. Lint clean, build OK, server serving it. (Honest
  caveat to user: exact anime-art quality needs an image asset; this is a drawn
  approximation — a local AI-generated PNG could be dropped in and animated.)
- 🩸🖐️ **Loader v5 — drip → reaching hand → splash (user's concept).** Dropped
  the vampire entirely. New anime.js sequence: (1) **blood drops fall** down the
  screen (`.drop` ×9, staggered, `inQuad` accelerate); (2) a **clawed hand**
  (`ClawHand` SVG, dark with blood-tipped nails) **reaches out toward the viewer**,
  scaling up in 3D from below; (3) it **lunges to grab** → the partial **blood
  splash** bursts and the **background blurs**; (4) blood **recedes over ~1.5s**
  to reveal the page. New CSS: `.drip-field/.drop/.hand-wrap/.hand`; reuses the
  splash layers. JS ~298 KB / 97.4 KB gzip, CSS 17.5 KB. Lint clean, build OK,
  server serving it.
- 🔵🩸 **Loader v6 — centered orb with blood rain (user concept, base).** Reset
  the loader to a simple **circular orb** in the middle with **blood raining
  inside it** (CSS `@keyframes rain-fall`, 14 drops, negative animation-delays
  for a seamless loop, clipped by the round `.orb` + a blood `.orb-pool` at the
  bottom). Shows ~2s on any button click then **fades out** (`.bl-fade`). Pure
  CSS — no anime.js timeline (loader JS trimmed; bundle 298→291 KB). Removed the
  hand/drip sequence. This is the base the user asked for; they'll extend it
  next. Lint clean, build OK, server serving it.
- 🦷 **Brand fang icon.** Added a horror **fang-with-blood-drip** SVG (`FangIcon`)
  before the **BloodFang** wordmark in both the browse and detail headers
  (`.brand` is now an inline-flex so the icon + text align; `.brand-fang` scales
  with the font via `em` + a red glow). Also replaced the default Vite
  `favicon.svg` with a matching fang mark so the browser tab shows it. Lint
  clean, build OK, server serving it.
- 🧪🩸 **Blood vial meter + pour popup (user concept).** A small **blood vial**
  now sits **before the BloodFang wordmark** (`BloodGlass`, in both headers) and
  **fills up a little each time a page is opened** (SVG liquid rises via a
  `scaleY` transform on the clipped fill rect; smooth 0.8s transition; glows when
  full). State persists in `localStorage` (`bloodfang:blood`, MAX 6) via
  `src/blood.js` (`getBlood/addBlood/resetBlood` + `bloodfang:blood`/`:full`
  window events). Opening a title (`openTitle`/`openResume`/`openAtEpisode`)
  calls `addBlood()`. When it tops out, **`BloodPour`** (rendered once at app
  root) takes over: a full vial **tips and pours a stream of blood down into the
  loading orb**, which fills (`.pour-pool` scaleY) while blood rains, then fades
  and **resets the vial** — anime.js timeline. New CSS: `.blood-glass/.glass-fill/
  .glass-full` + `.pour-overlay/.pour-vial/.pour-stream/.pour-orb/.pour-pool`.
  Lint clean, build OK, server serving it.
- 🔮 **Summon reveal (payoff after the pour).** After "Blood full — Summoning",
  the pour now resolves into a reward: a **flash bursts and a random anime rises
  out of the blood** — "🩸 The blood summons…" with the poster, title, and a
  **▶ Watch now** button (+ Dismiss; auto-dismisses after 9s). `BloodPour` is now
  prop-controlled with a two-phase flow (`pour` → `reveal`); App picks a random
  anime from the current results (excluding the one just opened) when the vial
  tops out (`bumpBlood`), passes it as `summon`; **Watch now** opens it
  (`openSummoned`) and resets the vial. Turns the gimmick into a discovery
  feature. New CSS: `.summon-flash/.summon-card/.summon-poster/.summon-title/
  .summon-actions`. Lint clean, build OK, server serving it.
- 🔽 **Sort control + tag categories (Isekai) — user request.** Added a **Sort**
  dropdown to the browse filters: Default / Trending / Most Popular / **Top Rated
  (by score)** / Newest / Oldest / Title A–Z (`SORTS` in api.js; `sort` threaded
  through `searchAnime`/`fetchPage`/`runSearch`/`loadMore`/URL, seeded from
  `?sort=`). Backend `/api/search` rewritten to a **direct AniList GraphQL
  search** (`fetchAniListSearch`) supporting free text + **genre_in** + **tag_in**
  + **sort** (`SORT_MAP` → MediaSort). Chips are split into real AniList genres
  vs **tags** (via `ANILIST_GENRES`), so **Isekai** (a tag, not a genre) now
  works as a category. Added **Isekai** to the category chips and added
  **Isekai + Slice of Life** to the home landing rows (`FEATURED_GENRES`).
  Verified: `genres=Isekai&sort=score` → Re:Zero S4 (90), Mushoku Tensei…; date
  sort works; Isekai/Slice-of-Life rows → 24 each. New CSS `.sort-control`. Lint
  clean, build OK, server serving it.
- 🐛 **Fix: sort didn't work on the bare home view.** The home sections (Continue
  Watching / My List / genre rows) only hid when a query or genre was set, so a
  sort-only selection kept the home layout and buried the sorted grid below the
  rows (looked broken; "worked after searching"). Switched those three
  conditions to `!hasFilters` (which now includes `activeSort`), so picking a
  sort on the home immediately shows the sorted grid. Verified `sort=score`
  (no query/genre) → Frieren (91) at top. Lint clean, build OK.
- 🧹 **Code cleanup pass.** Removed dead code accumulated across the loader
  iterations: deleted the unused `Player.jsx` (HLS player) + `getSources` API +
  the `/api/watch` endpoint + the `hls.js` dependency; simplified the server
  providers to just `anilist` + `rawHianime` (dropped the unused AnimePahe/
  AnimeKai engines); stripped ~3 KB of dead CSS (old vampire/ring/splash/hand
  loader classes + `blood-spin`/`blood-pulse`/`blood-fall` keyframes + their
  reduced-motion rule) and the stale mobile overrides; trimmed verbose comments
  to concise one-liners. CSS 20.4 → 17.3 KB. Lint clean, build OK, full endpoint
  smoke test green (trending/search/genre+sort/isekai/info/dub/SPA all pass;
  `/api/watch` correctly 404s).

### 2026-07-15
Post-roadmap enhancement pass — **15 features (A–O)**, all lint-clean + build-green.

**Detail page (A–E)**
- ▶️ **A. Prev/Next episode controls** in the player — a nav bar above the embed
  (`◀ Prev` / `Next ▶`), clamped to `[1, total]`, reusing `play()` so it saves
  progress + updates `?ep`. `[data-no-loader]` (in-place, skips the blood loader).
- 📚 **B. Episode range pagination** — long-running series (One Piece, 1000+) no
  longer render every button. `EP_PAGE=100` range selector (1–100, 101–200, …);
  the view auto-snaps to the playing episode's chunk.
- ✅ **C. Watched-episode markers** — played episodes dim + show a ✓. New
  per-title watched set in `localStorage` (`devilapp:watched`), separate from the
  resume pointer (`history.js` `getWatchedEpisodes`/`markEpisodeWatched`).
- 🔗 **D. Related + Recommendations rows** — "Related" (sequels/prequels,
  relation-tagged) + "You might also like", clickable to open the title. AniList
  `relations`+`recommendations` folded into `fetchAniListMeta`, anime-only,
  mapped to the card shape via a shared `MEDIA_CARD_FIELDS`/`toCard` helper.
- 🎬 **E. Trailer + characters** — YouTube trailer embed (hidden for non-YouTube/
  none) + a character row (top 12). Same AniList meta query.
- 🧪 Verified live `/api/info/21`: 69 streaming eps, 12 characters, 59 related
  (first `SIDE_STORY`), 12 recommendations (first HUNTER×HUNTER), trailer absent →
  section correctly hidden.

**Browse / discovery / UX (F–K)**
- 🔍 **F. Year / Season / Format / Status filters** — four compact selects next to
  Sort; flow through URL sync + debounced search + infinite scroll + Clear.
  Backend `_fetchAniListSearch` + `/api/search` map them to AniList
  `seasonYear`/`season`/`format`/`status`. Verified: MOVIE+2020 → Violet
  Evergarden Movie; RELEASING+Action → One Piece.
- 🗓️ **G. "Trending this Season" home row** — leads the home page (season computed
  from the date; Dec rolls to next WINTER). `GenreRow` generalized into a reusable
  `Row` taking any `searchAnime` criteria + `cacheKey`; "See all →" filters the
  grid to the season.
- ⌨️ **H. Keyboard shortcuts** — `/` focuses search (browse); `Esc` = back
  (detail); `←`/`→` change episode while watching. Ignored while typing in a field.
- ⬆️ **I. Scroll-to-top button** — floating, appears past 600px, smooth-scrolls up
  (`ScrollTopButton.jsx`, rendered globally).
- ⚙️ **J. Settings panel** — gear popover: default **Sub/Dub**, **blood-loader**
  toggle, **3D animations** toggle (+ **adult** toggle, see N). New `settings.js`
  (`bloodfang:settings`, persisted + broadcast via a `CustomEvent`); honored by
  `EmbedPlayer` (default audio), `BloodLoader` (skip when off), `anim.js`
  (`reduced()` also true when animations off). `SettingsPanel.jsx`.
- ⤴️ **K. Share button** — copies the current deep link (`/anime/:id?ep=N`) to the
  clipboard with a brief "✓ Copied!".

**Platform / catalog (L–O)**
- 📲 **L. Installable PWA** — `public/manifest.webmanifest` + `public/sw.js`
  (offline app shell: cache-first hashed `/assets/`, network-first navigation,
  never caches `/api` or cross-origin). Registered in `main.jsx` **prod only**.
- ⚡ **M. Server-side AniList cache** — in-memory TTL cache (`cached()`): metadata/
  episodes 10 min, search 5 min; caches successes only; opportunistic cleanup
  over 500 entries. Verified: repeat `/api/search` **1331 ms → 25 ms**.
- 🔞 **N. Adult (18+) toggle** — Settings switch → `api.js` adds `adult=1` →
  backend **omits** the `isAdult` filter when set (AniList treats `isAdult:null`
  as a literal match → 0 results, so the arg must be dropped, not nulled).
  Default stays safe. Verified: default 24 → adult 24 (was the 0-result bug).
- 🎲 **O. "Surprise me"** — filter-bar chip opens a random popular title (random
  page 1–40 + random pick). `App.jsx onSurprise`.
- 🆕 New files: `settings.js`, `SettingsPanel.jsx`, `ScrollTopButton.jsx`,
  `public/manifest.webmanifest`, `public/sw.js`. Final bundle: CSS 21.1 KB
  (gzip 5.0), JS 313 KB (gzip 101).

---

## Task Log / TODO

- [x] Scaffold React project ("DevilApp")
- [x] Install dependencies
- [x] Verify build runs
- [x] Backend proxy for anime data (Consumet / HiAnime)
- [x] Search filter
- [x] Category (genre) filter
- [x] Detail page + episode player (uses `/api/info` and `/api/watch`)
- [x] Pagination / infinite scroll
- [x] Add a second provider (AnimePahe/AnimeKai) as a fallback when HiAnime is down
- [x] Continue Watching history + browser Back/Forward navigation
- [x] In-app video playback (embed player, dub-first)
- [x] Production build (local) — single-port `npm run prod`
- [ ] URL-based routing (react-router) so detail pages are shareable/bookmarkable

---

## Decisions

_Record key technical decisions here (framework choices, libraries, architecture)._

| Date | Decision | Reason |
|------|----------|--------|
| 2026-07-07 | Use React for the app | Requested by user |

---

## Notes

_Freeform notes, blockers, and ideas._
