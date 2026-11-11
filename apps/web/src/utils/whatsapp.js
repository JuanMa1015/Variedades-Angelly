const soloDigitos = (valor) => String(valor ?? '').replace(/\D/g, '');

// Numero listo para wa.me (57 + digitos), o '' si no sirve. Mismo criterio que el servidor.
export const whatsappNumber = (valor) => {
  const digitos = soloDigitos(valor);
  if (digitos.length === 12 && digitos.startsWith('57')) return digitos;
  if (digitos.length === 10) return `57${digitos}`;
  if (digitos.length === 7) return `57601${digitos}`;
  return '';
};

// Telefono para mostrar: celular como "300 111 2233"; lo que no se pueda interpretar se deja tal cual.
export const telefonoLegible = (valor) => {
  const digitos = soloDigitos(valor);
  if (!digitos) return '';
  const nacional = digitos.length === 12 && digitos.startsWith('57') ? digitos.slice(2) : digitos;
  if (nacional.length === 10) return `${nacional.slice(0, 3)} ${nacional.slice(3, 6)} ${nacional.slice(6)}`;
  if (nacional.length === 7) return `${nacional.slice(0, 3)} ${nacional.slice(3)}`;
  return String(valor);
};

// Enlace que abre WhatsApp con el mensaje escrito; vacio si el telefono no es valido.
export const buildWhatsappUrl = (telefono, lineas) => {
  const numero = whatsappNumber(telefono);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(lineas.join('\n'))}` : '';
};
