(()=>{
  const RELEASE_VERSION='V6.6.57';
  function addBadge(version){
    let b=document.getElementById('appVersionBadge');
    if(!b){
      b=document.createElement('div'); b.id='appVersionBadge'; b.title='현재 배포 버전';
      Object.assign(b.style,{position:'fixed',left:'8px',bottom:'8px',zIndex:'99999',padding:'5px 9px',borderRadius:'999px',background:'#112437',color:'#fff',fontSize:'11px',fontWeight:'800',letterSpacing:'.02em',boxShadow:'0 3px 12px rgba(0,0,0,.2)',pointerEvents:'none'});
      document.body.appendChild(b);
    }
    b.textContent=version;
  }
  async function init(){
    addBadge(RELEASE_VERSION);
    try{
      const res=await fetch('/version.json?ts='+Date.now(),{cache:'no-store'});
      if(res.ok){const data=await res.json();if(data?.version)addBadge('V'+String(data.version).replace(/^V/i,''));}
    }catch(_){/* offline: bundled release version stays visible */}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
