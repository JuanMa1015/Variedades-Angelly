import { afterEach, describe, expect, it, vi } from 'vitest';
import { importImageFromUrl, isRemoteImageUrl } from '../imagesApi';

describe('isRemoteImageUrl', () => {
  it.each([
    ['https://sitio.com/foto.jpg', true],
    ['http://sitio.com/foto.jpg', true],
    ['  https://sitio.com/foto.jpg  ', true],
    ['HTTPS://SITIO.COM/FOTO.JPG', true],
    // Ya esta en el almacenamiento propio: no se vuelve a copiar.
    ['https://wipkptt8wvrudmcl.public.blob.vercel-storage.com/productos/abc.jpg', false],
    // No son direcciones de internet.
    ['/uploads/abc.jpg', false],
    ['data:image/png;base64,AAAA', false],
    ['', false],
    [null, false],
    [undefined, false],
  ])('%s -> %s', (url, esperado) => {
    expect(isRemoteImageUrl(url)).toBe(esperado);
  });
});

describe('importImageFromUrl', () => {
  afterEach(() => vi.restoreAllMocks());

  it('pide al servidor que descargue la imagen y devuelve la URL permanente', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ url: 'https://abc.public.blob.vercel-storage.com/productos/x.jpg' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const url = await importImageFromUrl('  https://sitio.com/foto.jpg ');

    expect(url).toBe('https://abc.public.blob.vercel-storage.com/productos/x.jpg');
    const [endpoint, opciones] = fetchMock.mock.calls[0];
    expect(endpoint).toMatch(/\/api\/upload-imagen-url$/);
    expect(opciones.method).toBe('POST');
    expect(JSON.parse(opciones.body)).toEqual({ url: 'https://sitio.com/foto.jpg' });
  });

  it('propaga el motivo cuando el servidor rechaza la direccion', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'Esa direccion no esta permitida. Descarga la imagen y subela desde tu computador.' }),
    }));

    await expect(importImageFromUrl('http://127.0.0.1/a.png')).rejects.toThrow(/no esta permitida/);
  });
});
