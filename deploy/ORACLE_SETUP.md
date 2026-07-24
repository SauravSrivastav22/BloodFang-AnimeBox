# M4 — Deploy the BloodFang backend FREE on Oracle Cloud (step by step)

This puts our streaming API (`/api/stream`, and later `/api/proxy`) online 24/7
on a **$0 "Always Free"** Oracle server, behind HTTPS, and points the app at it.
This is also where **M1 finally gets verified** — the server's datacenter IP can
reach the anime sources that are blocked from your home connection.

**Time:** ~45–60 min the first time. **Cost:** $0 (Always Free tier).
**You do:** the console clicks + SSH. **The repo provides:** every script/command.

Legend: 🖱 = click in a web console · ⌨ = run in the VM's terminal (SSH)

---

## Part 0 — What we're standing up

```
  Browser (app on Firebase)  ──►  https://api.YOURNAME.duckdns.org   (Caddy, port 443, auto-HTTPS)
                                          │  reverse proxy
                                          ▼
                                  Node API on localhost:8080  (pm2 keeps it alive)
                                          │  scrapes / resolves
                                          ▼
                                  Anime sources (reachable from the datacenter IP)
```

You need three free things: **an Oracle account**, **a free domain (DuckDNS)**,
and this repo (public, already on GitHub).

---

## Part 1 — Create the free VM  🖱

1. Go to **https://www.oracle.com/cloud/free/** → **Start for free**.
2. Sign up. It asks for a **card for identity verification only** — the Always
   Free resources are **never charged**. Pick a home region close to you.
3. In the Oracle console, open **☰ Menu → Compute → Instances → Create instance**.
4. Set these:
   - **Name:** `bloodfang-api`
   - **Image & shape → Edit → Change shape → Ampere (ARM)** →
     **VM.Standard.A1.Flex**. Set **1–2 OCPUs** and **6–12 GB RAM** (all inside
     Always Free). _If you get an "out of capacity" error, try a different
     Availability Domain or come back later — free ARM capacity comes and goes._
   - **Image:** **Canonical Ubuntu 22.04** (or 24.04).
   - **Networking:** keep "Create new VCN" — leave "Assign public IPv4 address"
     **ON**.
   - **SSH keys:** choose **Generate a key pair for me** → **download BOTH** the
     private and public keys. Keep the **private** key safe — you log in with it.
5. **Create**. Wait ~1 min until state = **Running**. Copy the **Public IP
   address** shown on the instance page — call it `SERVER_IP`.

---

## Part 2 — Open the firewall (TWO layers — both required)  🖱 + ⌨

Oracle blocks ports in two places. You must open **80** and **443** in both.

### 2a. Cloud firewall (Security List)  🖱
1. On the instance page → click the **Virtual Cloud Network** (or **Subnet**) link.
2. Open **Security Lists → Default Security List → Add Ingress Rules**. Add two:
   - Source `0.0.0.0/0`, IP Protocol **TCP**, Destination port **80**
   - Source `0.0.0.0/0`, IP Protocol **TCP**, Destination port **443**
3. Save.

