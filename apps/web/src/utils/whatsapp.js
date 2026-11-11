const soloDigitos = (valor) => String(valor ?? '').replace(/\D/g, '');

// Numero listo para wa.me (57 + digitos), o '' si no sirve. Mismo criterio que el servidor.
export const whatsappNumber = (valor) => {
  const digitos = soloDigitos(valor);
  if (digitos.length === 12 && digitos.startsWith('57')) return digitos;
  if (digitos.length === 10) return `57${digitos}`;
  if (digitos.length === 7) return `57601${digitos}`;
  return '';
};

// Enlace que abre WhatsApp con el mensaje escrito; vacio si el telefono no es valido.
export const buildWhatsappUrl = (telefono, lineas) => {
  const numero = whatsappNumber(telefono);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(lineas.join('\n'))}` : '';
};
