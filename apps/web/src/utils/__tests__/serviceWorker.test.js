import { describe, expect, it, vi } from 'vitest';
import { registrarServiceWorker } from '../serviceWorker';

describe('registrarServiceWorker', () => {
  it('en produccion registra /sw.js', async () => {
    const register = vi.fn().mockResolvedValue({});

    const ok = await registrarServiceWorker({ navegador: { serviceWorker: { register } }, produccion: true });

    expect(ok).toBe(true);
    expect(register).toHaveBeenCalledWith('/sw.js');
  });

  it('en desarrollo no registra nada (no se mezcla con el servidor de Vite)', async () => {
    const register = vi.fn();

    expect(await registrarServiceWorker({ navegador: { serviceWorker: { register } }, produccion: false })).toBe(false);
    expect(register).not.toHaveBeenCalled();
  });

  it('si el navegador no lo soporta o el registro falla, la app sigue sin errores', async () => {
    expect(await registrarServiceWorker({ navegador: {}, produccion: true })).toBe(false);
    expect(await registrarServiceWorker({ navegador: null, produccion: true })).toBe(false);
    const falla = vi.fn().mockRejectedValue(new Error('bloqueado'));
    expect(await registrarServiceWorker({ navegador: { serviceWorker: { register: falla } }, produccion: true })).toBe(false);
  });
});
