"""FLYMIND backend.

Render hosts:
- FastAPI health/save APIs
- WebSocket room coordination
- WebRTC voice signaling
- Optional OpenRouter NPC proxy (server-side key)

The game simulation and voice media stay in players' browsers.
"""
from __future__ import annotations
import asyncio
import json
import os
import pathlib
import re
import time
from dataclasses import dataclass
from typing import Any
import httpx
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE = pathlib.Path(__file__).resolve().parent.parent
SAVE = BASE / "save.json"
MAX_ROOMS = int(os.getenv("FLYMIND_MAX_ROOMS", "200"))
MAX_PLAYERS = int(os.getenv("FLYMIND_MAX_PLAYERS", "8"))
NAME_RE = re.compile(r"[^A-Za-z0-9 _-]")
ROOM_RE = re.compile(r"^[A-Z0-9-]{3,12}$")
INTENTS = {"TRACK_FLY","APPROACH_FLY","WAIT_FOR_LANDING","SWING_NET","SEARCH_AREA","MOVE_AROUND_OBSTACLE","RETREAT","CHANGE_POSITION"}

app = FastAPI(title="flymind-multiplayer", version="1.1.0")
origins = [x.strip() for x in os.getenv("FLYMIND_ORIGINS", "*").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins if origins != ["*"] else ["*"], allow_credentials=False, allow_methods=["*"], allow_headers=["*"])

@dataclass
class Peer:
    pid: str
    name: str
    ws: WebSocket

class Room:
    def __init__(self, code: str):
        self.code = code
        self.peers: dict[str, Peer] = {}
        self.lock = asyncio.Lock()
        self.created_at = time.time()
    async def add(self, peer: Peer) -> bool:
        async with self.lock:
            if len(self.peers) >= MAX_PLAYERS and peer.pid not in self.peers: return False
            self.peers[peer.pid] = peer; return True
    async def remove(self, pid: str) -> None:
        async with self.lock: self.peers.pop(pid, None)
    async def snapshot(self) -> list[dict[str, str]]:
        async with self.lock: return [{"id": p.pid, "name": p.name} for p in self.peers.values()]
    async def send_all(self, payload: dict[str, Any], exclude: str | None = None) -> None:
        data = json.dumps(payload, separators=(",", ":"))
        async with self.lock: targets = [p for pid,p in self.peers.items() if pid != exclude]
        if not targets: return
        results = await asyncio.gather(*(p.ws.send_text(data) for p in targets), return_exceptions=True)
        for p,result in zip(targets,results):
            if isinstance(result,Exception): await self.remove(p.pid)
    async def send_one(self, pid: str, payload: dict[str, Any]) -> None:
        async with self.lock: target=self.peers.get(pid)
        if not target:return
        try: await target.ws.send_text(json.dumps(payload,separators=(",",":")))
        except Exception: await self.remove(pid)

rooms: dict[str, Room] = {}
rooms_lock = asyncio.Lock()
npc_rate: dict[str, tuple[float,int]] = {}

async def get_or_create_room(code: str) -> Room | None:
    async with rooms_lock:
        room=rooms.get(code)
        if room:return room
        if len(rooms)>=MAX_ROOMS:return None
        room=Room(code);rooms[code]=room;return room

async def cleanup_room(code: str) -> None:
    async with rooms_lock:
        room=rooms.get(code)
        if room and not room.peers: rooms.pop(code,None)

class BestScore(BaseModel): t: float = 0
class NPCRequest(BaseModel):
    humanState: dict[str,Any] = {}
    target: dict[str,Any] = {}
    visibleFlies: list[dict[str,Any]] = []

def num(v: Any, lo: float, hi: float, default: float=0.0) -> float:
    try:
        x=float(v)
        if x!=x or x in (float("inf"),float("-inf")): return default
        return min(hi,max(lo,x))
    except Exception:return default

def npc_fallback(body: NPCRequest) -> dict[str,Any]:
    h,t=body.humanState,body.target
    x1,z1=num(t.get("x"),-500,500),num(t.get("z"),-500,500)
    x2,z2=num(h.get("x"),-500,500),num(h.get("z"),-500,500)
    d=((x1-x2)**2+(z1-z2)**2)**0.5
    intent="APPROACH_FLY" if d>95 else ("SWING_NET" if t.get("landed") or num(h.get("wait"),0,9)>=2 else "WAIT_FOR_LANDING")
    if num(h.get("miss"),0,99)>=2 and d<90:intent="CHANGE_POSITION"
    return {"intent":intent,"targetFly":int(num(t.get("id"),0,9999)),"action":"TRACK","duration":1.5,"thought":"I will try another angle.","source":"local"}

@app.get("/api/health")
async def health(): return {"ok":True,"rooms":len(rooms),"maxPlayers":MAX_PLAYERS,"websocket":"/ws"}

@app.get("/api/best")
async def get_best():
    if not SAVE.exists(): return {"best":0.0}
    try:return json.loads(SAVE.read_text(encoding="utf-8"))
    except (OSError,ValueError):return {"best":0.0}

@app.post("/api/best")
async def post_best(score: BestScore):
    current=(await get_best()).get("best",0.0)
    value=max(float(current),min(max(float(score.t),0.0),10_000_000.0))
    SAVE.write_text(json.dumps({"best":value}),encoding="utf-8")
    return {"ok":True}

