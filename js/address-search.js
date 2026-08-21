/* DESIGN SOCKS V6.6.42 - shared Korean address search */
(function(){
  const POSTCODE_SRC='https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
  let loadingPromise=null;

  function loadDaumPostcode(){
    if(window.daum && window.daum.Postcode) return Promise.resolve();
    if(loadingPromise) return loadingPromise;
    loadingPromise=new Promise((resolve,reject)=>{
      let s=document.querySelector('script[data-designsocks-postcode]');
      if(!s){
        s=document.createElement('script');
        s.src=POSTCODE_SRC;
        s.dataset.designsocksPostcode='1';
        document.head.appendChild(s);
      }
      const done=()=>window.daum && window.daum.Postcode ? resolve() : reject(new Error('postcode unavailable'));
      s.addEventListener('load',done,{once:true});
      s.addEventListener('error',()=>reject(new Error('postcode load failed')),{once:true});
      if(window.daum && window.daum.Postcode) resolve();
    }).catch(err=>{loadingPromise=null;throw err;});
    return loadingPromise;
  }

  function openAddressSearch(oncomplete){
    if(window.daum && window.daum.Postcode){
      new window.daum.Postcode({oncomplete:oncomplete}).open();
      return;
    }
    loadDaumPostcode().then(()=>{
      new window.daum.Postcode({oncomplete:oncomplete}).open();
    }).catch(e=>{
      console.error('[address-search]',e);
      alert('주소 검색 서비스를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.');
    });
  }

  window.DesignSocksAddressSearch={open:openAddressSearch,load:loadDaumPostcode};
})();