### 2b. OS firewall (iptables) — the classic Oracle gotcha  ⌨
The Ubuntu image ships with iptables that blocks everything but SSH. SSH in
first (Part 4), then run:
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```
(If `netfilter-persistent` isn't found: `sudo apt-get install -y iptables-persistent`
then re-run the save.)

---

## Part 3 — Free domain (DuckDNS)  🖱

Caddy needs a domain to issue HTTPS. DuckDNS gives one free.
1. Go to **https://www.duckdns.org** → sign in (Google/GitHub).
2. Create a subdomain, e.g. `bloodfang-api` → you now own
   **`bloodfang-api.duckdns.org`**.
3. In the box for that subdomain, put your **`SERVER_IP`** and click **update ip**.
4. Verify it resolves (on your PC): `nslookup bloodfang-api.duckdns.org` → should
   show `SERVER_IP`.

Remember your full domain — call it `YOUR_DOMAIN` (e.g.
`bloodfang-api.duckdns.org`).

---

## Part 4 — SSH into the VM  ⌨

From your PC (PowerShell or Git Bash), using the **private** key you downloaded:
```bash
# fix key perms once (Git Bash / macOS / Linux):
chmod 600 /path/to/your-private-key.key
ssh -i /path/to/your-private-key.key ubuntu@SERVER_IP
```
On Windows PowerShell the same works: `ssh -i C:\path\to\key.key ubuntu@SERVER_IP`.
Accept the fingerprint the first time. You're now on the server (prompt shows
`ubuntu@bloodfang-api`).

> Do Part 2b (iptables) now while you're here.

---

## Part 5 — Install & run everything (one command)  ⌨

This clones the repo, installs Node/pm2/Caddy, installs deps, and starts the API
under pm2. Safe to re-run.
```bash
curl -fsSL https://raw.githubusercontent.com/SauravSrivastav22/BloodFang-AnimeBox/main/deploy/setup.sh | bash
```
When it finishes, confirm the API is alive **locally on the VM**:
```bash
curl -s http://localhost:8080/api/health      # → {"ok":true}
```

### Now wire up HTTPS with Caddy  ⌨
1. Put your domain into the Caddyfile and install it:
```bash
cd ~/BloodFang-AnimeBox
sed "s/api.YOURNAME.duckdns.org/YOUR_DOMAIN/" deploy/Caddyfile | sudo tee /etc/caddy/Caddyfile
sudo mkdir -p /var/log/caddy
sudo systemctl reload caddy      # (or: sudo systemctl restart caddy)
```
2. Caddy now fetches a free TLS cert automatically (takes ~30 s the first time).
   Test HTTPS from your PC:
```bash
curl -s https://YOUR_DOMAIN/api/health        # → {"ok":true}
```
If that returns `{"ok":true}` over **https**, the backend is live to the world. 🎉

---

## Part 6 — ✅ Verify M1 live (the whole point)  ⌨/PC

Now hit the resolver on real titles. From your PC:
```bash
curl -s "https://YOUR_DOMAIN/api/stream?anilist=21&ep=1&type=sub"
curl -s "https://YOUR_DOMAIN/api/stream?anilist=154587&ep=1&type=sub"
```
**Expected:** `{"ok":true,"m3u8":"https://...","subtitles":[...],...}`.

- `ok:true` with an `m3u8` → **M1 is verified.** 🎯 Move on to M2 (CORS proxy).
- `ok:false` on everything → the Consumet providers are rotted even from the
  datacenter. That's the pre-agreed fallback: swap the resolver to the
  maintained **`aniwatch`** package (same `/api/stream` contract). Tell me and
  I'll do that swap.

---

## Part 7 — Point the app at the backend  🖱/PC (do after M2/M3)

The frontend calls the API only once we have the native player (M3). When we get
there:
1. Add to `.env.static`: `VITE_STREAM_API=https://YOUR_DOMAIN`
2. `npm run build:static` then `firebase deploy --only hosting`.

(Not needed yet — M1/M2 are backend-only. Listed here so the path is complete.)

---

## Redeploying later (after you push new code)  ⌨
```bash
bash ~/BloodFang-AnimeBox/deploy/update.sh
```

## Troubleshooting
- **`curl https://YOUR_DOMAIN` hangs / refused** → firewall. Recheck Part 2a
  (Security List) AND 2b (iptables). 90% of issues are here.
- **Caddy cert fails** → domain isn't pointing at `SERVER_IP` yet (Part 3), or
  port 80 is closed (Caddy needs 80 for the ACME challenge).
- **`pm2` list / logs:** `pm2 status`, `pm2 logs bloodfang-api`.
- **API up locally but not via domain** → Caddy issue: `sudo systemctl status caddy`,
  `sudo journalctl -u caddy -n 50`.
- **"out of host capacity" creating the VM** → free ARM is in demand; try another
  Availability Domain or retry later. (An AMD `VM.Standard.E2.1.Micro` Always
  Free shape also works, just smaller.)
- **`/bin/bash^M: bad interpreter`** → the script got CRLF line endings. Fix on
  the VM: `sed -i 's/\r$//' deploy/*.sh`.

---

### Summary of what you provide vs. what's automated
| You (console/SSH) | Automated by scripts |
|---|---|
| Create Oracle account + VM (Part 1) | Node/pm2/Caddy install (setup.sh) |
| Open firewall ×2 (Part 2) | Clone repo + install deps |
| Free domain (Part 3) | Start API under pm2 + boot-start |
| SSH in (Part 4) | (Caddy reload is one paste in Part 5) |
| Run 1 curl command (Part 5) | |
