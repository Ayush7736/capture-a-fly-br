export class VoiceChat {
  constructor(mp, onStatus=()=>{}){this.mp=mp;this.onStatus=onStatus;this.local=null;this.calls=new Map();this.enabled=false;}
  async enable(){
    if(this.enabled)return true;
    try{this.local=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});this.enabled=true;this.onStatus('MIC ON');
      for(const p of this.mp.peers.values())this.callPeer(p.id,true);return true;
    }catch(e){this.onStatus(e?.name==='NotAllowedError'?'MIC PERMISSION DENIED':'MIC UNAVAILABLE');return false;}
  }
  disable(){this.enabled=false;this.local?.getTracks().forEach(t=>t.stop());this.local=null;for(const pc of this.calls.values())pc.close();this.calls.clear();this.onStatus('MIC OFF');}
  async callPeer(peerId,offer=false){
    if(this.calls.has(peerId))return this.calls.get(peerId);
    const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});this.calls.set(peerId,pc);
    if(this.local)this.local.getTracks().forEach(t=>pc.addTrack(t,this.local));
    pc.onicecandidate=e=>{if(e.candidate)this.mp.voice(peerId,{kind:'ice',candidate:e.candidate});};
    pc.ontrack=e=>{let a=document.getElementById('audio-'+peerId);if(!a){a=document.createElement('audio');a.id='audio-'+peerId;a.autoplay=true;a.playsInline=true;document.body.appendChild(a);}a.srcObject=e.streams[0];};
    pc.onconnectionstatechange=()=>{if(['failed','closed','disconnected'].includes(pc.connectionState)){pc.close();this.calls.delete(peerId);}};
    if(offer){const d=this.mp.peers.get(peerId);if(this.mp.id<peerId){const o=await pc.createOffer();await pc.setLocalDescription(o);this.mp.voice(peerId,{kind:'offer',sdp:o});}}
    return pc;
  }
  async handle(msg){const from=msg.from,p=msg.payload||{};if(!from)return;const pc=await this.callPeer(from,false);
    if(p.kind==='offer'){await pc.setRemoteDescription(p.sdp);const a=await pc.createAnswer();await pc.setLocalDescription(a);this.mp.voice(from,{kind:'answer',sdp:a});}
    else if(p.kind==='answer'){await pc.setRemoteDescription(p.sdp);}
    else if(p.kind==='ice'&&p.candidate){try{await pc.addIceCandidate(p.candidate)}catch{}}
  }
  onPeerJoined(id){if(this.enabled)this.callPeer(id,true);}
  onPeerLeft(id){const pc=this.calls.get(id);pc?.close();this.calls.delete(id);document.getElementById('audio-'+id)?.remove();}
}
