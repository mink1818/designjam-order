const CACHE_NAME='design-socks-v6-5-69-warehouse-search-history-b1';
const APP_SHELL=[
  '/offline.html?v=65690',
  '/css/main.css?v=65690',
  '/css/admin.css?v=65690',
  '/css/statement.css?v=65690',
  '/customer-share-document.html?v=65690',
  '/css/customer-share-document.css?v=65690',
  '/js/customer-share-document.js?v=65690',
  '/js/pwa.js?v=65690',
  '/js/version-badge.js?v=65690',
  '/js/back-navigation.js?v=65690',
  '/icons/customer-192.png?v=65690',
  '/icons/customer-512.png?v=65690',
  '/icons/admin-192.png?v=65690',
  '/icons/admin-512.png?v=65690',
  '/images/install-guide/android-full-guide.jpg?v=65690'
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
      if(req.mode==='navigate') return caches.match('/offline.html?v=65690');
      throw new Error('offline');
    })
  );
});
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
