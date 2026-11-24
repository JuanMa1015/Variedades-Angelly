// Cada cobro lleva una clave que el servidor usa para no registrar dos veces la misma operacion. Si el cobro falla por la
// conexion (y no se sabe si el servidor alcanzo a registrarlo), el reintento de la MISMA operacion reutiliza la clave:
// si ya estaba, el servidor devuelve esa misma en lugar de crear otra. Si la operacion cambio, la clave es nueva.
// Cada tipo de cobro (`espacio`) guarda su propia clave: punto de venta, abono de cartera, venta de cartera...
const llaveDe = (espacio) => (espacio === 'pos' ? 'angelly.pos.cobro.v1' : `angelly.cobro.${espacio}.v1`);

const leer = (llave) => {
  try {
    return JSON.parse(window.localStorage.getItem(llave));
  } catch {
    return null;
  }
};

const escribir = (llave, valor) => {
  try {
    window.localStorage.setItem(llave, JSON.stringify(valor));
  } catch {
    // Sin almacenamiento: solo se pierde la proteccion si ademas se recarga la pagina.
  }
};

let contador = 0;

// Clave unica del cobro. randomUUID solo existe en paginas seguras (https); si falta se usan bytes aleatorios del
// navegador (getRandomValues) y, como ultimo recurso, la hora mas un contador (nunca Math.random).
const nuevaClave = () => {
  const cripto = globalThis.crypto;
  if (cripto?.randomUUID) return cripto.randomUUID().replace(/[^A-Za-z0-9_-]/g, '');
  if (cripto?.getRandomValues) {
    return Array.from(cripto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  contador += 1;
  return `${Date.now().toString(36)}-${contador.toString(36)}-cobro`;
};

export const claveParaCobro = (payload, espacio = 'pos') => {
  // La clave del administrador que autoriza un descuento no se guarda en el navegador.
  const { autorizador_usuario: _usuario, autorizador_password: _clave, ...sinAutorizacion } = payload;
  const firma = JSON.stringify(sinAutorizacion);
  const llave = llaveDe(espacio);
  const guardada = leer(llave);
  if (guardada?.firma === firma && guardada?.clave) return guardada.clave;
  const clave = nuevaClave();
  escribir(llave, { firma, clave });
  return clave;
};

export const olvidarClaveCobro = (espacio = 'pos') => {
  try {
    window.localStorage.removeItem(llaveDe(espacio));
  } catch {
    // Nada que borrar.
  }
};
