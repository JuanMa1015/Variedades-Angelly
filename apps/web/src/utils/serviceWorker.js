// Registra el service worker minimo (public/sw.js) solo en produccion: lo que lo hace instalable en el celular.
// No guarda nada en cache; si el navegador no lo soporta, o falla, la app funciona igual.
export const registrarServiceWorker = ({ navegador = globalThis.navigator, produccion = import.meta.env.PROD } = {}) => {
  if (!produccion || !navegador || !('serviceWorker' in navegador)) return Promise.resolve(false);
  return navegador.serviceWorker.register('/sw.js').then(() => true).catch(() => false);
};
