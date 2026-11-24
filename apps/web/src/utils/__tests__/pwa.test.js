// La app es instalable en el celular: manifiesto valido, iconos que existen y enlaces en el index.html.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/* global process */
const raiz = process.cwd(); // vitest se ejecuta desde apps/web
const leer = (ruta) => readFileSync(resolve(raiz, ruta), 'utf-8');
const manifiesto = JSON.parse(leer('public/manifest.webmanifest'));

describe('PWA', () => {
  it('el manifiesto tiene lo que Chrome pide para instalar', () => {
    expect(manifiesto).toMatchObject({ name: 'Variedades Angelly', short_name: 'Angelly', start_url: '/', scope: '/', display: 'standalone' });
    expect(manifiesto.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifiesto.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('declara iconos de 192 y 512 y uno «maskable», y todos existen', () => {
    const tamanos = manifiesto.icons.map((icono) => icono.sizes);
    expect(tamanos).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifiesto.icons.some((icono) => icono.purpose === 'maskable')).toBe(true);
    manifiesto.icons.forEach((icono) => expect(existsSync(resolve(raiz, 'public', icono.src.slice(1)))).toBe(true));
    expect(existsSync(resolve(raiz, 'public/icons/apple-touch-icon.png'))).toBe(true);
  });

  it('el index.html enlaza el manifiesto, el icono de iOS y declara que es una app', () => {
    const html = leer('index.html');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('rel="apple-touch-icon" href="/icons/apple-touch-icon.png"');
    expect(html).toContain('name="mobile-web-app-capable"');
    expect(html).toContain('name="apple-mobile-web-app-capable"');
  });

  it('el service worker existe y no guarda nada en cache', () => {
    const sw = leer('public/sw.js');
    expect(sw).toContain("addEventListener('fetch'");
    expect(sw).not.toMatch(/caches\.|cache\.addAll|\.put\(/);
  });

  it('Vercel sirve el manifiesto con su tipo y el service worker sin cache', () => {
    const vercel = JSON.parse(leer('vercel.json'));
    const cabecera = (fuente) => vercel.headers.find((h) => h.source === fuente)?.headers[0];
    expect(cabecera('/manifest.webmanifest')).toEqual({ key: 'Content-Type', value: 'application/manifest+json' });
    expect(cabecera('/sw.js')).toEqual({ key: 'Cache-Control', value: 'no-cache' });
    expect(vercel.rewrites[0].destination).toBe('/index.html'); // el resto de las rutas sigue igual
  });
});
