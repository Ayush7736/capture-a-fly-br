// Vercel serverless OpenRouter proxy. Never expose OPENROUTER_API_KEY in frontend code.
const INTENTS = ['TRACK_FLY','APPROACH_FLY','WAIT_FOR_LANDING','SWING_NET','SEARCH_AREA','MOVE_AROUND_OBSTACLE','RETREAT','CHANGE_POSITION'];
const num=(v,a,b,d=0)=>{v=Number(v);return Number.isFinite(v)?Math.min(b,Math.max(a,v)):d};
const cleanThought=v=>String(v??'').replace(/[^\w .,'!?-]/g,'').slice(0,70);
const rate=new Map();
function fallback(t,h){const d=Math.hypot(t.x-h.x,t.z-h.z);let intent=d>95?'APPROACH_FLY':(t.landed||h.wait>=2?'SWING_NET':'WAIT_FOR_LANDING');if(h.miss>=2&&d<90)intent='CHANGE_POSITION';return{intent,targetFly:t.id,action:'TRACK',duration:1.5,thought:'',source:'local'};}
function validBody(b){
  const H=b?.humanState||{}, G=b?.target||{};
  const h={x:num(H.x,-500,500),z:num(H.z,-500,500),miss:num(H.miss,0,99),wait:num(H.wait,0,9)};
  const t={id:num(G.id,0,9999),x:num(G.x,-500,500),y:num(G.y,0,100),z:num(G.z,-500,500),speed:num(G.speed,0,100),landed:!!G.landed};
  const visible=Array.isArray(b?.visibleFlies)?b.visibleFlies.slice(0,12).map((o)=>({id:num(o?.id,0,9999),x:num(o?.x,-500,500),z:num(o?.z,-500,500)})):[];
  return {h,t,visible};
}
module.exports=async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin', process.env.ALLOW_ORIGIN||'*');
 res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
 res.setHeader('Access-Control-Allow-Headers','Content-Type');
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 const {h,t,visible}=validBody(req.body||{}), fb=fallback(t,h);
 const ip=String(req.headers?.['x-forwarded-for']||req.headers?.['x-real-ip']||'unknown').split(',')[0].trim();
 const now=Date.now(), prev=rate.get(ip)||{at:now,n:0}; if(now-prev.at>60000){prev.at=now;prev.n=0;} prev.n++; rate.set(ip,prev); if(prev.n>30)return res.status(200).json(fb);
 const key=process.env.OPENROUTER_API_KEY, model=process.env.OPENROUTER_MODEL;
 if(!key||!model)return res.status(200).json(fb);
 try{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),2500);
  const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{
   method:'POST',signal:controller.signal,
   headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
   body:JSON.stringify({
    model,max_tokens:120,temperature:0.35,
    response_format:{type:'json_object'},
    messages:[
      {role:'system',content:`You control a clumsy human hunting a fly in a garden. Reply ONLY JSON with intent (${INTENTS.join('|')}), duration (0.5-3), thought (under 70 chars). Do not invent fields. Be imperfect and tactical.`},
      {role:'user',content:JSON.stringify({human:h,target:t,nearbyFlies:visible})}
    ]
   })
  });
  clearTimeout(timer);
  if(!r.ok)throw new Error('OpenRouter HTTP');
  const j=await r.json();const text=j?.choices?.[0]?.message?.content;
  const o=typeof text==='string'?JSON.parse(text):text;
  if(!o||!INTENTS.includes(o.intent))throw new Error('schema');
  return res.status(200).json({intent:o.intent,targetFly:t.id,action:'TRACK',duration:num(o.duration,.5,3,1.5),thought:cleanThought(o.thought),source:'openrouter'});
 }catch(e){return res.status(200).json(fb);}
};