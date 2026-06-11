const CACHE_NAME = 'droperx-cache-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './assets/css/style.css',
    './assets/js/main.js',
    './assets/images/icon.png',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
    'https://unpkg.com/peerjs@1.5.1/dist/peerjs.min.js'
];

let streamMap = new Map();

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // We ignore errors on caching external CDNs in case of network block
            return cache.addAll(ASSETS_TO_CACHE).catch(err => console.warn("Cache addAll failed", err));
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'STREAM_DOWNLOAD') {
        streamMap.set(event.data.id, event.data.stream);
        // Reply to main thread so it knows SW is ready to receive the fetch
        event.ports[0].postMessage({ status: 'READY' });
    }
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // StreamSaver Interceptor
    if (url.pathname.includes('/stream-download/')) {
        const parts = url.pathname.split('/stream-download/');
        const streamPath = parts[1].split('/');
        const id = streamPath[0];
        const filename = decodeURIComponent(streamPath[1] || 'download');

        const stream = streamMap.get(id);
        
        if (stream) {
            streamMap.delete(id);
            const headers = new Headers({
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
                'Content-Security-Policy': "default-src 'none'",
                'X-Content-Type-Options': 'nosniff'
            });
            event.respondWith(new Response(stream, { headers }));
            return;
        } else {
            event.respondWith(new Response("Stream not found or expired", { status: 404 }));
            return;
        }
    }

    // Default Network-first caching strategy
    // Ignore non-http/https requests (like chrome-extension://) to prevent Cache put errors
    if (!event.request.url.startsWith('http')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // If valid response, clone and cache
                if(response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                // On failure, try cache
                return caches.match(event.request);
            })
    );
});
