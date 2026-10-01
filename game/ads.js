// Optional Google H5 Games Ads adapter. It stays inert until publisher ID / approval is configured.
const KEY='flymind_ads_v1';
function today(){return new Date().toISOString().slice(0,10)}
function read(){try{const x=JSON.parse(localStorage.getItem(KEY)||'{}');return x.day===today()?x:{day:today(),rewarded:0,adFree:false,coins:0}}catch{return{day:today(),rewarded:0,adFree:false,coins:0}}}
function write(x){localStorage.setItem(KEY,JSON.stringify(x));return x}
export function adConfig(){return window.FLYMIND_ADS||{publisherId:'',test:false,maxRewardedPerDay:10,coinsPerReward:100}}
export function rewardedCount(){return read().rewarded}
export function isAdFree(){return read().adFree}
export async function showRewarded(){
 const cfg=adConfig();const s=read();if(s.rewarded>=Math.min(cfg.maxRewardedPerDay||10,10))return{ok:false,reason:'DAILY_LIMIT'};
 if(typeof window.adBreak!=='function'||!cfg.publisherId)return{ok:false,reason:'NOT_CONFIGURED'};
 return await new Promise(resolve=>{
   let completed=false;
   try{window.adBreak({type:'reward',name:'daily-coins',beforeReward:show=>show(),adViewed:()=>{completed=true;const n=read();n.rewarded++;n.coins+=(cfg.coinsPerReward||100);if(n.rewarded>=10)n.adFree=true;write(n);resolve({ok:true,coins:n.coins,count:n.rewarded})},adBreakDone:()=>{if(!completed)resolve({ok:false,reason:'NOT_COMPLETED'})}})}catch{resolve({ok:false,reason:'FAILED'})}
 })
}
export async function maybeInterstitial(){if(isAdFree()||typeof window.adBreak!=='function')return false;try{window.adBreak({type:'next',name:'natural-break'});return true}catch{return false}}
