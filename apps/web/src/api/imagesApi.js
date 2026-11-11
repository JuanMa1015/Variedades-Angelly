import { apiPost, apiUpload } from './httpClient';

// Imagenes que ya estan en el almacenamiento propio (Vercel Blob) no hace falta volver a copiarlas.
const OWN_STORAGE = /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//i;

export const isRemoteImageUrl = (url) => /^https?:\/\//i.test(String(url ?? '').trim()) && !OWN_STORAGE.test(String(url).trim());

// El servidor descarga la imagen, la optimiza y la guarda en el almacenamiento propio:
// asi el producto no depende de que el sitio de origen la conserve. Retorna la URL permanente.
export const importImageFromUrl = async (url) => {
  const result = await apiPost('/api/upload-imagen-url', { url: String(url).trim() });
  return result.url;
};

const dataUrlToFile = (dataUrl) => {
  const parts = dataUrl.split(',', 2);
  if (parts.length !== 2) return null;
  const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
  const bin = atob(parts[1].replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], 'imagen.jpg', { type: mime });
};

const uploadImage = async (file) => (await apiUpload('/api/upload-imagen', file)).url;

// Lo que el usuario eligio (archivo, imagen pegada o direccion de internet) termina siempre como una URL propia.
export const resolveImageUrl = async (url, file) => {
  if (file) return uploadImage(file);
  if (url && url.startsWith('data:')) {
    const archivo = dataUrlToFile(url);
    if (archivo) return uploadImage(archivo);
  }
  if (isRemoteImageUrl(url)) return importImageFromUrl(url);
  return url || null;
};
