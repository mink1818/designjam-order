(()=>{
  const FALLBACK_VERSION='V6.1.8';
  function addBadge(version){
    let b=document.getElementById('appVersionBadge');
    if(!b){
      b=document.createElement('div'); b.id='appVersionBadge'; b.title='현재 배포 버전';
      Object.assign(b.style,{position:'fixed',left:'8px',bottom:'8px',zIndex:'99999',padding:'5px 9px',borderRadius:'999px',background:'#112437',color:'#fff',fontSize:'11px',fontWeight:'800',letterSpacing:'.02em',boxShadow:'0 3px 12px rgba(0,0,0,.2)',pointerEvents:'none'});
      document.body.appendChild(b);
    }
    b.textContent=version;
  }
  async function resolveVersion(){
    try{
      const res=await fetch(`version.json?t=${Date.now()}`,{cache:'no-store'});
      if(!res.ok) throw new Error('version fetch failed');
      const data=await res.json();
      return `V${String(data.version||'').replace(/^V/i,'')}`;
    }catch(_){return FALLBACK_VERSION;}
  }
  async function init(){addBadge(await resolveVersion());}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
