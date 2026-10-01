const N = 18;
const NAMES = ['LL','LR','HUM','FL','FR','FLY','HOST','SIG','ESC','APP','SOC','AGG','FRZ','TL','TR','THR','ASC','DSC'];
const I = Object.fromEntries(NAMES.map((n,i)=>[n,i]));
const SYN = [
 ['LL','ESC',1.3],['LR','ESC',1.3],['LL','TR',1.2],['LR','TL',1.2],['FL','TL',.9],['FR','TR',.9],
 ['FL','APP',1],['FR','APP',1],['HUM','ESC',.5],['HUM','FRZ',.3],['HOST','ESC',.4],['HOST','AGG',.9],
 ['SIG','SOC',1],['SIG','ESC',.4],['FLY','SOC',.4],['ESC','APP',-1],['ESC','FRZ',-.6],['ESC','THR',1.2],
 ['ESC','ASC',.8],['APP','THR',.7],['SOC','THR',.4],['AGG','THR',.6],['FRZ','THR',-1.2],['ESC','AGG',-.3]
].map(([a,b,w])=>[I[a],I[b],w]);
const states=new Map();
function mk(id, p){ return {id, v:new Float32Array(N), a:new Float32Array(N), ext:new Float32Array(N), personality:p||{gain:1,threshold:1,aggression:1,social:1,food:1}}; }
function clamp(v,a,b){return v<a?a:v>b?b:v;}
function step(s){
 s.ext.fill(0);
 const x=s.input||{};
 s.ext[I.LL]=x.leftThreat||0;s.ext[I.LR]=x.rightThreat||0;s.ext[I.HUM]=x.human||0;s.ext[I.FL]=x.foodLeft||0;s.ext[I.FR]=x.foodRight||0;
 s.ext[I.FLY]=x.nearby||0;s.ext[I.HOST]=(x.hostile||0)*s.personality.aggression;s.ext[I.SIG]=(x.signal||0)*s.personality.social;
 s.ext[I.THR]=.45;s.ext[I.ASC]=x.ascend||0;s.ext[I.DSC]=x.descend||0;
 for(const [a,b,w] of SYN)s.ext[b]+=w*clamp(s.a[a]*3,0,1);
 for(let i=0;i<N;i++){
   s.v[i]=s.v[i]*.8+s.ext[i]*.45;
   const spike=s.v[i]>s.personality.threshold;
   if(spike)s.v[i]=0;
   s.a[i]=s.a[i]*.7+(spike?.3:0);
 }
 const a=s.a;return {turn:clamp((a[I.TR]-a[I.TL])*1.8,-1,1),thrust:clamp(a[I.THR]*2,-1,1),up:clamp(a[I.ASC]-a[I.DSC],-1,1),escape:clamp(a[I.ESC]*1.4,0,1),attack:clamp(a[I.AGG]*1.3,0,1),social:clamp(a[I.SOC]*1.3,0,1),approach:clamp(a[I.APP]*1.2,0,1),freeze:clamp(a[I.FRZ]*1.3,0,1),activity:Array.from(a)};
}
self.onmessage=({data})=>{
 if(data.type==='reset'){states.clear();return;}
 if(data.type==='ensure'){for(const f of data.flies||[]){if(!states.has(f.id))states.set(f.id,mk(f.id,f.personality));}return;}
 if(data.type==='tick'){
   const out=[];for(const f of data.flies||[]){let s=states.get(f.id);if(!s){s=mk(f.id,f.personality);states.set(f.id,s);}s.personality=f.personality||s.personality;s.input=f.input||{};s.FRX=0;for(let i=0;i<2;i++){}const m=step(s);out.push({id:f.id,...m,signal:(m.escape>.78?'RUN':m.escape>.5?'DANGER':m.attack>.55?'ATTACK':m.social>.55?'ASSEMBLE':m.approach>.55?'FOOD':m.freeze>.55?'HIDE':'EXPLORE')});}
   self.postMessage({type:'brain',out});
 }
};
