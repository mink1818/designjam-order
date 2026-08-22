/* DESIGN SOCKS V6.6.43 - mobile-safe embedded Korean address search */
(function(){
  const POSTCODE_SRC='https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
  let loadingPromise=null;
  function loadDaumPostcode(){
    if(window.daum&&window.daum.Postcode)return Promise.resolve();
    if(loadingPromise)return loadingPromise;
    loadingPromise=new Promise((resolve,reject)=>{
      let s=document.querySelector('script[data-designsocks-postcode]');
      const done=()=>window.daum&&window.daum.Postcode?resolve():reject(new Error('postcode unavailable'));
      if(s){s.addEventListener('load',done,{once:true});s.addEventListener('error',()=>reject(new Error('postcode load failed')),{once:true});setTimeout(()=>{if(window.daum&&window.daum.Postcode)resolve();},0);return;}
      s=document.createElement('script');s.src=POSTCODE_SRC;s.async=true;s.dataset.designsocksPostcode='1';
      s.onload=done;s.onerror=()=>reject(new Error('postcode load failed'));document.head.appendChild(s);
    }).catch(e=>{loadingPromise=null;throw e;});
    return loadingPromise;
  }
  function closeLayer(){const x=document.getElementById('designsocks-postcode-layer');if(x)x.remove();document.body.style.overflow='';}
  function showEmbedded(oncomplete){
    closeLayer();
    const layer=document.createElement('div');layer.id='designsocks-postcode-layer';
    layer.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#fff;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);';
    const bar=document.createElement('div');bar.style.cssText='height:54px;flex:0 0 54px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid #ddd;background:#fff;font-family:sans-serif;';
    bar.innerHTML='<strong style="font-size:17px">주소 검색</strong>';
    const close=document.createElement('button');close.type='button';close.textContent='닫기';close.style.cssText='border:0;background:#1b4b91;color:#fff;border-radius:9px;padding:9px 14px;font-size:15px;font-weight:700;';close.onclick=closeLayer;bar.appendChild(close);
    const frame=document.createElement('div');frame.style.cssText='flex:1;min-height:0;width:100%;';layer.append(bar,frame);document.body.appendChild(layer);document.body.style.overflow='hidden';
    new window.daum.Postcode({width:'100%',height:'100%',oncomplete(data){closeLayer();oncomplete&&oncomplete(data);}}).embed(frame);
  }
  function openAddressSearch(oncomplete){
    loadDaumPostcode().then(()=>showEmbedded(oncomplete)).catch(e=>{console.error('[address-search]',e);alert('주소 검색 서비스를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.');});
  }
  window.DesignSocksAddressSearch={open:openAddressSearch,load:loadDaumPostcode};
})();
