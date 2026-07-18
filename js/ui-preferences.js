(function(){
'use strict';
const THEME_KEY='designjam_theme_mode',FONT_KEY='designjam_font_size';
let observer=null,scheduled=false;
const EXCLUDE_SELECTOR='script,style,svg,svg *,canvas,.barcode-label-card,.barcode-label-card *,.print-only,.print-only *';
function resolvedTheme(mode){return mode==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):mode;}
function fontScale(font){return font==='xlarge'?1.30:font==='large'?1.15:1;}
function isExcluded(el){return !el||el.nodeType!==1||el.matches(EXCLUDE_SELECTOR);}
function getBaseSize(el){
  const saved=Number(el.dataset.djBaseFontSize||0);
  if(saved>0)return saved;
  const computed=parseFloat(getComputedStyle(el).fontSize);
  if(Number.isFinite(computed)&&computed>0){el.dataset.djBaseFontSize=String(computed);return computed;}
  return 0;
}
function applyFontScale(root=document){
  const font=localStorage.getItem(FONT_KEY)||'normal';
  const scale=fontScale(font);
  const nodes=root===document?[document.body,...document.body.querySelectorAll('*')]:[root,...(root.querySelectorAll?.('*')||[])];
  nodes.forEach(el=>{
    if(isExcluded(el))return;
    const base=getBaseSize(el); if(!base)return;
    if(scale===1) el.style.removeProperty('font-size');
    else el.style.setProperty('font-size',`${Math.round(base*scale*100)/100}px`,'important');
  });
}
function rgbParts(value){const m=String(value||'').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);return m?{r:+m[1],g:+m[2],b:+m[3],a:m[4]===undefined?1:+m[4]}:null;}
function effectiveBackground(el){let node=el;while(node&&node!==document.documentElement){const c=rgbParts(getComputedStyle(node).backgroundColor);if(c&&c.a>.05)return c;node=node.parentElement;}return null;}
function isLight(c){return c&&c.r>218&&c.g>218&&c.b>218;}
function isLightText(c){return c&&c.r>190&&c.g>190&&c.b>190;}
function repairDarkContrast(root=document){
  const dark=document.documentElement.dataset.theme==='dark';
  const nodes=root===document?[document.body,...document.body.querySelectorAll('*')]:[root,...(root.querySelectorAll?.('*')||[])];
  nodes.forEach(el=>{
    if(isExcluded(el))return;
    el.classList.remove('dj-auto-dark-text');
    if(!dark)return;
    const bg=effectiveBackground(el),fg=rgbParts(getComputedStyle(el).color);
    if(isLight(bg)&&isLightText(fg))el.classList.add('dj-auto-dark-text');
  });
}
function runRepairs(root=document){
  if(!document.body)return;
  applyFontScale(root);
  repairDarkContrast(root);
}
function schedule(root=document){
  if(scheduled)return;scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;runRepairs(root);});
}
function startObserver(){
  observer?.disconnect();
  observer=new MutationObserver(mutations=>{
    mutations.forEach(m=>m.addedNodes.forEach(node=>{if(node.nodeType===1)schedule(node);}));
  });
  observer.observe(document.body,{childList:true,subtree:true});
}
function apply(){
  const mode=localStorage.getItem(THEME_KEY)||'light';
  const font=localStorage.getItem(FONT_KEY)||'normal';
  const resolved=resolvedTheme(mode);
  document.documentElement.dataset.theme=resolved;
  document.documentElement.dataset.themeMode=mode;
  document.documentElement.dataset.fontSize=font;
  document.documentElement.style.setProperty('--dj-font-scale',String(fontScale(font)));
  document.body?.classList.toggle('theme-dark',resolved==='dark');
  schedule(document);
  window.dispatchEvent(new CustomEvent('designjam-preferences-changed',{detail:{theme:resolved,font}}));
}
window.DesignJamPreferences={
  apply,
  setTheme(v){localStorage.setItem(THEME_KEY,v);apply();},
  setFont(v){localStorage.setItem(FONT_KEY,v);apply();},
  getTheme(){return localStorage.getItem(THEME_KEY)||'light';},
  getFont(){return localStorage.getItem(FONT_KEY)||'normal';}
};
apply();
document.addEventListener('DOMContentLoaded',()=>{apply();startObserver();setTimeout(()=>runRepairs(document),300);setTimeout(()=>runRepairs(document),1200);});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if((localStorage.getItem(THEME_KEY)||'light')==='system')apply();});
})();
