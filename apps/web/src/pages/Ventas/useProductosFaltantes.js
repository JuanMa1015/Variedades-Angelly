import { useEffect, useRef } from 'react';
import { apiGet } from '../../api/httpClient';
import { extractProductos } from './posHelpers';

const LOTE = 200;

// El catalogo del POS trae solo 200 productos. Los del ticket que no estan ahi (un ticket recuperado, un borrador
// al volver de otra pantalla) se piden por ID; asi nunca se muestran como «Producto #384 $0» ni se cobran sin precio.
export const useProductosFaltantes = ({ items, productosById, listo, onEncontrados, onAusentes, onError }) => {
  const callbacks = useRef({});
  // IDs ya pedidos y que no llegaron (ya no existen o se desactivaron) o que estan en camino: no se repiten.
  const sinResolver = useRef(new Set());

  useEffect(() => {
    callbacks.current = { onEncontrados, onAusentes, onError };
  });

  useEffect(() => {
    if (!listo) return undefined;
    const ids = [...new Set(items.map((item) => Number(item.producto_id)))]
      .filter((id) => id > 0 && !productosById.has(id) && !sinResolver.current.has(id));
    if (ids.length === 0) return undefined;

    ids.forEach((id) => sinResolver.current.add(id));
    let activo = true;

    const resolver = async () => {
      try {
        const pedidos = [];
        for (let desde = 0; desde < ids.length; desde += LOTE) {
          const params = new URLSearchParams({ catalogo: 'tienda' });
          ids.slice(desde, desde + LOTE).forEach((id) => params.append('ids', id));
          pedidos.push(apiGet(`/api/productos?${params}`));
        }
        const encontrados = (await Promise.all(pedidos)).flatMap(extractProductos);
        const hallados = new Set(encontrados.map((producto) => Number(producto.id)));
        hallados.forEach((id) => sinResolver.current.delete(id));
        if (!activo) return;
        callbacks.current.onEncontrados?.(encontrados);
        const ausentes = ids.filter((id) => !hallados.has(id));
        if (ausentes.length > 0) callbacks.current.onAusentes?.(ausentes);
      } catch {
        ids.forEach((id) => sinResolver.current.delete(id)); // se reintenta si el ticket vuelve a cambiar
        if (activo) callbacks.current.onError?.();
      }
    };
    void resolver();

    return () => { activo = false; };
  }, [items, productosById, listo]);
};
