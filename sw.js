const CACHE_NAME = 'maboutique-cache-v5';

// Liste des ressources de base à mettre en cache pour un accès hors ligne
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './app.html',
    './catalogue.html',
    './style.css',
    './dist/final.css',
    './manifest.json',
    'https://unpkg.com/lucide@latest/dist/umd/lucide.min.js',
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap'
];

// Installation du Service Worker et mise en cache des fichiers
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then(cache => {
            console.log('Mise en cache des ressources PWA');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activation et nettoyage des anciens caches (lors des mises à jour)
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Interception des requêtes : Stratégie "Network First, fallback to Cache"
self.addEventListener('fetch', event => {
    // L'API Cache ne supporte que les requêtes GET.
    // On ignore les requêtes POST, PUT, DELETE (utilisées par Firebase) ou les schémas non-http.
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
        .then(response => {
            // Vérifier si la réponse est valide avant de la mettre en cache
            if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
            }
            
            if (event.request.method === 'GET') {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
            }
            return response;
        })
        .catch(() => caches.match(event.request))
    );
});