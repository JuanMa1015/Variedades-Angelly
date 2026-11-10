import { useCallback, useMemo } from 'react';
import { useStoredState } from './useStoredState';

const STORAGE_KEY = 'angelly.pos.prefs.v1';
const MAX_QUICK_PICKS = 8;

const normalize = (raw) => ({
  usage: raw && typeof raw.usage === 'object' && raw.usage !== null ? raw.usage : {},
  favorites: Array.isArray(raw?.favorites) ? raw.favorites.map(Number) : [],
});

// Favoritos (estrella) y productos mas usados de este equipo, para la fila de acceso rapido.
export const usePosPreferences = () => {
  const [stored, setStored] = useStoredState(STORAGE_KEY, { usage: {}, favorites: [] });
  const prefs = useMemo(() => normalize(stored), [stored]);

  const registerUse = useCallback((productoId) => {
    const id = Number(productoId);
    setStored((current) => {
      const base = normalize(current);
      return { ...base, usage: { ...base.usage, [id]: (base.usage[id] || 0) + 1 } };
    });
  }, [setStored]);

  const toggleFavorite = useCallback((productoId) => {
    const id = Number(productoId);
    setStored((current) => {
      const base = normalize(current);
      const favorites = base.favorites.includes(id)
        ? base.favorites.filter((fav) => fav !== id)
        : [...base.favorites, id];
      return { ...base, favorites };
    });
  }, [setStored]);

  const favorites = useMemo(() => new Set(prefs.favorites), [prefs.favorites]);

  // Favoritos primero y luego los mas vendidos en este equipo.
  const quickPickIds = useMemo(() => {
    const frequent = Object.entries(prefs.usage)
      .map(([id, count]) => [Number(id), count])
      .filter(([id]) => !favorites.has(id))
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
    return [...prefs.favorites, ...frequent].slice(0, MAX_QUICK_PICKS);
  }, [prefs, favorites]);

  return { favorites, quickPickIds, registerUse, toggleFavorite };
};
