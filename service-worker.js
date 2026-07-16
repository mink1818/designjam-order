// Design Socks V3.7.0
const CACHE_NAME='design-socks-v3-7-0';
const APP_SHELL=[
  '/offline.html',
  '/css/main.css?v=370',
  '/css/admin.css?v=370',
  '/css/statement.css?v=370',
  '/js/pwa.js?v=370',
  '/js/version-badge.js?v=370',
  '/icons/customer-192.png?v=370',
  '/icons/customer-512.png?v=370',
  '/icons/admin-192.png?v=370',
  '/icons/admin-512.png?v=370'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(APP_SHELL))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

// V3.7.0: network-first for every same-origin GET request.
// This prevents an installed PWA from continuing to show an older JS/CSS deployment.
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then(response=>{
        if(response && response.ok){
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));
        }
        return response;
      })
      .catch(async()=>{
        const cached=await caches.match(request);
        if(cached) return cached;
        if(request.mode==='navigate') return caches.match('/offline.html');
        throw new Error('network and cache unavailable');
      })
  );
});

self.addEventListener('message',event=>{
  if(event.data==='SKIP_WAITING') self.skipWaiting();
});
