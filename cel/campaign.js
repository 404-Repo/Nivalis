import {CHAPTERS,DEFAULTS,cleanSettings,cleanProgress,advanceProgress,newProgress} from './campaign-state.js';
import {CassetteDrone} from './title-audio.js';
const $=id=>document.getElementById(id),stage=$('stage');
const KEYS={progress:'nivalis.cel.campaign.progress.v1',settings:'nivalis.cel.campaign.settings.v1',mementos:'nivalis.cel.campaign.mementos.v1'};
let storage=true;
function read(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{storage=false;$('storage-warning').hidden=false;}}
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let settings=cleanSettings(read(KEYS.settings)||{...DEFAULTS,motion:!reduced,reducedFlashing:reduced});
let progress=cleanProgress(read(KEYS.progress)),mementos=read(KEYS.mementos)||{version:1,unlocked:{}};
let phase='title',index=0,frame=null,adapter=null,loadId=0,pending=null,lastLoad={index:0,play:false},captionTimer,captionHide,unlocking=false,locking=false,transitionAudio=null;
let titleAudio=null;
function syncMenuAudio(){
 $('title-sound').textContent=settings.muted?'SOUND OFF':'SOUND ON';
 $('title-sound').setAttribute('aria-pressed',String(!settings.muted));
 const audible=['title','paused'].includes(phase)&&!document.hidden&&!settings.muted&&settings.music>0;
 if(!audible){titleAudio?.pause().catch(()=>{});return;}
 try{
  if(!titleAudio){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;titleAudio=new CassetteDrone(new C());const context=titleAudio.ctx;context.onstatechange=()=>{$('title-sound').dataset.audioState=context.state;};$('title-sound').dataset.audioState=context.state;}
  // Try autoplay immediately. A blocked context is retried on the next real input.
  titleAudio.resume(settings.music*58).catch(()=>{});
 }catch{$('title-sound').textContent='SOUND UNAVAILABLE';}
}
function pauseTitleAudio(){titleAudio?.pause().catch(()=>{});}
function unlockMenuAudio(event){if(event.isTrusted&&titleAudio?.ctx.state!=='running')syncMenuAudio();}
function listenForAudioUnlock(target){for(const type of ['pointerdown','pointerup','keydown'])target.addEventListener(type,unlockMenuAudio,{capture:true});}
listenForAudioUnlock(document);
const documents=new Map(),requests=new Map();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function valid(source){return frame?.contentWindow===source;}
function saveProgress(){write(KEYS.progress,progress);refreshTitle();}
function refreshTitle(){
 const resumable=progress&&!progress.complete;
 $('continue').hidden=!resumable;
 $('continue').disabled=!adapter;
 $('start').textContent=progress?'NEW OPERATION':'START';
 $('start').disabled=!adapter;
 $('checkpoint-note').textContent=resumable?`CHECKPOINT / ${CHAPTERS[progress.chapter].title}`:progress?.complete?'OPERATION COMPLETE':'';
}
async function chapterDocument(key){
 if(documents.has(key))return documents.get(key);
 if(!requests.has(key))requests.set(key,(async()=>{
  const embedded=window.__CHAPTERS__?.[key];
  const base=document.documentElement.dataset.chapterBase||'./chapters/';
  const html=embedded?new TextDecoder().decode(Uint8Array.from(atob(embedded),c=>c.charCodeAt(0))):await fetch(`${base}${key}.html?v=20260921-cel1`).then(r=>{if(!r.ok)throw new Error(`Chapter download failed (${r.status}).`);return r.text();});
  if(!html.includes('data-nivalis-chapter="'+key+'"'))throw new Error('The chapter file is incomplete.');
  documents.set(key,html);return html;
 })().finally(()=>requests.delete(key)));
 return requests.get(key);
}
function unlock(){unlocking=true;if(document.pointerLockElement)document.exitPointerLock();setTimeout(()=>{unlocking=false;},100);}
function lock(fromMenu=false){
 if(locking||document.pointerLockElement===stage||matchMedia('(pointer:coarse)').matches||(!fromMenu&&phase!=='playing'))return;
 locking=true;
 try{const request=stage.requestPointerLock();request?.catch(()=>{}).finally(()=>{locking=false;});}catch{locking=false;}
}

