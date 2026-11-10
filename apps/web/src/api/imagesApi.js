import { apiPost } from './httpClient';

// Imagenes que ya estan en el almacenamiento propio (Vercel Blob) no hace falta volver a copiarlas.
const OWN_STORAGE = /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//i;

export const isRemoteImageUrl = (url) => /^https?:\/\//i.test(String(url ?? '').trim()) && !OWN_STORAGE.test(String(url).trim());

// El servidor descarga la imagen, la optimiza y la guarda en el almacenamiento propio:
// asi el producto no depende de que el sitio de origen la conserve. Retorna la URL permanente.
export const importImageFromUrl = async (url) => {
  const result = await apiPost('/api/upload-imagen-url', { url: String(url).trim() });
  return result.url;
};
