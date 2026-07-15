# BloodFang

🧛 A React (Vite) anime browser with **search** and **category (genre) filters**.
(Formerly “DevilApp”.)

Data comes from the open-source [Consumet](https://github.com/consumet/consumet.ts)
aggregator (`@consumet/extensions`): AniList supplies catalog/metadata and the
**HiAnime** provider (the `hianimetv` source) supplies streaming info. A small
Express backend does the fetching so the browser never hits those sites directly
(avoids CORS and keeps the frontend clean).

## Architecture

```
Browser (React/Vite, :5173)  →  Express backend (:3001)  →  @consumet/extensions  →  anime sources
        BloodFang UI                server/index.js              AniList + HiAnime
```

## Run

Install once:

```bash
npm install
```

Start the backend + frontend together:

```bash
npm start
```

Then open the Vite URL it prints (default http://localhost:5173).

Or run them separately in two terminals:

```bash
npm run server   # API on http://localhost:3001
npm run dev       # web on http://localhost:5173
```

## API endpoints (backend)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/trending` | Trending anime (home feed) |
| `GET /api/popular` | Popular anime |
| `GET /api/search?q=<query>&genres=<A,B>` | Search + category filter |
| `GET /api/info/:id` | Full details for a title (AniList id) |
| `GET /api/watch/:episodeId` | Streaming sources for an episode |

## Notes

- Consumet providers scrape third-party sites, so a provider can occasionally
  break or rate-limit; the backend returns a `502` with a message when that
  happens and the UI shows a friendly error.
- To add another source, construct a different provider in `server/index.js`
  (available: `Hianime`, `AnimePahe`, `AnimeKai`, `KickAssAnime`, ...).

See `HISTORY.md` for the full change log and roadmap.
