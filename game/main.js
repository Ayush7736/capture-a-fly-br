import {BrainClient} from './brain.js';
import {Multiplayer} from './multiplayer.js';
import {VoiceChat} from './voice.js';
import {planHuman} from './npc.js';
import {showRewarded,rewardedCount,isAdFree,adConfig,maybeInterstitial} from './ads.js';

const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
canvas.width=320;canvas.height=180;
const W=320,H=180,TAU=Math.PI*2,R=Math.random,cl=(v,a,b)=>Math.max(a,Math.min(b,v));
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
function start(isMulti){
 if(multiplayer && !isMulti){mp.disconnect();voice.disable();}
 playerName=($('name').value||'Fly').trim().slice(0,16)||'Fly';localStorage.setItem('fm_name',playerName);multiplayer=isMulti;setupWorld();$('menu').classList.add('hidden');running=true;paused=false;last=performance.now();requestAnimationFrame(loop);
 if(isMulti){$('roomPanel').classList.remove('hidden');}else{$('roomPanel').classList.add('hidden');}
}
function openMulti(){$('multiModal').classList.remove('hidden');$('room').value=randomRoom();$('mpName').value=playerName}
function closeMulti(){$('multiModal').classList.add('hidden')}
function joinMulti(){
 const n=($('mpName').value||$('name').value||'Fly').trim().slice(0,16)||'Fly';const code=($('room').value||randomRoom()).trim().toUpperCase();playerName=n;$('name').value=n;localStorage.setItem('fm_name',n);$('multiModal').classList.add('hidden');start(true);setTimeout(()=>mp.connect(code,n),60);
}
function setupWorld(){
 time=0;brainAcc=0;nectar=0;energy=100;hp=100;score=0;signal='EXPLORE';lastSpoken=0;human={x:190,z:190,mode:'patrol',thought:'Searching...',target:null,miss:0,wait:0,hand:{x:200,y:55,z:190}};
 flies=[makeFly(0,true)];for(let i=1;i<15;i++)flies.push(makeFly(i,false));flowers=Array.from({length:34},()=>({x:R()*580-290,z:R()*580-290,h:12+R()*20,nectar:60+R()*40,c:R()}));wasps=Array.from({length:2},()=>({x:R()*500-250,z:R()*500-250,y:14,hp:100}));rocks=Array.from({length:90},()=>({x:R()*600-300,z:R()*600-300,r:2+R()*5}));brain.reset();brain.ensure(flies.map(f=>({id:f.id,personality:f.pers})));remote.clear();
}
function makeFly(id,isP){const p=[{name:'cautious',gain:1.4,threshold:.9,aggression:.3,social:1,food:1},{name:'aggressive',gain:1,threshold:1,aggression:2,social:.6,food:1},{name:'social',gain:1,threshold:1,aggression:.6,social:2,food:1},{name:'curious',gain:.9,threshold:1.05,aggression:.7,social:.8,food:1.3},{name:'forager',gain:1,threshold:1,aggression:.5,social:.8,food:1.7}][id%5];return{id,pers:p,x:R()*520-260,z:R()*520-260,y:8+R()*15,yaw:R()*TAU,vx:0,vz:0,vy:0,energy:70+R()*20,hp:100,nectar:0,signal:'EXPLORE',feeding:0,isP}}
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
function applyHuman(j,t){const d=Math.hypot(t.x-human.x,t.z-human.z);if(j.intent==='SWING_NET'&&d<90){human.mode='swing';human.hand.x=t.x+t.vx*.25;human.hand.z=t.z+t.vz*.25;setTimeout(()=>{const hit=Math.hypot(t.x-human.hand.x,t.z-human.hand.z)<18&&t.y<18;if(hit){t.hp=0;human.thought='Got one!'}else{human.miss++;human.thought='Missed. Try again.'}human.mode='patrol'},500)}else if(j.intent==='RETREAT'){human.mode='patrol';human.x-=Math.sin(t.yaw)*20;human.z-=Math.cos(t.yaw)*20}else{human.mode='approach';const a=Math.atan2(t.x-human.x,t.z-human.z);human.x+=Math.sin(a)*10*.8;human.z+=Math.cos(a)*10*.8;}}
function gameOver(){running=false;best=Math.max(best,time);localStorage.setItem('fm_best',best);fetch('/api/best',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({t:time})}).catch(()=>{});$('gameover').classList.remove('hidden');$('overStats').textContent=`SURVIVED ${time|0}s  •  NECTAR ${nectar|0}  •  BEST ${best|0}s`;maybeInterstitial()}
function syncMultiplayer(){const p=flies[0],now=performance.now();mp.state({name:playerName,x:p.x,y:p.y,z:p.z,yaw:p.yaw,signal:p.signal,hp:p.hp},now)}
function onMP(m){if(m.type==='welcome'){for(const p of mp.peers.values())voice.onPeerJoined(p.id)}else if(m.type==='peer-joined')voice.onPeerJoined(m.peer.id);else if(m.type==='peer-left'){remote.delete(m.id);voice.onPeerLeft(m.id)}else if(m.type==='remote-state')remote.set(m.peer.id,m.peer.state);else if(m.type==='voice')voice.handle(m);else if(m.type==='chat')addChat(m.text,m.from);updatePlayersUI()}
function updatePlayersUI(){$('players').textContent=[{name:playerName,me:true},...Array.from(mp.peers.values()).map(p=>({name:p.name}))].map(x=>x.me?'◆ '+x.name:'• '+x.name).join('\n')||'SOLO'}
function addChat(text,from){const x=document.createElement('div');x.textContent=`${from||'FLY'}: ${text}`;$('chat').appendChild(x);while($('chat').children.length>5)$('chat').firstChild.remove()}
function updateHUD(){$('hud').textContent=`${playerName}\nNECTAR ${nectar|0}   ENERGY ${energy|0}   HP ${hp|0}\nSIGNAL ${signal}\nNEARBY ${flies.filter(f=>f.id&&Math.hypot(f.x-flies[0].x,f.z-flies[0].z)<65).length}\nSURVIVED ${time|0}s   BEST ${best|0}s`;$('brainStatus').textContent=`${signal}  |  brain worker 20Hz`;}
function project(x,y,z){const p=flies[0],dx=x-p.x,dz=z-p.z,ca=Math.cos(p.yaw),sa=Math.sin(p.yaw),depth=dx*sa+dz*ca;if(depth<2)return null;const side=dx*ca-dz*sa;const s=150/depth;return{x:W/2+side*s,y:H*.46-(y-p.y)*s,s,depth}}
function draw(){
 ctx.clearRect(0,0,W,H);
 const p=flies[0]||{x:0,y:10,z:0,yaw:0};
 const sky=ctx.createLinearGradient(0,0,0,H);
 sky.addColorStop(0,'#02070d');sky.addColorStop(.45,'#0b2818');sky.addColorStop(1,'#1d3d18');
 ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
 ctx.fillStyle='rgba(255,220,100,.16)';ctx.beginPath();ctx.arc(255,30,22,0,TAU);ctx.fill();
 ctx.fillStyle='#f5d85c';ctx.fillRect(249,24,12,12);
 ctx.fillStyle='#102817';
 for(let i=0;i<18;i++){const x=(i*37+13)%W,h=8+(i*17)%18;ctx.fillRect(x,88-h,8,h);ctx.fillRect(x-4,88-h+4,16,6);}
 for(let y=88;y<H;y+=8){const t=(y-88)/(H-88);ctx.fillStyle=t<.45?'#1b431d':'#173517';ctx.fillRect(0,y,W,8);}
 ctx.strokeStyle='#2d6a2d';ctx.lineWidth=1;
 for(let i=0;i<95;i++){const x=(i*73+Math.floor(p.x*.17))%W;const y=91+(i*29)%89;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-2-(i%3),y-4-(i%5));ctx.stroke();}
 const items=[];
 for(const r of rocks){const q=project(r.x,0,r.z);if(q&&q.depth<320)items.push({q,type:'rock',r});}
 for(const fl of flowers){const q=project(fl.x,fl.h,fl.z);if(q&&q.depth<300)items.push({q,type:'flower',fl});}
 for(const f of flies.slice(1)){const q=project(f.x,f.y,f.z);if(q)items.push({q,type:'fly',f});}
 for(const w of wasps){if(w.hp>0){const q=project(w.x,w.y,w.z);if(q)items.push({q,type:'wasp',w});}}
 items.sort((a,b)=>b.q.depth-a.q.depth);
 for(const it of items){
   const q=it.q;
   if(it.type==='rock'){
     const s=Math.max(1,q.s*it.r.r);ctx.fillStyle='#273c29';ctx.fillRect(q.x-s/2,q.y-s*.35,s,s*.35);
     ctx.fillStyle='#496247';ctx.fillRect(q.x-s*.3,q.y-s*.5,s*.6,s*.15);
   } else if(it.type==='flower'){
     const s=Math.max(1,q.s);ctx.fillStyle='#2e7132';ctx.fillRect(q.x|0,q.y|0,Math.max(1,s*.7),Math.max(1,s*it.fl.h*.38));
     const bloom=it.fl.nectar>2;ctx.fillStyle=bloom?['#f05','#f7c','#9cf','#fd5'][((it.fl.x|0)+(it.fl.z|0))&3]:'#666';
     ctx.fillRect((q.x-s*2)|0,(q.y-s*2)|0,Math.max(2,s*4),Math.max(2,s*4));
     if(bloom){ctx.fillStyle='#ffe98a';ctx.fillRect((q.x-s*.45)|0,(q.y-s*.45)|0,Math.max(1,s),Math.max(1,s));}
   } else if(it.type==='fly'){
     const s=Math.max(1,2.4*q.s);ctx.fillStyle='#6aa9ff';ctx.fillRect(q.x-s/2,q.y-s/3,s,s*.55);
     ctx.fillStyle='rgba(210,240,255,.7)';ctx.fillRect(q.x-s,q.y-s*.8,s*.7,s*.35);ctx.fillRect(q.x+s*.3,q.y-s*.8,s*.7,s*.35);
   } else {
     const s=Math.max(2,5*q.s);ctx.fillStyle='#ffd42a';ctx.fillRect(q.x-s/2,q.y-s/3,s,s*.65);
     ctx.fillStyle='#111';ctx.fillRect(q.x-s*.15,q.y-s/3,s*.3,s*.65);
     ctx.fillStyle='rgba(220,245,255,.65)';ctx.fillRect(q.x-s*.7,q.y-s*.7,s*.55,s*.25);ctx.fillRect(q.x+s*.15,q.y-s*.7,s*.55,s*.25);
   }
 }
 const h=human.hand,q=project(h.x,h.y,h.z);
 if(q){const s=Math.max(2,10*q.s);ctx.strokeStyle='rgba(210,170,145,.75)';ctx.lineWidth=Math.max(1,2*q.s);
   ctx.beginPath();ctx.moveTo(W/2,0);ctx.lineTo(q.x,q.y);ctx.stroke();ctx.fillStyle='#d6a17f';ctx.fillRect(q.x-s/2,q.y-s/2,s,s/1.4);
   if(human.mode==='swing'){ctx.strokeStyle='#ddd';ctx.beginPath();ctx.arc(q.x,q.y,s*1.5,0,TAU);ctx.stroke();}
 }
 ctx.fillStyle='rgba(10,10,12,.85)';ctx.fillRect(W/2-5,H-12,10,8);
 ctx.fillStyle='rgba(180,220,235,.45)';ctx.fillRect(W/2-16,H-8,10,4);ctx.fillRect(W/2+6,H-8,10,4);
 if(Math.abs(flies[0]?.vx||0)+Math.abs(flies[0]?.vz||0)>22){ctx.strokeStyle='rgba(180,240,190,.25)';for(let i=0;i<7;i++){const x=(i*53+time*90)%W;ctx.beginPath();ctx.moveTo(x,H-25-i*8);ctx.lineTo(x+9,H-25-i*8);ctx.stroke();}}
 if(document.body.classList.contains('brain-on'))drawBrain();
 if(!running&&$('gameover').classList.contains('hidden'))drawTitleHint();
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
