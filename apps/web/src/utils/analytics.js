// Analiticas opcionales, activadas solo via variables de entorno en build.
// Soporta Google Analytics 4 (VITE_GA_MEASUREMENT_ID) y Plausible
// (VITE_PLAUSIBLE_DOMAIN). Sin variables definidas no se carga ningun script.

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID ?? '';
const PLAUSIBLE_DOMAIN = import.meta.env.VITE_PLAUSIBLE_DOMAIN ?? '';

const loadScript = (src, attrs = {}) =>
  new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    Object.entries(attrs).forEach(([key, value]) => {
      script.setAttribute(key, value);
    });
    script.onload = resolve;
    script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(script);
  });

export const initAnalytics = async () => {
  if (typeof window === 'undefined') return;

  if (GA_ID && !window.dataLayer) {
    window.dataLayer = window.dataLayer || [];
    window.gtag =
      window.gtag ??
      function gtag(...args) {
        window.dataLayer.push(args);
      };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { anonymize_ip: true });
    try {
      await loadScript(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
    } catch {
      // Analiticas best-effort: nunca romper la app por esto.
    }
  }

  if (PLAUSIBLE_DOMAIN && !window.plausible) {
    try {
      await loadScript('https://plausible.io/js/script.js', {
        'data-domain': PLAUSIBLE_DOMAIN,
      });
    } catch {
      // No-op
    }
  }
};
