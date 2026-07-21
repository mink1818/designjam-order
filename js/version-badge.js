(()=>{
  const VERSION='V6.1.3';
  function addBadge(){
    if(document.getElementById('appVersionBadge')) return;
    const b=document.createElement('div');
    b.id='appVersionBadge';
    b.textContent=VERSION;
    b.title='현재 배포 버전';
    Object.assign(b.style,{position:'fixed',left:'8px',bottom:'8px',zIndex:'99999',padding:'5px 9px',borderRadius:'999px',background:'#112437',color:'#fff',fontSize:'11px',fontWeight:'800',letterSpacing:'.02em',boxShadow:'0 3px 12px rgba(0,0,0,.2)',pointerEvents:'none'});
    document.body.appendChild(b);
  }
  async function refreshWorker(){
    if(!('serviceWorker' in navigator)) return;
    try{const regs=await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r=>r.update()));}catch(_){ }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{addBadge();refreshWorker();});
  else {addBadge();refreshWorker();}
})();
