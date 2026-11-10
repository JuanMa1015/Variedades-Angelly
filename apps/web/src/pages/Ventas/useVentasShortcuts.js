import { useEffect, useRef } from 'react';

// Atajos del POS: F2 buscar/escanear, F4 poner en espera, F9 cobrar, Esc limpiar busqueda.
export const useVentasShortcuts = ({ enabled, onFocusSearch, onHold, onCharge, onEscape }) => {
  const handlers = useRef({});

  // Se guarda la version mas reciente de los handlers sin reinstalar el listener en cada render.
  useEffect(() => {
    handlers.current = { onFocusSearch, onHold, onCharge, onEscape };
  });

  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = (event) => {
      const actions = {
        F2: handlers.current.onFocusSearch,
        F4: handlers.current.onHold,
        F9: handlers.current.onCharge,
        Escape: handlers.current.onEscape,
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
};
