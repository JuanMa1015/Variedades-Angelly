// Analiticas opcionales, activadas solo via variables de entorno en build.
// Sin variables definidas no se carga ningun script.
//
// Soporta:
// - Plausible (formato nuevo por script-id): VITE_PLAUSIBLE_SCRIPT_ID=HV2D2...
// - Plausible (formato clasico por dominio):  VITE_PLAUSIBLE_DOMAIN=tudominio.com
// - Google Tag Manager:                       VITE_GTM_ID=GTM-XXXXXXX
// - Google Analytics 4 directo:               VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
//
// Nota: activa solo UNA fuente para no duplicar mediciones.

const PLAUSIBLE_SCRIPT_ID = import.meta.env.VITE_PLAUSIBLE_SCRIPT_ID ?? '';
const PLAUSIBLE_DOMAIN = import.meta.env.VITE_PLAUSIBLE_DOMAIN ?? '';
const GTM_ID = import.meta.env.VITE_GTM_ID ?? '';
const GA4_ID = import.meta.env.VITE_GA_MEASUREMENT_ID ?? '';

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

const initGtm = () => {
  if (!GTM_ID || window.dataLayer?.some?.((item) => item?.['gtm.start'])) return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  loadScript(`https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`).catch(() => {});

  // Iframe noscript equivalente (visible solo para entornos sin JS).
  const noscript = document.createElement('noscript');
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.googletagmanager.com/ns.html?id=${GTM_ID}`;
  iframe.height = '0';
  iframe.width = '0';
  iframe.style.display = 'none';
  iframe.style.visibility = 'hidden';
  noscript.appendChild(iframe);
  document.body.prepend(noscript);
};

const initGa4 = () => {
  if (!GA4_ID || window.dataLayer?.some?.((item) => Array.isArray(item) && item[0] === 'js')) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ??
    function gtag(...args) {
      window.dataLayer.push(args);
    };
  window.gtag('js', new Date());
  window.gtag('config', GA4_ID, { anonymize_ip: true });
  loadScript(`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`).catch(() => {});
};

const initPlausible = async () => {
  if (PLAUSIBLE_SCRIPT_ID && !window.plausible) {
    // Snippet oficial nuevo: cola + init antes/despues del script.
    window.plausible =
      window.plausible ||
      function plausible(...args) {
        (window.plausible.q = window.plausible.q || []).push(args);
      };
    window.plausible.init =
      window.plausible.init ||
      function init(options) {
        window.plausible.o = options || {};
      };
    try {
      await loadScript(`https://plausible.io/js/pa-${PLAUSIBLE_SCRIPT_ID}.js`);
      window.plausible.init();
    } catch {
      // Analiticas best-effort: nunca romper la app por esto.
    }
    return;
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

export const initAnalytics = () => {
  if (typeof window === 'undefined') return;
  initGtm();
  initGa4();
  initPlausible();
};

// Envio de pageview en navegaciones SPA (React Router). Los scripts ya
// registran la vista inicial; aqui cubrimos los cambios de ruta.
export const trackPageview = (path) => {
  if (typeof window === 'undefined') return;

  if (typeof window.plausible === 'function') {
    try {
      window.plausible('pageview');
    } catch {
      // No-op
    }
  }

  if (typeof window.gtag === 'function') {
    try {
      window.gtag('event', 'page_view', { page_path: path });
    } catch {
      // No-op
    }
  }
};
