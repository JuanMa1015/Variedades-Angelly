// Service worker minimo: hace instalable la app y NO guarda nada en cache.
// Cada visita pide siempre la ultima version a Vercel (nunca se queda una pantalla vieja tras un despliegue).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
