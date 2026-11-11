// Estado de la imagen de un producto en un formulario: sin cambios, archivo nuevo, direccion de internet o quitada.
export const IMAGEN_VACIA = { archivo: null, url: '', quitar: false };

export const imagenCambio = (valor) => Boolean(valor.archivo || valor.url.trim() || valor.quitar);
