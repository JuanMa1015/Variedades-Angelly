// Configuracion central del sitio. Los valores se inyectan en build time via Vite (.env).
const env = import.meta.env;

export const SITE = {
  name: 'Variedades Angelly',
  shortName: 'Variedades Angelly',
  description:
    'Sistema de gestion para tienda Variedades Angelly: punto de venta, inventario, cartera, fidelizacion y reportes.',
  url: env.VITE_SITE_URL ?? '',
};

export const CONTACTO = {
  direccion: env.VITE_CONTACTO_DIRECCION ?? '',
  telefono: env.VITE_CONTACTO_TELEFONO ?? '',
  email: env.VITE_CONTACTO_EMAIL ?? '',
};

export const contactoCompleto = () =>
  Boolean(CONTACTO.direccion || CONTACTO.telefono || CONTACTO.email);
