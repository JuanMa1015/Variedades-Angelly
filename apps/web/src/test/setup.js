import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

// localStorage en memoria. En Node 20 (CI) jsdom ya lo trae; en versiones nuevas de Node
// el global choca con el de jsdom y queda sin definir. Con esto las pruebas se comportan
// igual en cualquier version de Node.
const createStorage = () => {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
};

const hasWorkingStorage = () => {
  try {
    window.localStorage.getItem('__probe__');
    return true;
  } catch {
    return false;
  }
};

if (typeof window !== 'undefined' && !hasWorkingStorage()) {
  const storage = createStorage();
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}

// Cada prueba parte sin datos guardados (tickets en espera, favoritos, borradores...).
beforeEach(() => {
  window.localStorage.clear();
});
