var CACHE_NAME = 'book-cache-d94901099c';

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll([
        './',
        './index.html',
        './manifest.json',
        './search-index.json',
        './styles.css',
        './fab.css',
        './script.js',
        './image.jpg',
        './favicon.ico',
        './notes.css',
        './notes.js',
        './bookmarks.css',
        './bookmarks.js',
        './highlight.css',
        './highlight.js',
        './fuse.min.js',
        './search.js',
        './search.css',
        './lucide.min.js'
      ]);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) { return name !== CACHE_NAME; })
             .map(function(name) { return caches.delete(name); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request);
    })
  );
});