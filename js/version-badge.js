(()=>{
  const RELEASE_VERSION='V6.7.0';
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
    // Vercel Edge Request 절감: 화면 이동마다 version.json을 강제 조회하지 않습니다.
    // 같은 브라우저에서는 최대 6시간에 한 번만 배포 버전을 확인합니다.
    const CHECK_KEY='ds_version_check_at';
    const CHECK_TTL=6*60*60*1000;
    const last=Number(localStorage.getItem(CHECK_KEY)||0);
    if(Date.now()-last<CHECK_TTL) return;
    try{
      const res=await fetch('/version.json',{cache:'no-cache'});
      if(res.ok){
        const data=await res.json();
        localStorage.setItem(CHECK_KEY,String(Date.now()));
        if(data?.version)addBadge('V'+String(data.version).replace(/^V/i,''));
      }
    }catch(_){/* offline: bundled release version stays visible */}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
