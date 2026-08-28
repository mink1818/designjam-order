const CACHE_NAME='design-socks-v6-6-67';
const APP_SHELL=[
  '/offline.html?v=66200',
  '/css/main.css?v=66200',
  '/css/admin.css?v=66200',
  '/css/statement.css?v=66200',
  '/customer-share-document.html?v=66200',
  '/css/customer-share-document.css?v=66040',
  '/js/customer-share-document.js?v=66200',
  '/js/pwa.js?v=66200',
  '/js/version-badge.js?v=66668',
  '/js/back-navigation.js?v=66040',
  '/js/free-handwriting-ocr.js?v=66040',
  '/js/emergency-notice-modal.js?v=66040',
  '/js/customer-ai-support.js?v=66040',
  '/js/admin-ai-inquiry-alert.js?v=66048',
  '/ai-inquiries.html?v=66048',
  '/js/ai-inquiries.js?v=66048',
  '/payments.html?v=66040',
  '/js/payments.js?v=66040',
  '/icons/customer-192.png?v=66040',
  '/icons/customer-512.png?v=66040',
  '/icons/admin-192.png?v=66040',
  '/icons/admin-512.png?v=66040',
  '/images/install-guide/android-full-guide.jpg?v=66040'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req,{cache:'no-store'}).then(res=>{if(res&&res.ok){const copy=res.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy));}return res;}).catch(async()=>await caches.match(req)||await caches.match('/offline.html?v=66200')));
    return;
  }
  // JS/CSS/이미지는 캐시를 즉시 사용하고 뒤에서 최신본으로 교체해 화면 체감속도를 높입니다.
  event.respondWith((async()=>{
    const cached=await caches.match(req);
    const network=fetch(req).then(res=>{if(res&&res.ok){const copy=res.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy));}return res;}).catch(()=>null);
    if(cached){event.waitUntil(network);return cached;}
    const res=await network;if(res)return res;throw new Error('offline');
  })());
});
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
