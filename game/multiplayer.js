export class Multiplayer {
  constructor({onEvent,onStatus}){
    this.onEvent=onEvent||(()=>{});this.onStatus=onStatus||(()=>{});
    this.ws=null;this.room='';this.id='';this.name='';this.peers=new Map();this.connected=false;this.lastSend=0;this.reconnect=0;this.manualClose=false;
  }
  wsUrl(){
    const base=(window.FLYMIND_RENDER_URL||localStorage.getItem('fm_render_url')||'').trim();
    const u=base || (location.hostname.endsWith('onrender.com') ? location.origin : '');
    if(!u)return '';
    return u.replace(/^http:/,'ws:').replace(/^https:/,'wss:').replace(/\/$/,'')+'/ws';
  }
  connect(room,name){
    this.disconnect();this.manualClose=false;
    const url=this.wsUrl(); if(!url){this.onStatus('MULTIPLAYER URL NOT SET');return false;}
    this.room=room.toUpperCase();this.name=name;this.id=crypto.randomUUID();
    const ws=new WebSocket(url);this.ws=ws;
    ws.onopen=()=>{this.connected=true;this.reconnect=0;this.send({type:'join',room:this.room,id:this.id,name:this.name});this.onStatus('ONLINE • ROOM '+this.room);};
    ws.onmessage=e=>this.handle(e.data);ws.onerror=()=>this.onStatus('CONNECTION ERROR');
    ws.onclose=()=>{this.connected=false;this.onStatus('MULTIPLAYER OFFLINE');this.onEvent({type:'disconnected'});if(!this.manualClose && this.reconnect<6){const delay=Math.min(1000*Math.pow(2,this.reconnect),15000);this.reconnect++;setTimeout(()=>this.connect(this.room,this.name),delay);}};
    return true;
  }
  handle(raw){let m;try{m=JSON.parse(raw)}catch{return}
    if(m.type==='welcome'){for(const p of m.peers||[])if(p.id!==this.id)this.peers.set(p.id,{...p,state:null});this.onEvent(m);return;}
    if(m.type==='peer-joined'){this.peers.set(m.peer.id,{...m.peer,state:null});this.onEvent(m);return;}
    if(m.type==='peer-left'){this.peers.delete(m.id);this.onEvent(m);return;}
    if(m.type==='state'){const p=this.peers.get(m.from)||{id:m.from,name:'Fly',state:null};p.state=m.state;this.peers.set(m.from,p);this.onEvent({type:'remote-state',peer:p});return;}
    if(m.type==='signal'||m.type==='voice'||m.type==='chat'){this.onEvent(m);return;}
    if(m.type==='pong')return;
    if(m.type==='error')this.onStatus(m.message||'ROOM ERROR');
  }
  send(m){if(this.ws?.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify(m));}
  state(s,now){if(now-this.lastSend<100)return;this.lastSend=now;this.send({type:'state',state:s});}
  signal(to,payload){this.send({type:'signal',to,payload});}
  voice(to,payload){this.send({type:'voice',to,payload});}
  chat(text){this.send({type:'chat',text:String(text).slice(0,160)});}
  disconnect(){this.manualClose=true;try{this.ws?.close()}catch{}this.ws=null;this.peers.clear();this.connected=false;}
}