@app.post("/api/npc")
async def npc_proxy(body: NPCRequest, request: Request):
    ip=request.headers.get("x-forwarded-for",request.client.host if request.client else "unknown").split(",")[0].strip()
    now=time.time();window_start,count=npc_rate.get(ip,(now,0))
    if now-window_start>=60:window_start,count=now,0
    count+=1;npc_rate[ip]=(window_start,count)
    if count>30:return npc_fallback(body)
    key,model=os.getenv("OPENROUTER_API_KEY"),os.getenv("OPENROUTER_MODEL")
    if not key or not model:return npc_fallback(body)
    safe_target={"id":int(num(body.target.get("id"),0,9999)),"x":num(body.target.get("x"),-500,500),"y":num(body.target.get("y"),0,100),"z":num(body.target.get("z"),-500,500),"speed":num(body.target.get("speed"),0,100),"landed":bool(body.target.get("landed"))}
    safe_human={"x":num(body.humanState.get("x"),-500,500),"z":num(body.humanState.get("z"),-500,500),"miss":num(body.humanState.get("miss"),0,99),"wait":num(body.humanState.get("wait"),0,9)}
    prompt={"human":safe_human,"target":safe_target,"nearbyFlies":body.visibleFlies[:12]}
    try:
        async with httpx.AsyncClient(timeout=2.5) as client:
            r=await client.post("https://openrouter.ai/api/v1/chat/completions",headers={"Authorization":f"Bearer {key}","Content-Type":"application/json"},json={"model":model,"max_tokens":120,"temperature":0.35,"response_format":{"type":"json_object"},"messages":[{"role":"system","content":"Control a clumsy human hunting a fly with a net. Reply ONLY JSON with intent, duration, thought. Intent must be one of TRACK_FLY, APPROACH_FLY, WAIT_FOR_LANDING, SWING_NET, SEARCH_AREA, MOVE_AROUND_OBSTACLE, RETREAT, CHANGE_POSITION. Duration must be 0.5-3. Thought under 70 characters."},{"role":"user","content":json.dumps(prompt,separators=(",",":"))}]})
            r.raise_for_status();data=r.json();content=data["choices"][0]["message"]["content"];obj=json.loads(content)
            if obj.get("intent") not in INTENTS:raise ValueError("bad intent")
            thought=re.sub(r"[^\w .,'!?-]","",str(obj.get("thought","")))[:70]
            return {"intent":obj["intent"],"targetFly":safe_target["id"],"action":"TRACK","duration":num(obj.get("duration"),0.5,3,1.5),"thought":thought,"source":"openrouter"}
    except Exception:return npc_fallback(body)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept();room=None;peer=None
    try:
        hello=json.loads(await websocket.receive_text())
        if hello.get("type")!="join":
            await websocket.send_json({"type":"error","message":"First message must be join."});await websocket.close(code=1008);return
        code=str(hello.get("room","")).strip().upper();pid=str(hello.get("id","")).strip()[:40];name=NAME_RE.sub("",str(hello.get("name","Fly")).strip())[:16] or "Fly"
        if not ROOM_RE.fullmatch(code) or not pid:
            await websocket.send_json({"type":"error","message":"Invalid room or player id."});await websocket.close(code=1008);return
        room=await get_or_create_room(code)
        newpeer=Peer(pid,name,websocket)
        if room is None or not await room.add(newpeer):
            await websocket.send_json({"type":"error","message":"Room is full."});await websocket.close(code=1013);return
        peer=newpeer
        peers=[p for p in await room.snapshot() if p["id"]!=pid]
        await websocket.send_json({"type":"welcome","room":code,"self":{"id":pid,"name":name},"peers":peers,"count":len(peers)+1})
        print(f"FLYMIND JOIN room={code} name={name} count={len(peers)+1}",flush=True)
        await room.send_all({"type":"peer-joined","peer":{"id":pid,"name":name},"count":len(peers)+1},exclude=pid)
        while True:
            msg=json.loads(await websocket.receive_text());typ=msg.get("type")
            if typ=="ping":await websocket.send_json({"type":"pong","t":time.time()});continue
            if typ=="state":await room.send_all({"type":"state","from":pid,"state":msg.get("state",{})},exclude=pid);continue
            if typ in {"signal","voice"}:
                to=str(msg.get("to",""))
                if to and to!=pid:await room.send_one(to,{**msg,"from":pid})
                continue
            if typ=="chat":await room.send_all({"type":"chat","from":pid,"text":str(msg.get("text",""))[:160]},exclude=pid);continue
            if typ=="leave":break
    except (WebSocketDisconnect,json.JSONDecodeError):pass
    except Exception:
        try:await websocket.close(code=1011)
        except Exception:pass
    finally:
        if room and peer:
            await room.remove(peer.pid)
            print(f"FLYMIND LEAVE room={room.code} name={peer.name} count={len(room.peers)}",flush=True)
            await room.send_all({"type":"peer-left","id":peer.pid,"count":len(room.peers)},exclude=peer.pid)
            await cleanup_room(room.code)

@app.get("/manifest.webmanifest")
async def manifest():return FileResponse(BASE/"manifest.webmanifest")
@app.get("/robots.txt")
async def robots():return FileResponse(BASE/"robots.txt")
@app.get("/sitemap.xml")
async def sitemap():return FileResponse(BASE/"sitemap.xml")
@app.get("/")
async def index():return FileResponse(BASE/"index.html")

# Serve browser game modules from Render. API/WebSocket routes above remain explicit.
app.mount('/game', StaticFiles(directory=BASE / 'game'), name='game')
