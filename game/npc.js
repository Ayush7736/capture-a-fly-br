export async function planHuman(body, endpoint='/api/npc') {
  try {
    const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),2600);
    const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:ctrl.signal});clearTimeout(t);
    if(!r.ok)throw new Error('npc http');return await r.json();
  }catch{return localPlan(body.target,body.humanState);}
}
function localPlan(t,h){const d=Math.hypot((t?.x||0)-(h?.x||0),(t?.z||0)-(h?.z||0));let intent=d>95?'APPROACH_FLY':(t?.landed||h?.wait>=2?'SWING_NET':'WAIT_FOR_LANDING');if((h?.miss||0)>=2&&d<90)intent='CHANGE_POSITION';return{intent,targetFly:t?.id||0,action:'TRACK',duration:1.5,thought:'I will try another angle.',source:'local'};}
