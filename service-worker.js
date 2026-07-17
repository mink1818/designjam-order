const CACHE_NAME='design-socks-v3-8-0-item-range';
const APP_SHELL=[
  '/offline.html?v=380',
  '/css/main.css?v=380',
  '/css/admin.css?v=380',
  '/css/statement.css?v=380',
  '/js/pwa.js?v=380',
  '/js/version-badge.js?v=380',
  '/icons/customer-192.png?v=380',
  '/icons/customer-512.png?v=380',
  '/icons/admin-192.png?v=380',
  '/icons/admin-512.png?v=380'
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
      if(req.mode==='navigate') return caches.match('/offline.html?v=380');
      throw new Error('offline');
    })
  );
});
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
