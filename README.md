# 🧛 BloodFang

**🔗 Live demo: https://bloodfang-anime.web.app**

A dark, vampire-themed **anime browser & player** built with **React (Vite)** and
a small **Express** backend. It aggregates data from **multiple anime APIs** for
catalog, metadata, search and streaming — the backend does the fetching so the
browser never hits those sources directly (avoids CORS, keeps the frontend clean).

> The live demo is a **static build** (talks to the anime API directly from the
> browser, no server) hosted free on Firebase — great for browsing/search/details.
> For full playback, run it locally with `npm run prod` (see [Deploy](#deploy)).

## Features

- 🔎 **Search-as-you-type** + category (genre) filters
- 🎛️ **Sort** (Top Rated / Newest / Popular…) and **advanced filters** — Year,
  Season, Format, Status
- 🗓️ **Home rows** — "Trending this Season" + genre landing rows
- ▶️ **In-app player** with multiple embed servers + auto-recovery, Sub/Dub
- ⏭️ **Prev / Next episode**, episode **range pagination** for long series,
  **watched ✓ markers**
- 📄 **Detail pages** — synopsis, tags, **trailer**, **characters**, **related**
  & **recommendations**
- 💾 **Continue Watching** + **My List** (favorites), resume from a card
- 🎲 **Surprise me** random pick
- ⌨️ **Keyboard shortcuts** ( `/` search · `Esc` back · `←/→` episode )
- 🩸 Blood/summoning **3D effects**, **PWA** install, **settings** panel
- ☁️ *Optional* **Google sign-in + cloud sync** across devices (see
  `FIREBASE_SETUP.md`)

## Architecture

```
Browser (React / Vite)  →  Express backend (:3001)  →  multiple anime APIs
       BloodFang UI              server/index.js         (catalog / metadata / streaming)
```

The Express server also serves the built app, so production runs on a single port.

## Run

Install once:

```bash
npm install
```

**Production (single port — recommended):**

```bash
npm run prod        # builds, then serves app + API on http://localhost:3001
```

**Development (hot reload, two processes):**

```bash
npm start           # API + Vite dev server together
# or separately:
npm run server      # API   on http://localhost:3001
npm run dev         # web   on http://localhost:5173
```

## API endpoints (backend)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/trending` | Trending anime (home feed) |
| `GET /api/popular` | Popular anime |
| `GET /api/search?q=&genres=&sort=&year=&season=&format=&status=&adult=` | Search + filters |
| `GET /api/info/:id` | Full details (metadata, episodes, related, recommendations, trailer, characters) |
| `GET /api/dub/:id?title=` | Dub availability (fetched after the page paints) |

## Deploy

The live demo is served on **Firebase Hosting** as a static build. Firebase
Hosting can't run the Express backend, so the static build (`VITE_DATA_MODE=direct`)
calls the anime API straight from the browser instead of `/api` — see
`src/anilist-direct.js`. Local `npm run prod` is unaffected.

```bash
npm run build:static          # builds dist/ in direct (no-backend) mode
firebase deploy --only hosting
```

Live: **https://bloodfang-anime.web.app**

> Note: on the hosted build, video playback depends on whether the embed
> providers allow the `web.app` domain; browse/search/details work regardless.

## Notes

- Streaming sources are third-party and can rate-limit or break; the backend
  returns a `502` with a message and the UI shows a friendly error + retry.
- Responses are cached in-memory (short TTL) to smooth over source hiccups.
- Cloud sync is off until you add your own Firebase config — see
  `FIREBASE_SETUP.md`. Without it the app stays fully local (localStorage).

See `HISTORY.md` for the full change log and `TODO.txt` for the roadmap.