function endTransitionAudio(){transitionAudio?.close().catch(()=>{});transitionAudio=null;}
function startTransitionAudio(up){
 if(settings.muted)return;
 try{
  const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
  transitionAudio=new C();const c=transitionAudio,g=c.createGain();g.gain.value=.04*settings.ambience;g.connect(c.destination);
  const o=c.createOscillator();o.type='triangle';o.frequency.value=up?43:51;o.connect(g);o.start();
  // Preserve the ascent's fast single bass pulse while the next scene initializes.
  if(up){const l=c.createOscillator(),depth=c.createGain();l.frequency.value=4;depth.gain.value=.025*settings.ambience;l.connect(depth).connect(g.gain);l.start();}
  c.resume().catch(()=>{});
 }catch{}
}
function disposeChapter(){adapter?.dispose();adapter=null;frame?.remove();frame=null;}
function veil(show,label='',detail=''){$('veil').classList.remove('fading');$('veil').hidden=!show;$('travel-label').textContent=label;$('travel-detail').textContent=detail;}
function hideCaption(){clearTimeout(captionTimer);clearTimeout(captionHide);$('chapter-caption').hidden=true;}
function showCaption(){hideCaption();const c=CHAPTERS[index];$('caption-number').textContent=`CHAPTER ${c.number} / ${c.subtitle}`;$('caption-title').textContent=c.title;$('chapter-caption').style.opacity='1';$('chapter-caption').hidden=false;captionTimer=setTimeout(()=>{$('chapter-caption').style.opacity='0';captionHide=setTimeout(hideCaption,1000);},4500);}
function beginPlay({capture=false,caption=true}={}){
 pauseTitleAudio();
 phase='playing';$('title').hidden=true;$('final').hidden=true;document.body.dataset.chapter=CHAPTERS[index].key;
 adapter.applySettings(settings);adapter.start();frame.contentWindow.focus();if(capture)lock();if(caption)showCaption();
}
async function loadChapter(target,{play=false,transition=false}={}){
 const token=++loadId;lastLoad={index:target,play};hideCaption();
 if(pending){clearTimeout(pending.timer);pending.reject(new Error('Load superseded'));pending=null;}
 phase=play?'loading':'title';$('start').disabled=$('continue').disabled=true;
 if(play)pauseTitleAudio();else syncMenuAudio();
 if(transition)veil(true,target===1?'DESCENDING':'ASCENDING',target===1?'SERVICE LIFT / B1':'SERVICE LIFT / SURFACE');
 else if(play)veil(true,'RECONNECTING',CHAPTERS[target].title);
 try{
  const html=await chapterDocument(CHAPTERS[target].key);if(token!==loadId)return;
  // Only one Three.js scene and audio graph remain alive at any time.
  disposeChapter();index=target;
  frame=document.createElement('iframe');frame.name='nivalis-campaign';frame.title=CHAPTERS[target].title;frame.setAttribute('allow','autoplay; fullscreen');
  const loaded=new Promise((resolve,reject)=>{pending={token,resolve,reject,timer:setTimeout(()=>reject(new Error('The scene did not initialize. Check WebGL support and retry.')),45000)};});
  frame.srcdoc=html;stage.append(frame);await loaded;if(token!==loadId)return;
  listenForAudioUnlock(frame.contentDocument);
  clearTimeout(pending.timer);pending=null;
  if(play){beginPlay({capture:true,caption:!transition});if(transition){await sleep(220);if(token!==loadId)return;showCaption();}$('veil').classList.add('fading');await sleep(settings.motion?800:80);if(token!==loadId)return;veil(false);endTransitionAudio();}
  else {veil(false);document.body.dataset.chapter='compound';refreshTitle();}
 }catch(error){
  if(token!==loadId)return;clearTimeout(pending?.timer);pending=null;adapter?.pause();phase='error';syncMenuAudio();unlock();endTransitionAudio();$('error-detail').textContent=error.message+' YOUR CHAPTER CHECKPOINT IS SAFE.';if(!$('load-error').open)$('load-error').showModal();
 }
}
async function goTitle(){
 unlock();endTransitionAudio();hideCaption();$('final').hidden=true;$('title').hidden=false;
 for(const d of document.querySelectorAll('dialog'))if(d.open)d.close();
 adapter?.pause();await loadChapter(0);$('continue').hidden?$('start').focus():$('continue').focus();
}
async function newGame(){
 $('new-game').close();progress=newProgress();saveProgress();
 if(index===0&&adapter){beginPlay({capture:true});}else{lock(true);await loadChapter(0,{play:true});}
}
function openSettings(){
 if(phase==='playing')adapter?.pause();
 for(const input of document.querySelectorAll('[data-setting]')){const value=settings[input.dataset.setting];if(input.type==='checkbox')input.checked=value;else input.value=value;}
 if(!$('settings').open)$('settings').showModal();
}
function setSettings(){
 const value={};for(const input of document.querySelectorAll('[data-setting]'))value[input.dataset.setting]=input.type==='checkbox'?input.checked:input.type==='range'?Number(input.value):input.value;
 settings=cleanSettings(value);write(KEYS.settings,settings);adapter?.applySettings(settings);
 syncMenuAudio();
}
function showFinal(){
 phase='complete';syncMenuAudio();unlock();hideCaption();endTransitionAudio();$('final').hidden=false;$('title').hidden=true;veil(false);$('main-menu').focus();
}
window.__NIVALIS_CAMPAIGN__={
 getSettings:()=>({...settings}),
 canLook(source){return valid(source)&&phase==='playing'&&!document.pointerLockElement&&!document.querySelector('dialog[open]');},
 mementos(source,value){if(!valid(source))return null;if(value){mementos=value;write(KEYS.mementos,mementos);}return JSON.parse(JSON.stringify(mementos));},
 ready(source,api){if(!valid(source)||!pending)return;adapter=api;adapter.applySettings(settings);pending.resolve();},
 prepare(source){if(valid(source)&&index<2)chapterDocument(CHAPTERS[index+1].key).catch(()=>{});},
 complete(source,{report=''}){
  if(!valid(source)||phase!=='playing'||!progress||progress.chapter!==index)return;
  progress=advanceProgress(progress,index,report);saveProgress();
  if(index===2){showFinal();return;}
  const next=index+1;startTransitionAudio(next===2);loadChapter(next,{play:true,transition:true});
 },
 failed(source){if(valid(source)){phase='failed';syncMenuAudio();unlock();hideCaption();}},
 playing(source){if(valid(source)){phase='playing';syncMenuAudio();frame.contentWindow.focus();}},
 paused(source){if(valid(source)&&phase==='playing'){phase='paused';syncMenuAudio();unlock();}},
 release(source){if(valid(source))unlock();},
 lock(source){if(valid(source)){phase='playing';syncMenuAudio();lock();}},
 title(source){if(valid(source))goTitle();},
 settings(source){if(valid(source))openSettings();}
};
// Keep mouse capture on the campaign document, so changing chapters needs no click.
document.addEventListener('pointerlockerror',()=>{locking=false;});
document.addEventListener('pointerlockchange',()=>{locking=false;if(!document.pointerLockElement&&!unlocking&&phase==='playing'){adapter?.pause();}});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement===stage&&phase==='playing')adapter?.look(e.movementX,e.movementY);});
for(const type of ['mousedown','mouseup'])document.addEventListener(type,e=>{if(document.pointerLockElement===stage&&phase==='playing'){adapter?.mouse(e.button,type==='mousedown');e.preventDefault();}});
document.addEventListener('contextmenu',e=>{if(document.pointerLockElement===stage)e.preventDefault();});
for(const type of ['keydown','keyup'])document.addEventListener(type,e=>{
 if(document.querySelector('dialog[open]')||!['playing','paused'].includes(phase)||!adapter)return;
 if(e.target.closest('button,input,select'))return;
 e.preventDefault();const w=frame.contentWindow;(w.document.activeElement||w.document.body).dispatchEvent(new w.KeyboardEvent(type,{key:e.key,code:e.code,repeat:e.repeat,shiftKey:e.shiftKey,bubbles:true,cancelable:true}));
});
// Focusing a chapter is not an app blur; the campaign owns pause/capture for all scenes.
window.addEventListener('blur',()=>{setTimeout(()=>{if(phase==='playing'&&!document.hasFocus())adapter?.pause();},0);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(phase==='playing')adapter?.pause();transitionAudio?.suspend().catch(()=>{});}else if(phase==='loading')transitionAudio?.resume().catch(()=>{});syncMenuAudio();});
$('title-sound').onclick=()=>{settings={...settings,muted:!settings.muted};write(KEYS.settings,settings);adapter?.applySettings(settings);syncMenuAudio();};
window.addEventListener('pagehide',()=>{titleAudio?.dispose();titleAudio=null;endTransitionAudio();});
window.addEventListener('pageshow',syncMenuAudio);
$('start').onclick=()=>progress?$('new-game').showModal():newGame();$('confirm-start').onclick=newGame;
$('continue').onclick=()=>{if(!progress||progress.complete)return;if(index===progress.chapter&&adapter)beginPlay({capture:true});else{lock(true);loadChapter(progress.chapter,{play:true});}};
$('settings-open').onclick=openSettings;$('controls-open').onclick=()=>$('controls').showModal();$('main-menu').onclick=goTitle;
$('retry-load').onclick=()=>{$('load-error').close();loadChapter(lastLoad.index,{play:lastLoad.play});};$('error-title').onclick=goTitle;
$('report-open').onclick=()=>{$('reports').replaceChildren();CHAPTERS.forEach((c,i)=>{const heading=document.createElement('h3');heading.textContent=`${c.number} / ${c.title}`;const p=document.createElement('p');p.textContent=progress?.reports[i]||'COMPLETE';$('reports').append(heading,p);});$('run-summary').showModal();};
document.querySelectorAll('[data-setting]').forEach(input=>input.addEventListener('input',setSettings));
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',()=>{if(phase==='paused')frame?.contentWindow.focus();}));
window.__CAMPAIGN_STATUS__=()=>({phase,index,chapter:CHAPTERS[index].key,progress:progress?structuredClone(progress):null,settings:{...settings},storage,activeFrames:stage.querySelectorAll('iframe').length,ready:!!adapter,titleAudio:titleAudio?.status()||null});
refreshTitle();loadChapter(0);
