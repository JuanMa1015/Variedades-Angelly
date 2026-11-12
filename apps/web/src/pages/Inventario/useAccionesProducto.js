import { useState } from 'react';
import { apiDelete, apiRequest } from '../../api/httpClient';

// Lo que se hace con un producto desde la lista (crear, editar, ajustar stock, ver historial, desactivar y reactivar),
// igual para el inventario de la tienda y para los productos de cartera: cada pantalla solo aporta su `recargar`,
// el manejo de errores y el texto de confirmacion de desactivar.
export const useAccionesProducto = ({ recargar, setError, confirm, textoDesactivar }) => {
  const [success, setSuccess] = useState('');
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [ajustando, setAjustando] = useState(null);
  const [historial, setHistorial] = useState(null);

  const avisar = (mensaje) => { setError(''); setSuccess(mensaje); };
  const limpiarAvisos = () => { setError(''); setSuccess(''); };

  const handleCreado = async (mensaje) => {
    setCreando(false);
    avisar(mensaje);
    await recargar();
  };

  const handleGuardado = async (nombre) => {
    setEditando(null);
    avisar(`Producto "${nombre}" actualizado`);
    await recargar();
  };

  const handleAjustado = async ({ producto, movimiento }) => {
    setAjustando(null);
    setEditando(null);
    avisar(`Stock de "${producto.nombre}": ${movimiento.stock_resultante - movimiento.delta} → ${movimiento.stock_resultante}`);
    await recargar();
  };

  const accion = (producto, hacer, exito, fallo) => hacer()
    .then(async () => { avisar(`Producto "${producto.nombre}" ${exito}`); await recargar(); })
    .catch((err) => setError(err.message || fallo));

  const handleDesactivar = async (producto) => {
    const ok = await confirm({ title: 'Desactivar producto', confirmLabel: 'Desactivar', ...textoDesactivar(producto) });
    if (!ok) return;
    await accion(producto, () => apiDelete(`/api/productos/${producto.id}`), 'desactivado', 'No se pudo desactivar el producto');
  };

  const handleReactivar = (producto) => accion(
    producto,
    () => apiRequest(`/api/productos/${producto.id}/reactivar`, { method: 'PUT' }),
    'reactivado',
    'No se pudo reactivar el producto',
  );

  return {
    success, setSuccess, creando, editando, ajustando, historial,
    abrirCrear: () => { limpiarAvisos(); setCreando(true); },
    cerrarCrear: () => setCreando(false),
    abrirEditar: (producto) => { limpiarAvisos(); setEditando(producto); },
    cerrarEditar: () => setEditando(null),
    abrirAjuste: setAjustando,
    cerrarAjuste: () => setAjustando(null),
    abrirHistorial: setHistorial,
    cerrarHistorial: () => setHistorial(null),
    handleCreado, handleGuardado, handleAjustado, handleDesactivar, handleReactivar,
  };
};
