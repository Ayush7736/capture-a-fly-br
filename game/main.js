import {BrainClient} from './brain.js?v=20261001-final';
import {Multiplayer} from './multiplayer.js?v=20261001-final';
import {VoiceChat} from './voice.js?v=20261001-final';
import {planHuman} from './npc.js?v=20261001-final';
import {showRewarded,rewardedCount,isAdFree,adConfig,maybeInterstitial} from './ads.js?v=20261001-final';

const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
canvas.width=320;canvas.height=180;
const W=320,H=180,TAU=Math.PI*2,R=Math.random,cl=(v,a,b)=>Math.max(a,Math.min(b,v));
let worldR=R;
function seedFromString(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry32(seed){return function(){let t=seed+=0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}

let playerName=localStorage.getItem('fm_name')||'';
let settings={mouse:+localStorage.getItem('fm_mouse')||5,touch:+localStorage.getItem('fm_touch')||5,vol:+localStorage.getItem('fm_vol')||5,crt:localStorage.getItem('fm_crt')!=='0',tts:localStorage.getItem('fm_tts')!=='0'};
let running=false,paused=false,last=performance.now(),time=0,best=+(localStorage.getItem('fm_best')||0),brainAcc=0;
let nectar=0,energy=80,hp=100,score=0,signal='EXPLORE',lastSpoken=0;
const keys=new Set();let pointerLocked=false,touch={x:0,y:0,active:false};
const brain=new BrainClient();
let flies=[],flowers=[],wasps=[],rocks=[];
let human={x:180,z:180,mode:'patrol',thought:'Searching...',target:null,miss:0,wait:0,hand:{x:190,y:55,z:180}};
let npcBusy=false,npcNext=0;
const mp=new Multiplayer({onEvent:onMP,onStatus:s=>setStatus(s)});const voice=new VoiceChat(mp,s=>setVoiceStatus(s));
const remote=new Map();let multiplayer=false;
const $=id=>document.getElementById(id);
function setStatus(s){$('mpStatus').textContent=s}
function setVoiceStatus(s){$('voiceStatus').textContent=s}
function setupMenu(){
 $('name').value=playerName;$('mouse').value=settings.mouse;$('touch').value=settings.touch;$('vol').value=settings.vol;$('crt').checked=settings.crt;$('tts').checked=settings.tts;
 $('play').onclick=()=>start(false);$('multi').onclick=()=>openMulti();$('closeMulti').onclick=closeMulti;$('join').onclick=joinMulti;$('create').onclick=()=>{$('room').value=randomRoom();joinMulti()};
 $('voiceOn').onclick=async()=>{if(!voice.enabled)await voice.enable();else voice.disable();$('voiceOn').textContent=voice.enabled?'MIC OFF':'MIC ON'};
 $('copyRoom').onclick=async()=>{try{await navigator.clipboard.writeText(mp.room)}catch{}};
 $('reward').onclick=async()=>{const r=await showRewarded();setAdStatus(r.ok?`REWARDED +${adConfig().coinsPerReward||100} • ${r.count}/10`:adReason(r.reason));}
 $('adSettings').onclick=()=>showPanel('adsPanel');$('settingsBtn').onclick=()=>showPanel('settingsPanel');$('saveRender').onclick=()=>{localStorage.setItem('fm_render_url',$('renderUrl').value.trim());hidePanels();};$('closeSettings').onclick=()=>hidePanels();$('hideMenu').onclick=()=>hidePanels();$('renderUrl').value=localStorage.getItem('fm_render_url')||window.FLYMIND_RENDER_URL;
 $('settings').addEventListener('change',()=>saveSettings());$('mouse').oninput=saveSettings;$('touch').oninput=saveSettings;$('vol').oninput=saveSettings;$('crt').oninput=saveSettings;$('tts').oninput=saveSettings;
 $('brain').onclick=()=>document.body.classList.toggle('brain-on');
 $('pause').onclick=()=>togglePause();
 $('pausePanel').innerHTML='<div class="box" style="text-align:center"><h2 class="title" style="font-size:42px">PAUSED</h2><p class="tiny">FLYMIND GARDEN</p><div class="menuBtns"><button class="btn primary" id="resumeGame">RESUME</button><button class="btn" id="switchMulti">SWITCH TO MULTIPLAYER</button><button class="btn" id="pauseMenu">MAIN MENU</button></div></div>';
 $('resumeGame').onclick=()=>togglePause();
 $('switchMulti').onclick=()=>{paused=false;hidePanels();openMulti();};
 $('pauseMenu').onclick=()=>{paused=false;running=false;mp.disconnect();voice.disable();hidePanels();$('menu').classList.remove('hidden');};

}
function saveSettings(){settings.mouse=+$('mouse').value;settings.touch=+$('touch').value;settings.vol=+$('vol').value;settings.crt=$('crt').checked;settings.tts=$('tts').checked;localStorage.setItem('fm_mouse',settings.mouse);localStorage.setItem('fm_touch',settings.touch);localStorage.setItem('fm_vol',settings.vol);localStorage.setItem('fm_crt',settings.crt?'1':'0');localStorage.setItem('fm_tts',settings.tts?'1':'0');applyCrt()}
function applyCrt(){$('stage').classList.toggle('crt',settings.crt)}
function randomRoom(){return 'FLY-'+Math.random().toString(36).slice(2,6).toUpperCase()}
function start(isMulti,roomCode=''){
 if(multiplayer && !isMulti){mp.disconnect();voice.disable();}
 playerName=($('name').value||'Fly').trim().slice(0,16)||'Fly';localStorage.setItem('fm_name',playerName);multiplayer=isMulti;setupWorld(roomCode);$('menu').classList.add('hidden');running=true;paused=false;last=performance.now();$('gameover').classList.add('hidden');requestAnimationFrame(loop);
 if(isMulti){$('roomPanel').classList.remove('hidden');setStatus('CONNECTING • ROOM '+roomCode);}else{$('roomPanel').classList.add('hidden');}
}
function openMulti(){$('multiModal').classList.remove('hidden');$('room').value=randomRoom();$('mpName').value=playerName}
function closeMulti(){$('multiModal').classList.add('hidden')}
function joinMulti(){
 const n=($('mpName').value||$('name').value||'Fly').trim().slice(0,16)||'Fly';
 const code=($('room').value||'').trim().toUpperCase();
 if(!/^[A-Z0-9-]{3,12}$/.test(code)){setStatus('ENTER A VALID ROOM CODE');return;}
 playerName=n;$('name').value=n;localStorage.setItem('fm_name',n);$('multiModal').classList.add('hidden');
 start(true,code);setTimeout(()=>mp.connect(code,n),60);
}
function setupWorld(roomCode=''){
 time=0;brainAcc=0;nectar=0;energy=100;hp=100;score=0;signal='EXPLORE';lastSpoken=0;
 worldR=multiplayer&&roomCode?mulberry32(seedFromString(roomCode)):R;
 const base=multiplayer&&roomCode?{x:-70,z:-70}: {x:0,z:0};
 human={x:multiplayer&&roomCode?65:190,z:multiplayer&&roomCode?65:190,mode:'patrol',thought:'Searching...',target:null,miss:0,wait:0,hand:{x:200,y:55,z:190}};
 flies=[makeFly(0,true)];flies[0].x=base.x;flies[0].z=base.z;flies[0].y=16;for(let i=1;i<15;i++)flies.push(makeFly(i,false));
 flowers=Array.from({length:34},()=>({x:worldR()*580-290,z:worldR()*580-290,h:12+worldR()*20,nectar:60+worldR()*40,c:worldR()}));
 wasps=Array.from({length:2},()=>({x:worldR()*500-250,z:worldR()*500-250,y:14,hp:100}));
 rocks=Array.from({length:90},()=>({x:worldR()*600-300,z:worldR()*600-300,r:2+worldR()*5}));
 brain.reset();brain.ensure(flies.map(f=>({id:f.id,personality:f.pers})));remote.clear();
}
function makeFly(id,isP){const p=[{name:'cautious',gain:1.4,threshold:.9,aggression:.3,social:1,food:1},{name:'aggressive',gain:1,threshold:1,aggression:2,social:.6,food:1},{name:'social',gain:1,threshold:1,aggression:.6,social:2,food:1},{name:'curious',gain:.9,threshold:1.05,aggression:.7,social:.8,food:1.3},{name:'forager',gain:1,threshold:1,aggression:.5,social:.8,food:1.7}][id%5];return{id,pers:p,x:worldR()*520-260,z:worldR()*520-260,y:8+worldR()*15,yaw:worldR()*TAU,vx:0,vz:0,vy:0,energy:70+worldR()*20,hp:100,nectar:0,signal:'EXPLORE',feeding:0,isP}}
function sense(f){let leftThreat=0,rightThreat=0,humanThreat=0,hostile=0,foodLeft=0,foodRight=0,nearby=0,signalStrength=0;const dx=human.hand.x-f.x,dz=human.hand.z-f.z,d=Math.hypot(dx,dz);if(d<110){const b=angleDiff(Math.atan2(dx,dz),f.yaw);const lm=cl(1-d/110,0,1)*(human.mode==='swing'?2:.35)*f.pers.gain;if(b>0)rightThreat+=lm;else leftThreat+=lm;humanThreat+=lm}
 for(const w of wasps)if(w.hp>0){const wd=Math.hypot(w.x-f.x,w.z-f.z);if(wd<80)hostile+=cl(1-wd/80,0,1)}
 let bestD=130,best=null;for(const fl of flowers){if(fl.nectar<=2)continue;const dd=Math.hypot(fl.x-f.x,fl.z-f.z);if(dd<bestD){bestD=dd;best=fl}}
 if(best){const b=angleDiff(Math.atan2(best.x-f.x,best.z-f.z),f.yaw);const v=cl(1-bestD/130,0,1)*f.pers.food*(1-f.energy/100);if(b>0)foodRight=v;else foodLeft=v}
 for(const o of flies){if(o!==f&&o.hp>0&&Math.hypot(o.x-f.x,o.z-f.z)<55){nearby++;signalStrength=Math.max(signalStrength,signalValue(o.signal))}}
 return{leftThreat,rightThreat,human:humanThreat,foodLeft,foodRight,nearby,hostile,signal:signalStrength,ascend:cl((10-f.y)/8,0,1)*.3,descend:cl((f.y-22)/8,0,1)*.3};
}
const signalValue=s=>({DANGER:.8,RUN:1,ASSEMBLE:.6,ATTACK:.7,HELP:.8}[s]||0);const angleDiff=(a,b)=>{let d=a-b;while(d>Math.PI)d-=TAU;while(d<-Math.PI)d+=TAU;return d};
function neuralStep(dt){const inp=flies.map(f=>({id:f.id,personality:f.pers,input:sense(f)}));brain.tick(inp);for(const f of flies){const o=brain.get(f.id);f.brain=o;f.signal=o.escape>.78?'RUN':o.escape>.5?'DANGER':o.attack>.55?'ATTACK':o.social>.55?'ASSEMBLE':o.approach>.55?'FOOD':o.freeze>.55?'HIDE':'EXPLORE';if(f.isP&&f.signal!==signal){signal=f.signal;speak(signal)}}}
function speak(s){if(!settings.tts||!speechSynthesis||time-lastSpoken<3)return;const words={RUN:'Run!',DANGER:'Danger.',ASSEMBLE:'Assemble.',ATTACK:'Attack!',FOOD:'Nectar.',HIDE:'Hide.',HELP:'Help!'};if(!words[s])return;lastSpoken=time;const u=new SpeechSynthesisUtterance(words[s]);u.rate=1.05;u.pitch=.65;speechSynthesis.speak(u)}
function update(dt){
 if(!running||paused)return;time+=dt;energy-=dt*.45;if(energy<=0){energy=0;hp-=dt*2}if(hp<=0){gameOver();return}
 brainAcc+=dt;if(brainAcc>=0.05){brainAcc=0;neuralStep(dt);}
 const p=flies[0];const o=p.brain||{};let turn=o.turn||0,thrust=o.thrust||.45;if(keys.has('KeyA'))turn-=1;if(keys.has('KeyD'))turn+=1;if(keys.has('KeyW'))thrust+=.8;if(keys.has('KeyS'))thrust-=.5;if(touch.active){turn+=touch.x*1.2;thrust+=-touch.y*.9}
 p.yaw+=cl(turn,-1,1)*2.9*dt;p.vx=Math.sin(p.yaw)*thrust*26;p.vz=Math.cos(p.yaw)*thrust*26;p.vy=(keys.has('Space')?18:0)+(keys.has('ShiftLeft')?-18:0)+(o.up||0)*8;p.x+=p.vx*dt;p.z+=p.vz*dt;p.y=cl(p.y+p.vy*dt,1,42);p.x=cl(p.x,-290,290);p.z=cl(p.z,-290,290);p.energy=energy;p.hp=hp;
 if(keys.has('KeyE'))feed(p,dt);
 for(const f of flies.slice(1)){const b=f.brain||{};f.yaw+=cl(b.turn||0,-1,1)*2.3*dt;const speed=cl((b.thrust||.4)*21,-15,24);f.x+=Math.sin(f.yaw)*speed*dt;f.z+=Math.cos(f.yaw)*speed*dt;f.y=cl(f.y+(b.up||0)*7*dt,1,34);if(Math.hypot(f.x,f.z)>290)f.yaw+=Math.PI;f.energy-=dt*.55;if(f.energy<25)for(const fl of flowers)if(fl.nectar>2&&Math.hypot(fl.x-f.x,fl.z-f.z)<10){f.energy=Math.min(100,f.energy+dt*12);fl.nectar=Math.max(0,fl.nectar-dt*6);}}
 updateWasps(dt);updateHuman(dt);if(multiplayer)syncMultiplayer();flowers.forEach(fl=>fl.nectar=Math.min(100,fl.nectar+dt*1.5));
 energy=Math.min(100,energy+((p.feeding||0)?dt*5:0));hp=Math.min(100,hp+((energy>60)?dt*.15:0));updateHUD();
}
function feed(p,dt){let best=null,bd=14;for(const fl of flowers){const d=Math.hypot(fl.x-p.x,fl.z-p.z);if(d<bd&&fl.nectar>2){bd=d;best=fl}}if(best){p.feeding=1;const got=Math.min(best.nectar,dt*10);best.nectar-=got;nectar+=got;energy=Math.min(100,energy+got*.5);score+=got*.5}else p.feeding=0}
function updateWasps(dt){for(const w of wasps){if(w.hp<=0)continue;const d=Math.hypot(w.x-flies[0].x,w.z-flies[0].z);if(d<90){const a=Math.atan2(flies[0].x-w.x,flies[0].z-w.z);w.x+=Math.sin(a)*12*dt;w.z+=Math.cos(a)*12*dt;if(d<8&&flies[0].brain?.attack>.65)w.hp-=dt*24;else if(d<8)hp-=dt*10}else{w.x+=Math.sin(time*.6+w.x)*3*dt;w.z+=Math.cos(time*.5+w.z)*3*dt}}}
async function updateHuman(dt){human.hand.x=human.x+10;human.hand.z=human.z;human.hand.y=55;if(time<npcNext||npcBusy)return;npcNext=time+.8;let target=flies.filter(f=>f.hp>0).sort((a,b)=>Math.hypot(a.x-human.x,a.z-human.z)-Math.hypot(b.x-human.x,b.z-human.z))[0];if(!target)return;human.target=target;const body={humanState:{st:human.mode,miss:human.miss,wait:human.wait,x:human.x|0,z:human.z|0},target:{id:target.id,x:target.x|0,y:target.y|0,z:target.z|0,speed:Math.hypot(target.vx,target.vz)|0,landed:target.y<4},visibleFlies:flies.slice(0,8).map(o=>({id:o.id,x:o.x|0,z:o.z|0}))};npcBusy=true;const j=await planHuman(body);npcBusy=false;human.thought=String(j.thought||j.intent).slice(0,48);applyHuman(j,target)}
function applyHuman(j,t){const d=Math.hypot(t.x-human.x,t.z-human.z);if(j.intent==='SWING_NET'&&d<90){human.mode='swing';human.hand.x=t.x+t.vx*.25;human.hand.z=t.z+t.vz*.25;setTimeout(()=>{const hit=Math.hypot(t.x-human.hand.x,t.z-human.hand.z)<18&&t.y<18;if(hit){t.hp=0;if(t.isP){hp=0;}human.thought='Got one!'}else{human.miss++;human.thought='Missed. Try again.'}human.mode='patrol'},500)}else if(j.intent==='RETREAT'){human.mode='patrol';human.x-=Math.sin(t.yaw)*20;human.z-=Math.cos(t.yaw)*20}else{human.mode='approach';const a=Math.atan2(t.x-human.x,t.z-human.z);human.x+=Math.sin(a)*10*.8;human.z+=Math.cos(a)*10*.8;}}
function gameOver(){running=false;best=Math.max(best,time);localStorage.setItem('fm_best',best);const base=(window.FLYMIND_RENDER_URL||localStorage.getItem('fm_render_url')||'').trim().replace(/\/$/,'');fetch((base?base+'/api/best':'/api/best'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({t:time})}).catch(()=>{});$('gameover').classList.remove('hidden');$('overStats').textContent=`SURVIVED ${time|0}s  •  NECTAR ${nectar|0}  •  BEST ${best|0}s`;maybeInterstitial()}
function syncMultiplayer(){const p=flies[0],now=performance.now();mp.state({name:playerName,x:p.x,y:p.y,z:p.z,yaw:p.yaw,signal:p.signal,hp:p.hp},now)}
function onMP(m){if(m.type==='welcome'){for(const p of mp.peers.values())voice.onPeerJoined(p.id)}else if(m.type==='peer-joined')voice.onPeerJoined(m.peer.id);else if(m.type==='peer-left'){remote.delete(m.id);voice.onPeerLeft(m.id)}else if(m.type==='remote-state')remote.set(m.peer.id,m.peer.state);else if(m.type==='voice')voice.handle(m);else if(m.type==='chat')addChat(m.text,m.from);updatePlayersUI()}
function updatePlayersUI(){
 const peers=Array.from(mp.peers.values()).map(p=>({name:p.name}));
 $('players').textContent=[{name:playerName,me:true},...peers].map(x=>x.me?'◆ '+x.name:'• '+x.name).join('\n')||'SOLO';
 if(multiplayer)setStatus(mp.connected?`ONLINE • ${peers.length+1}/8 PLAYERS • ROOM ${mp.room}`:`CONNECTING • ROOM ${mp.room||'...'}`);
}
function addChat(text,from){const x=document.createElement('div');x.textContent=`${from||'FLY'}: ${text}`;$('chat').appendChild(x);while($('chat').children.length>5)$('chat').firstChild.remove()}
function updateHUD(){$('hud').textContent=`${playerName}\nNECTAR ${nectar|0}   ENERGY ${energy|0}   HP ${hp|0}\nSIGNAL ${signal}\nNEARBY ${flies.filter(f=>f.id&&Math.hypot(f.x-flies[0].x,f.z-flies[0].z)<65).length}\nSURVIVED ${time|0}s   BEST ${best|0}s\n${multiplayer?'ROOM '+mp.room:'FIND NECTAR • AVOID THE NET'}`;$('brainStatus').textContent=`${signal}  |  brain worker 20Hz`;}
function project(x,y,z){const p=flies[0],dx=x-p.x,dz=z-p.z,ca=Math.cos(p.yaw),sa=Math.sin(p.yaw),depth=dx*sa+dz*ca;if(depth<2)return null;const side=dx*ca-dz*sa;const s=150/depth;return{x:W/2+side*s,y:H*.46-(y-p.y)*s,s,depth}}
function draw(){
 ctx.clearRect(0,0,W,H);
 const p=flies[0]||{x:0,y:10,z:0,yaw:0};
 drawSky(p);
 drawWorldDepth(p);

 const items=[];
 for(const r of rocks){const q=project(r.x,0,r.z);if(q&&q.depth<340)items.push({q,type:'rock',r});}
 for(const fl of flowers){const q=project(fl.x,fl.h,fl.z);if(q&&q.depth<320)items.push({q,type:'flower',fl});}
 for(const f of flies.slice(1)){const q=project(f.x,f.y,f.z);if(q&&q.depth<320)items.push({q,type:'fly',f});}
 for(const [id,state] of remote){if(state&&Number.isFinite(+state.x)&&Number.isFinite(+state.y)&&Number.isFinite(+state.z)){const q=project(+state.x,+state.y,+state.z);if(q&&q.depth<340)items.push({q,type:'remote',state,id});}}
 for(const w of wasps){if(w.hp>0){const q=project(w.x,w.y,w.z);if(q&&q.depth<320)items.push({q,type:'wasp',w});}}
 items.sort((a,b)=>b.q.depth-a.q.depth);

 for(const it of items)drawEntity(it);
 drawHumanThreat();
 drawPlayerBody();
 drawEffects();
 if(document.body.classList.contains('brain-on'))drawBrain();
 if(!running&&!$('gameover').classList.contains('hidden')){} 
}

function drawSky(p){
 const g=ctx.createLinearGradient(0,0,0,H);
 g.addColorStop(0,'#07101b');g.addColorStop(.34,'#123b2a');g.addColorStop(.55,'#3d6a2e');g.addColorStop(1,'#132812');
 ctx.fillStyle=g;ctx.fillRect(0,0,W,H);

 // pixel sun + atmospheric haze
 const sx=252+Math.sin(time*.015)*2,sy=28;
 const rg=ctx.createRadialGradient(sx,sy,2,sx,sy,32);
 rg.addColorStop(0,'rgba(255,239,151,.55)');rg.addColorStop(1,'rgba(255,220,100,0)');
 ctx.fillStyle=rg;ctx.fillRect(sx-32,sy-32,64,64);
 ctx.fillStyle='#ffe98a';ctx.fillRect(sx-5,sy-5,10,10);

 // distant garden silhouettes with parallax
 for(let layer=0;layer<3;layer++){
   const y=74+layer*7, drift=(p.x*(.025+layer*.018))%W;
   ctx.fillStyle=layer===0?'#102b25':layer===1?'#183a25':'#1e4823';
   for(let i=-1;i<12;i++){
     const x=i*31-drift;
     const h=7+(i*13+layer*11)%15;
     ctx.fillRect(x,y-h,5,h);
     ctx.fillRect(x-5,y-h+4,15,4);
   }
 }
 // soft horizon
 const haze=ctx.createLinearGradient(0,68,0,103);
 haze.addColorStop(0,'rgba(110,160,100,0)');haze.addColorStop(1,'rgba(120,165,100,.22)');
 ctx.fillStyle=haze;ctx.fillRect(0,65,W,40);
}

function drawWorldDepth(p){
 // ground
 const g=ctx.createLinearGradient(0,88,0,H);
 g.addColorStop(0,'#315c28');g.addColorStop(.5,'#21471f');g.addColorStop(1,'#0d2413');
 ctx.fillStyle=g;ctx.fillRect(0,88,W,H-88);

 // perspective furrows / speed of depth
 ctx.strokeStyle='rgba(105,154,76,.20)';
 ctx.lineWidth=1;
 for(let i=-8;i<=8;i++){
   const bx=W/2+i*20;
   ctx.beginPath();ctx.moveTo(W/2,90);ctx.lineTo(bx*1.9-160,H);ctx.stroke();
 }
 for(let i=0;i<13;i++){
   const yy=91+i*i*0.62;
   ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(W,yy);ctx.stroke();
 }

 // foreground grass tufts
 for(let i=0;i<95;i++){
   const x=(i*73+p.x*.17)%W,y=96+(i*29)%82;
   ctx.strokeStyle=i%4===0?'#5f963d':'#356c30';
   ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-2-(i%3),y-4-(i%6));ctx.stroke();
 }
}

function drawEntity(it){
 const q=it.q;
 if(it.type==='rock'){
   const s=Math.max(2,q.s*it.r.r);
   ctx.fillStyle='#182b1c';ctx.fillRect(q.x-s*.55,q.y-s*.18,s*1.1,s*.38);
   ctx.fillStyle='#3f5e3b';ctx.fillRect(q.x-s*.38,q.y-s*.42,s*.76,s*.25);
   ctx.fillStyle='#66815a';ctx.fillRect(q.x-s*.16,q.y-s*.43,s*.3,s*.08);
 } else if(it.type==='flower'){
   const s=Math.max(1,q.s);
   const stem=Math.max(2,s*it.fl.h*.38);
   ctx.fillStyle='#326b31';ctx.fillRect(q.x|0,(q.y+2)|0,Math.max(1,s*.55),stem);
   const c=['#ff557d','#ff9fca','#9ec8ff','#ffd45c'][Math.abs((it.fl.x|0)+(it.fl.z|0))&3];
   const bloom=it.fl.nectar>2;
   if(bloom){
     ctx.fillStyle='rgba(255,230,130,.12)';ctx.fillRect(q.x-s*3,q.y-s*3,s*6,s*6);
     ctx.fillStyle=c;
     for(let k=0;k<6;k++){const a=k*TAU/6;ctx.fillRect((q.x+Math.cos(a)*s*1.7)|0,(q.y+Math.sin(a)*s*1.7)|0,Math.max(2,s*1.7),Math.max(2,s*1.7));}
     ctx.fillStyle='#ffe98a';ctx.fillRect((q.x-s*.6)|0,(q.y-s*.6)|0,Math.max(2,s*1.2),Math.max(2,s*1.2));
   }else{ctx.fillStyle='#45554a';ctx.fillRect(q.x-s,q.y-s,s*2,s*2);}
 } else if(it.type==='fly'){
   drawFly(q,it.f);
 } else {
   drawWasp(q,it.w);
 }
}

function drawFly(q,f){
 const s=Math.max(2,2.8*q.s), flap=Math.sin(time*28+f.id)*s*.22;
 ctx.save();ctx.translate(q.x,q.y);
 ctx.fillStyle='rgba(210,245,255,.48)';
 ctx.fillRect(-s*1.35,-s*.72+flap,s*.9,s*.28);
 ctx.fillRect(s*.45,-s*.72-flap,s*.9,s*.28);
 ctx.fillStyle='#172027';ctx.fillRect(-s*.55,-s*.35,s*1.1,s*.72);
 ctx.fillStyle='#5e7890';ctx.fillRect(-s*.25,-s*.18,s*.5,s*.35);
 ctx.fillStyle='#d9f5ff';ctx.fillRect(-s*.45,-s*.38,s*.22,s*.18);ctx.fillRect(s*.23,-s*.38,s*.22,s*.18);
 ctx.restore();
}

function drawWasp(q,w){
 const s=Math.max(2,5.4*q.s),bob=Math.sin(time*8+w.x)*s*.12;
 ctx.save();ctx.translate(q.x,q.y+bob);
 ctx.fillStyle='rgba(225,245,255,.52)';ctx.fillRect(-s*.95,-s*.85,s*.65,s*.3);ctx.fillRect(s*.3,-s*.85,s*.65,s*.3);
 ctx.fillStyle='#f6c52e';ctx.fillRect(-s*.5,-s*.45,s,s*.75);
 ctx.fillStyle='#171717';ctx.fillRect(-s*.18,-s*.45,s*.25,s*.75);
 ctx.fillRect(s*.18,-s*.45,s*.25,s*.75);
 ctx.fillStyle='#151515';ctx.fillRect(-s*.62,-s*.2,s*.2,s*.2);
 ctx.restore();
}

function drawHumanThreat(){
 const h=human.hand,q=project(h.x,h.y,h.z);
 if(!q)return;
 const s=Math.max(3,11*q.s);
 ctx.save();ctx.translate(q.x,q.y);
 ctx.strokeStyle='rgba(255,170,130,.18)';ctx.lineWidth=Math.max(2,4*q.s);
 ctx.beginPath();ctx.moveTo(0,-H);ctx.lineTo(0,0);ctx.stroke();
 ctx.fillStyle='rgba(214,161,127,.28)';ctx.fillRect(-s*.7,-s*.7,s*1.4,s*1.2);
 ctx.fillStyle='#d7a17e';ctx.fillRect(-s*.5,-s*.55,s,s*.85);
 // fingers
 for(let i=-2;i<=2;i++)ctx.fillRect(i*s*.22,-s*1.05,s*.15,s*.55);
 if(human.mode==='swing'){
   ctx.strokeStyle='rgba(245,245,245,.85)';ctx.lineWidth=Math.max(1,1.5*q.s);
   ctx.beginPath();ctx.arc(0,0,s*2.1,0,TAU);ctx.stroke();
 }
 ctx.restore();
}

function drawPlayerBody(){
 // the player's head/body silhouette anchors the first-person view
 ctx.fillStyle='rgba(5,8,10,.92)';
 ctx.beginPath();ctx.moveTo(W/2-7,H);ctx.lineTo(W/2-4,H-17);ctx.lineTo(W/2,H-20);ctx.lineTo(W/2+4,H-17);ctx.lineTo(W/2+7,H);ctx.fill();
 ctx.fillStyle='rgba(190,235,245,.42)';
 ctx.fillRect(W/2-18,H-8,11,3);ctx.fillRect(W/2+7,H-8,11,3);
 // reticle
 ctx.strokeStyle='rgba(220,255,205,.45)';ctx.lineWidth=1;
 ctx.beginPath();ctx.moveTo(W/2-4,H*.49);ctx.lineTo(W/2+4,H*.49);ctx.moveTo(W/2,H*.49-3);ctx.lineTo(W/2,H*.49+3);ctx.stroke();
}

function drawEffects(){
 const speed=Math.hypot(flies[0]?.vx||0,flies[0]?.vz||0);
 if(speed>18){
   const amount=Math.min(12,Math.floor((speed-18)/2)+3);
   ctx.strokeStyle='rgba(190,240,200,.22)';
   for(let i=0;i<amount;i++){
     const x=(i*47+time*120)%W,y=100+(i*19)%65;
     ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+7+speed*.08,y);ctx.stroke();
   }
 }
 // vignette
 const v=ctx.createRadialGradient(W/2,H*.48,35,W/2,H*.48,190);
 v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,.48)');
 ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
 // low-res scanline texture
 ctx.fillStyle='rgba(255,255,255,.025)';
 for(let y=0;y<H;y+=3)ctx.fillRect(0,y,W,1);
}
function drawBrain(){ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(2,H-82,90,78);ctx.fillStyle='#fff';ctx.font='6px monospace';ctx.fillText('LIF BRAIN / WORKER',4,H-75);const b=flies[0].brain||{};['escape','attack','social','approach','freeze'].forEach((n,i)=>{ctx.fillText(n.toUpperCase(),4,H-65+i*10);ctx.fillStyle='#5f8';ctx.fillRect(35,H-69+i*10,45*cl(b[n]||0,0,1),5);ctx.fillStyle='#fff'});}
function drawTitleHint(){ctx.fillStyle='#fff';ctx.font='7px monospace';ctx.fillText('CLICK PLAY • SURVIVE • FIND NECTAR • ESCAPE THE HAND',4,H-4)}
function loop(now){const dt=Math.min(.05,(now-last)/1000);last=now;update(dt);draw();if(running)requestAnimationFrame(loop);}
function togglePause(){
 if(!running)return;
 paused=!paused;
 $('pause').textContent=paused?'RESUME':'PAUSE';
 $('pausePanel').classList.toggle('hidden',!paused);
}
function hidePanels(){document.querySelectorAll('.panel').forEach(x=>x.classList.add('hidden'))}
function showPanel(id){hidePanels();$(id).classList.remove('hidden')}
function setAdStatus(t){$('adStatus').textContent=t}
function adReason(r){return({DAILY_LIMIT:'10 REWARDED ADS USED TODAY',NOT_CONFIGURED:'REWARDED ADS NOT CONFIGURED',NOT_COMPLETED:'AD NOT COMPLETED',FAILED:'AD FAILED'})[r]||'NO REWARD'}
window.addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='Escape')togglePause();});window.addEventListener('keyup',e=>keys.delete(e.code));
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointerLocked=true;});canvas.addEventListener('pointermove',e=>{if(!running)return;if(e.buttons){flies[0].yaw+=e.movementX*.0025*settings.mouse}});canvas.addEventListener('pointerup',()=>pointerLocked=false);
let joyEl=$('joy');joyEl.addEventListener('pointerdown',e=>{touch.active=true;joyEl.setPointerCapture(e.pointerId);});joyEl.addEventListener('pointermove',e=>{if(!touch.active)return;const r=joyEl.getBoundingClientRect();touch.x=cl((e.clientX-(r.left+r.width/2))/(r.width*.45),-1,1);touch.y=cl((e.clientY-(r.top+r.height/2))/(r.height*.45),-1,1)});['pointerup','pointercancel'].forEach(k=>joyEl.addEventListener(k,()=>{touch.active=false;touch.x=touch.y=0}));
$('tAttack').onclick=()=>{$('attack').click()};$('tEat').onclick=()=>{$('eat').click()};$('tUp').onpointerdown=()=>keys.add('Space');$('tUp').onpointerup=()=>keys.delete('Space');$('tDown').onpointerdown=()=>keys.add('ShiftLeft');$('tDown').onpointerup=()=>keys.delete('ShiftLeft');
$('attack').onclick=()=>{for(const w of wasps){if(w.hp>0&&Math.hypot(w.x-flies[0].x,w.z-flies[0].z)<25)w.hp-=30;}}
$('eat').onclick=()=>feed(flies[0],.35);
$('restart').onclick=()=>{$('gameover').classList.add('hidden');start(multiplayer)};
$('toMenu').onclick=()=>{$('gameover').classList.add('hidden');running=false;mp.disconnect();voice.disable();$('menu').classList.remove('hidden')};
$('chatSend').onclick=()=>{const t=$('chatInput').value.trim();if(t){addChat(t,playerName);if(mp.connected)mp.chat(t);$('chatInput').value=''}};
setupMenu();applyCrt();updatePlayersUI();setAdStatus(`REWARDED ${rewardedCount()}/10 • ${isAdFree()?'AD-FREE TODAY':'ADS ENABLED'}`);setInterval(()=>{if(mp.connected)mp.send({type:'ping'})},20000);
