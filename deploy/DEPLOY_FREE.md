# M4 (no-card) — Deploy the backend FREE on Koyeb or Render

The card-free path for the streaming API (`/api/stream`, later `/api/proxy`).
**No credit card, no SSH, no firewall, no Linux commands** — connect GitHub and
it deploys itself from the `Dockerfile` in this repo. This is also where **M1
gets verified** (the host's datacenter IP can reach the anime sources that are
blocked from your home connection).

**Cost:** $0. **Trade-off:** the free instance **sleeps when idle**, so the first
request after a pause takes ~30–60 s to wake, then it's normal.

> Two hosts below. **Try Koyeb first.** If Koyeb asks for a card, use **Render** —
> its free web service genuinely needs no card. The repo files (`Dockerfile`,
> `render.yaml`) already support both.

---

## What's already in the repo (nothing for you to write)
- **`Dockerfile`** — builds a backend-only image, runs `node server/index.js`,
  listens on the platform's `$PORT`.
- **`.dockerignore`** — keeps the image small.
- **`render.yaml`** — one-click Render blueprint.

---

## OPTION A — Koyeb  🖱

1. Go to **https://www.koyeb.com** → **Sign up** (use **GitHub** — one click, no card
   on the free "Hobby" plan).
2. **Create Web Service** → **GitHub** → authorize Koyeb to see your repos →
   pick **`BloodFang-AnimeBox`**, branch **`main`**.
3. **Builder:** Koyeb auto-detects the **Dockerfile** — leave it.
4. **Instance:** choose the **Free** instance.
5. **Ports / health check:** set the health check path to **`/api/health`**
   (Koyeb reads `$PORT` automatically — our server already uses it, so leave the
   port as Koyeb's default).
6. **Deploy.** Wait ~2–4 min for the build. You'll get a public URL like
   **`https://bloodfang-api-<you>.koyeb.app`** — call it `YOUR_URL`.

Jump to **Verify M1** below.

---

## OPTION B — Render (guaranteed no card)  🖱

1. Go to **https://render.com** → **Get Started** → sign up with **GitHub** (no card
   for free web services).
2. **New +** → **Web Service** → connect **`BloodFang-AnimeBox`**.
3. Render detects the **`Dockerfile`** (Runtime = **Docker**). If it asks:
   - **Instance Type:** **Free**
   - **Health Check Path:** **`/api/health`**
   - (Everything else can stay default — the Dockerfile handles build/start.)
4. **Create Web Service.** Wait ~3–5 min. You'll get
   **`https://bloodfang-api.onrender.com`** — call it `YOUR_URL`.

> Shortcut: **New + → Blueprint** and point it at the repo — Render reads
> `render.yaml` and sets everything up for you.

---

## ✅ Verify M1 live (the whole point)

Once the service shows **healthy/running**, test from your PC (PowerShell or Git
Bash):

```bash
# 1) is the API up?  (first hit may take ~40s if it was asleep)
curl -s https://YOUR_URL/api/health
#    → {"ok":true}

# 2) does the resolver return a real stream?
curl -s "https://YOUR_URL/api/stream?anilist=21&ep=1&type=sub"
curl -s "https://YOUR_URL/api/stream?anilist=154587&ep=1&type=sub"
```

**Read the result:**
- `{"ok":true,"m3u8":"https://...","subtitles":[...]}` → 🎯 **M1 VERIFIED.** We move
  to **M2** (the CORS proxy).
- `{"ok":false,...}` on **every** title → the Consumet providers are rotted even
  from the datacenter. That's the pre-agreed fallback: I swap the resolver to the
  maintained **`aniwatch`** package (same `/api/stream` contract, no change for
  you). Just paste me the output.

---

## After M2/M3 — point the app at it (not needed yet)
When the native player (M3) is ready:
1. Add to `.env.static`: `VITE_STREAM_API=https://YOUR_URL`
2. `npm run build:static` → `firebase deploy --only hosting`.

## Redeploying later
Both hosts **auto-redeploy on every `git push` to `main`** — nothing to run. (You
can also hit "Redeploy" in their dashboard.)

## Troubleshooting
- **Build fails** → open the host's build logs; usually a transient npm hiccup →
  click Redeploy.
- **Health check failing** → make sure the path is exactly **`/api/health`**.
- **First request very slow** → normal on free tier (waking from sleep). Later
  requests are fast.
- **`/api/stream` returns `ok:false` everywhere** → not a deploy problem; it's the
  upstream source. Send me the output and I'll switch to the `aniwatch` resolver.

---

### You vs. automated
| You (clicks) | Automated (repo) |
|---|---|
| Sign up with GitHub | Docker build |
| Pick the repo + Free instance | Install deps, run the API |
| Set health path `/api/health` | Listen on `$PORT` |
| Run 2 curl commands to verify | Auto-redeploy on push |
