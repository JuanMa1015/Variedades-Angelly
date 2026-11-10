import { useEffect } from 'react';

const DESKTOP_QUERY = '(min-width: 1024px)';

// En pantallas grandes el POS ocupa justo el alto que queda bajo el encabezado, sea cual sea su
// altura (zoom del navegador, fuentes, barras): asi la pagina no se desplaza y el ticket no se corta.
// Se escribe directo en el elemento para no volver a renderizar en cada cambio de tamano.
export const useAvailableHeight = (ref, { bottomGap = 32, minHeight = 520 } = {}) => {
  useEffect(() => {
    const apply = () => {
      const node = ref.current;
      if (!node) return;
      const isDesktop = window.matchMedia?.(DESKTOP_QUERY)?.matches;
      if (!isDesktop) {
        node.style.height = '';
        return;
      }
      const top = node.getBoundingClientRect().top + window.scrollY;
      node.style.height = `${Math.max(minHeight, Math.floor(window.innerHeight - top - bottomGap))}px`;
    };

    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [ref, bottomGap, minHeight]);
};
