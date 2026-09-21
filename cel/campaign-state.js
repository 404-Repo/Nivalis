// Chapter checkpoints are deliberate: retries retain each chapter's original balance.
export const CHAPTERS = [
  {key:'compound',title:'COMPOUND',subtitle:'INFILTRATE',number:'01'},
  {key:'lower',title:'LOWER STATION',subtitle:'SUBSURFACE',number:'02'},
  {key:'warden',title:'WARDEN',subtitle:'RECKONING',number:'03'}
];
export const DEFAULTS = {muted:false,music:.7,ambience:.58,breathing:.45,motion:true,reducedFlashing:false,sensitivity:1,quality:'balanced',fog:'atmospheric',navigation:false};
export function cleanSettings(value={}) {
  const out={...DEFAULTS};
  for(const key of ['muted','motion','reducedFlashing','navigation'])if(typeof value[key]==='boolean')out[key]=value[key];
  for(const key of ['music','ambience','breathing'])if(Number.isFinite(value[key]))out[key]=Math.min(1,Math.max(0,value[key]));
  if(Number.isFinite(value.sensitivity))out.sensitivity=Math.min(2,Math.max(.4,value.sensitivity));
  if(['low','balanced','high'].includes(value.quality))out.quality=value.quality;
  if(['light','atmospheric','dense'].includes(value.fog))out.fog=value.fog;
  return out;
}
export function cleanProgress(value) {
  if(!value||value.version!==1||!Number.isInteger(value.chapter)||value.chapter<0||value.chapter>2)return null;
  return {version:1,chapter:value.chapter,complete:value.complete===true&&value.chapter===2,reports:Array.from({length:3},(_,i)=>typeof value.reports?.[i]==='string'?value.reports[i].slice(0,8000):''),updated:typeof value.updated==='string'?value.updated:''};
}
export function advanceProgress(progress,index,report,now=new Date().toISOString()) {
  if(!progress||progress.complete||index!==progress.chapter)throw new Error('Out-of-order chapter completion');
  const reports=[...progress.reports];reports[index]=typeof report==='string'?report.slice(0,8000):'';
  return {version:1,chapter:Math.min(2,index+1),complete:index===2,reports,updated:now};
}
export function newProgress(){return {version:1,chapter:0,complete:false,reports:['','',''],updated:new Date().toISOString()};}
