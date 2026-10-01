# FLYMIND — NEURAL GARDEN

FLYMIND is a lightweight retro browser survival game where you are the fly.

## Final architecture

- `capture-a-fly-fr`: static browser client, deployed to Vercel.
- `capture-a-fly-br`: FastAPI backend, WebSocket rooms, WebRTC signaling, score API, and optional OpenRouter NPC planning, deployed to Render.
- The fly simulation and rendering stay in the browser. No per-frame neural inference runs on Render.
- Voice audio stays peer-to-peer through browser WebRTC; Render relays signaling messages.

## Render deployment

This repository is a Render Web Service.

Build command:
`pip install -r requirements.txt`

Start command:
`uvicorn backend.main:app --host 0.0.0.0 --port $PORT`

The blueprint pins the optional NPC model to:
`qwen/qwen3.8-27b:free`

Set the secret on Render only:
`OPENROUTER_API_KEY=...`

The public frontend is already configured for:
`https://capture-a-fly.onrender.com`

## Endpoints

- `GET /api/health` — health check
- `GET /api/best` — current local best score
- `POST /api/best` — save a best survival time
- `POST /api/npc` — validated high-level human hunter plan
- `WS /ws` — rooms, player state relay, chat, and WebRTC signaling

## Multiplayer notes

Rooms are stored in memory on the Render instance and are capped for lightweight use. The client reconnects with exponential backoff.

Do not scale this backend across multiple instances unless you add shared room state (for example Redis). WebRTC voice uses a small full-mesh topology and is intended for small rooms.

## Security

Never commit `OPENROUTER_API_KEY` or any other secret. The frontend never receives the OpenRouter key.

## Scientific honesty

The neural controller is a compact LIF-style, biologically inspired game model. The game does not claim to simulate the complete FlyWire/BANC connectome.

## Project files

`backend/main.py` — FastAPI + WebSocket backend  
`game/main.js` — browser game and renderer  
`game/brain.worker.js` — compact neural simulation  
`game/multiplayer.js` — room/state client  
`game/voice.js` — WebRTC client  
`game/npc.js` — NPC planning client with fallback  
`game/ads.js` — optional ad/reward hook  
