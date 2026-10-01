# FLYMIND — NEURAL GARDEN (patched build)

A low-end retro browser game where you are the fly. The fly brain runs in a Web Worker; Render handles lightweight multiplayer rooms, WebSocket state relay, and WebRTC voice signaling; Vercel hosts the frontend and secure OpenRouter NPC proxy.

## What was fixed
- Corrected the Render entry point to `backend.main:app` with a real `backend/` package.
- Corrected the Vercel layout: root `index.html`, `game/` assets, `api/npc.js` function.
- Added Render WebSocket multiplayer with room codes, custom names, presence and state relay.
- Added browser WebRTC voice chat signaled through the Render WebSocket service.
- Moved the compact LIF fly brain into `game/brain.worker.js` so it does not block rendering.
- Added mobile touch controls and a stronger retro UI.
- Added OpenRouter NPC proxy with local fallback and no client-side secret.
- Added Google H5 Games Ads integration hooks with a safe disabled-until-configured state.
- Added robots.txt, sitemap.xml and manifest.

## Run locally
### All-in-one Render-style game
```bash
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```
Open `http://127.0.0.1:8000/` for the game if you choose to add a root static mount, or use a static server for the frontend.

### Frontend-only
```bash
python -m http.server 4173
```
Open `http://127.0.0.1:4173/`.
Set `window.FLYMIND_RENDER_URL` near the top of `index.html` to your Render URL before multiplayer.

## Render multiplayer
Render web services accept inbound WebSocket connections. The backend exposes `/ws` and uses one in-memory room registry per service instance.

Set `FLYMIND_ORIGINS` to the Vercel origin, for example:
```text
https://your-game.vercel.app
```
Set `FLYMIND_MAX_PLAYERS=8` for small low-cost rooms.

Because rooms are in memory, do not scale this service horizontally until you add shared room state (Redis or another shared broker). Clients reconnect after interruptions.

## Vercel
Deploy the repository root as a Vercel project. `api/npc.js` becomes `/api/npc` automatically.

Environment variables:
```text
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=your-chosen-model
ALLOW_ORIGIN=https://your-game.vercel.app
```
Never put the OpenRouter key in browser code.

## OpenRouter NPC
The browser sends a compact world snapshot to `/api/npc`. The Vercel function calls OpenRouter and returns a validated high-level human intention. If the API is missing, rate-limited, times out, or returns invalid JSON, the local deterministic planner keeps the game running.

## Voice chat
Voice media uses browser WebRTC. Render only relays signaling messages (`offer`, `answer`, ICE candidates); it does not process microphone audio. A STUN server is configured for NAT discovery. Some restrictive networks may still require a TURN server for reliable connectivity.

The client uses a small full-mesh voice topology, so the multiplayer room size is intentionally capped at 8.

## Ads
The code includes an optional Google H5 Games Ads adapter in `game/ads.js`.

Edit in `index.html` after you are approved/configured:
```js
window.FLYMIND_ADS={
  publisherId:"ca-pub-REPLACE_ME",
  test:true,
  maxRewardedPerDay:10,
  coinsPerReward:100
};
```
The current build keeps ads inactive while the publisher ID is blank. Only completed rewarded placements grant in-game coins. Do not reward ordinary display-ad views or ask players to click ads.

Google's H5 Games Ads product supports interstitial and rewarded formats for HTML5 games. Configure the official H5 Games Ad Placement API and your publisher account before production.

## Search Console
Replace `YOUR-DOMAIN.example` in `public/robots.txt` and `public/sitemap.xml`, deploy, then verify the site in Google Search Console and submit the sitemap.

## Scientific honesty
- REAL: selected Drosophila circuit names/motifs can be used as references.
- BIOLOGICALLY INSPIRED: the compact LIF runtime and decoder in `game/brain.worker.js`.
- GAME FICTION: NeuroSignal English words, nectar, human hunting, combat, and social game rules.

This build does not claim to simulate the complete FlyWire/BANC connectome.

## Files
```text
index.html
api/npc.js
backend/main.py
backend/__init__.py
game/main.js
game/brain.js
game/brain.worker.js
game/multiplayer.js
game/voice.js
game/npc.js
game/ads.js
public/robots.txt
public/sitemap.xml
manifest.webmanifest
render.yaml
vercel.json
requirements.txt
```

## Deployment flow
Preferred: Vercel serves the UI and `/api/npc`; Render runs the WebSocket multiplayer/voice signaling service and optional `/api/npc` fallback. In the game Settings, set the Render URL to your `https://...onrender.com` service.
