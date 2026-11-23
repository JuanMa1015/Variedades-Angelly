// Cada cobro lleva una clave que el servidor usa para no registrar dos veces la misma venta. Si el cobro falla por la
// conexión (y no se sabe si el servidor alcanzó a registrarlo), el reintento del MISMO ticket reutiliza la clave:
// si la venta ya estaba, el servidor devuelve esa misma en lugar de crear otra. Si el ticket cambió, la clave es nueva.
const STORAGE_KEY = 'angelly.pos.cobro.v1';

const leer = () => {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
};

const escribir = (valor) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(valor));
  } catch {
    // Sin almacenamiento: solo se pierde la proteccion si ademas se recarga la pagina.
  }
};

const nuevaClave = () => {
  const base = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  return base.replace(/[^A-Za-z0-9_-]/g, '');
};

export const claveParaCobro = (payload) => {
  // La clave del administrador que autoriza un descuento no se guarda en el navegador.
  const { autorizador_usuario: _usuario, autorizador_password: _clave, ...sinAutorizacion } = payload;
  const firma = JSON.stringify(sinAutorizacion);
  const guardada = leer();
  if (guardada?.firma === firma && guardada?.clave) return guardada.clave;
  const clave = nuevaClave();
  escribir({ firma, clave });
  return clave;
};

export const olvidarClaveCobro = () => {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nada que borrar.
  }
};
