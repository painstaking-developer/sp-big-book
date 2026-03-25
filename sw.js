var CACHE_NAME = 'book-cache-a99b949742';

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll([
        './',
        './index.html',
        './sheets.html',
        './shared.html',
        './manifest.json',
        './search-index.json',
        './styles.css',
        './fab.css',
        './script.js',
        './image.jpg',
        './favicon.ico',
        './richtext.js',
        './notes.css',
        './notes.js',
        './bookmarks.css',
        './bookmarks.js',
        './highlight.css',
        './highlight.js',
        './fuse.min.js',
        './search.js',
        './search.css',
        './sheets.js',
        './sheets.css',
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