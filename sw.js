// Nome della cache (puoi sceglierne uno qualsiasi)
const CACHE_NAME = 'pwa-cache-v1';

// Lista dei file da mettere in cache
const CACHE_FILES = [
  './',
  './index.html',
  './calc.html',  // <- nuovo file
  './manifest.json',
  './styles.css',
  './script.js',
  // Aggiungi qui eventuali file di immagini, icone, ecc.
  // Esempio: './icon-192.png', './icon-512.png'
];

// Evento 'install': avviene quando il browser installa il service worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CACHE_FILES);
    })
  );
});

// Evento 'fetch': intercetta tutte le richieste e prova a rispondere con la cache
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Se il file è in cache, lo restituiamo
      // altrimenti facciamo la fetch dalla rete
      return response || fetch(event.request);
    })
  );
});

// Evento 'activate': usato per aggiornare la cache e rimuovere versioni vecchie
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(
        keyList.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});
