const CACHE_NAME='design-socks-v6-6-59';
const APP_SHELL=[
  '/offline.html?v=66180',
  '/css/main.css?v=66180',
  '/css/admin.css?v=66180',
  '/css/statement.css?v=66180',
  '/customer-share-document.html?v=66180',
  '/css/customer-share-document.css?v=66040',
  '/js/customer-share-document.js?v=66180',
  '/js/pwa.js?v=66180',
  '/js/version-badge.js?v=66659',
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
  event.respondWith(
    fetch(req,{cache:'no-store'}).then(res=>{
      if(res && res.ok){const copy=res.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy));}
      return res;
    }).catch(async()=>{
      const cached=await caches.match(req);
      if(cached) return cached;
      if(req.mode==='navigate') return caches.match('/offline.html?v=66180');
      throw new Error('offline');
    })
  );
});
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
