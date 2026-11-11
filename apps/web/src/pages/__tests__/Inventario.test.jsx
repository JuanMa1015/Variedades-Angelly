import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const useAuthMock = vi.hoisted(() => vi.fn());
const apiGetMock = vi.hoisted(() => vi.fn());
const apiPostMock = vi.hoisted(() => vi.fn());
const apiPatchMock = vi.hoisted(() => vi.fn());
const apiDeleteMock = vi.hoisted(() => vi.fn());
const apiUploadMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());

vi.mock('../../auth/AuthContext', () => ({
  useAuth: useAuthMock,
}));

vi.mock('../../api/httpClient', () => ({
  apiDelete: apiDeleteMock,
  apiGet: apiGetMock,
  apiPatch: apiPatchMock,
  apiPost: apiPostMock,
  apiUpload: apiUploadMock,
}));

vi.mock('../../components/ErrorMessage', () => ({
  default: ({ message, onDismiss }) =>
    message ? (
      <div data-testid="error-message">
        <span>{message}</span>
        <button data-testid="dismiss-error" onClick={onDismiss}>x</button>
      </div>
    ) : null,
}));

vi.mock('../../components/SuccessMessage', () => ({
  default: ({ message, onDismiss }) =>
    message ? (
      <div data-testid="success-message">
        <span>{message}</span>
        <button data-testid="dismiss-success" onClick={onDismiss}>x</button>
      </div>
    ) : null,
}));

vi.mock('../../components/Skeleton', () => ({
  default: ({ lines }) => <div data-testid="skeleton" data-lines={lines} />,
  SkeletonCard: () => <div data-testid="skeleton-card" />,
}));

vi.mock('../../components/useConfirm', () => ({
  default: () => ({
    confirm: confirmMock,
    ConfirmModal: <div data-testid="confirm-modal" />,
  }),
}));

vi.mock('../../components/Modal', () => ({
  default: ({ isOpen, title, children, onClose }) =>
    isOpen ? (
      <div data-testid="modal">
        <span data-testid="modal-title">{title}</span>
        {children}
        <button data-testid="modal-close" onClick={onClose}>Cerrar</button>
      </div>
    ) : null,
}));

const mockProductos = [
  { id: 1, nombre: 'Arroz Diana', codigo_barras: '7701234567890', precio_costo: 2000, precio_venta: 2800, stock_actual: 50, stock_minimo: 10, catalogo: 'tienda', activo: true, imagen_url: null, proveedor_id: null },
  { id: 2, nombre: 'Aceite Gourmet', codigo_barras: null, precio_costo: 8000, precio_venta: 11000, stock_actual: 3, stock_minimo: 5, catalogo: 'tienda', activo: true, imagen_url: '/uploads/aceite.jpg', proveedor_id: 1 },
];

const mockResumen = {
  total: 229,
  stock_total: 2854,
  agotados: 12,
  bajo_stock: 80,
  urgentes: [
    { id: 9, nombre: 'Agua Sabor 235ml', stock_actual: 0, stock_minimo: 3 },
    { id: 8, nombre: 'Alkalina Tronex AAA x1', stock_actual: 2, stock_minimo: 5 },
  ],
};

const mockProveedores = [
  { id: 1, nombre: 'Distribuidora XYZ', activo: true },
];

describe('Inventario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ token: 'test-token', user: { username: 'admin', role: 'admin' } });
    apiGetMock.mockImplementation((endpoint) => {
      if (endpoint.includes('productos/resumen')) {
        return Promise.resolve(mockResumen);
      }
      if (endpoint.includes('productos/paginados')) {
        return Promise.resolve({ data: mockProductos, page: { total: 2, total_pages: 1, current_page: 1, limit: 25 } });
      }
      if (endpoint.includes('proveedores')) {
        return Promise.resolve(mockProveedores);
      }
      return Promise.resolve([]);
    });
    apiPostMock.mockResolvedValue({ id: 3 });
    apiPatchMock.mockResolvedValue({});
    apiDeleteMock.mockResolvedValue(undefined);
  });

  it('renderiza y carga productos al montarse', async () => {
    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);

    expect(screen.getByText('Inventario')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('Arroz Diana')).toBeTruthy();
      expect(screen.getAllByText('Aceite Gourmet').length).toBeGreaterThan(0);
    });
  });

  it('abre modal de creacion al hacer clic en Agregar producto', async () => {
    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);

    await waitFor(() => {
      expect(screen.getByText('Arroz Diana')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Agregar producto'));
    expect(screen.getAllByTestId('modal-title')[0]).toHaveTextContent('Agregar producto al inventario');
  });

  it('abre modal de edicion al hacer clic en editar', async () => {
    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);

    await waitFor(() => {
      expect(screen.getByText('Arroz Diana')).toBeTruthy();
    });

    const editButtons = screen.getAllByTitle('Editar producto');
    fireEvent.click(editButtons[0]);

    expect(screen.getAllByTestId('modal-title').some((t) => t.textContent === 'Editar producto')).toBe(true);
  });

  it('confirma desactivacion al hacer clic en desactivar', async () => {
    confirmMock.mockResolvedValue(true);

    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);

    await waitFor(() => {
      expect(screen.getByText('Arroz Diana')).toBeTruthy();
    });

    const deleteButtons = screen.getAllByTitle('Desactivar producto');
    fireEvent.click(deleteButtons[0]);

    expect(confirmMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(apiDeleteMock).toHaveBeenCalled();
    });
  });

  it('oculta el boton de desactivar para el vendedor (el backend lo prohibe)', async () => {
    useAuthMock.mockReturnValue({ token: 'test-token', user: { username: 'vendedor1', role: 'vendedor' } });

    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);

    await waitFor(() => {
      expect(screen.getByText('Arroz Diana')).toBeTruthy();
    });
    expect(screen.queryAllByTitle('Desactivar producto')).toHaveLength(0);
  });

  it('muestra skeletons mientras carga', async () => {
    apiGetMock.mockImplementation(() => new Promise(() => {}));
    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);

    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0);
  });

  const crearProductoConImagen = async (direccion) => {
    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);
    await waitFor(() => expect(screen.getByText('Arroz Diana')).toBeTruthy());

    fireEvent.click(screen.getByText('Agregar producto'));
    fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Producto Nuevo' } });
    fireEvent.change(screen.getByPlaceholderText('Precio costo (ej: 3500)'), { target: { value: '1000' } });
    fireEvent.change(screen.getByPlaceholderText('Precio venta (ej: 5000)'), { target: { value: '1500' } });
    fireEvent.click(screen.getAllByText('Pegar URL')[0]);
    fireEvent.change(screen.getByPlaceholderText('Pega la dirección de la imagen: se guarda una copia'), { target: { value: direccion } });
    fireEvent.click(screen.getAllByRole('button', { name: /Agregar producto/ }).pop());
  };

  it('una imagen pegada por URL se importa al almacenamiento propio antes de guardar el producto', async () => {
    apiPostMock.mockImplementation((endpoint) => {
      if (endpoint === '/api/upload-imagen-url') {
        return Promise.resolve({ url: 'https://abc.public.blob.vercel-storage.com/productos/copia.jpg' });
      }
      return Promise.resolve({ id: 3 });
    });

    await crearProductoConImagen('https://sitio-externo.com/foto.jpg');

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith('/api/upload-imagen-url', { url: 'https://sitio-externo.com/foto.jpg' });
      expect(apiPostMock).toHaveBeenCalledWith('/api/productos', expect.objectContaining({
        nombre: 'Producto Nuevo',
        imagen_url: 'https://abc.public.blob.vercel-storage.com/productos/copia.jpg',
      }));
    });
  });

  it('si ya es del almacenamiento propio no se vuelve a importar', async () => {
    const propia = 'https://abc.public.blob.vercel-storage.com/productos/ya-estaba.jpg';

    await crearProductoConImagen(propia);

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith('/api/productos', expect.objectContaining({ imagen_url: propia }));
    });
    expect(apiPostMock).not.toHaveBeenCalledWith('/api/upload-imagen-url', expect.anything());
  });

  it('si el servidor rechaza la direccion no crea el producto y explica el motivo', async () => {
    apiPostMock.mockImplementation((endpoint) => {
      if (endpoint === '/api/upload-imagen-url') {
        return Promise.reject(new Error('Esa direccion no esta permitida. Descarga la imagen y subela desde tu computador.'));
      }
      return Promise.resolve({ id: 3 });
    });

    await crearProductoConImagen('http://127.0.0.1/a.png');

    expect(await screen.findByText(/no esta permitida/)).toBeTruthy();
    expect(apiPostMock).not.toHaveBeenCalledWith('/api/productos', expect.anything());
  });

  // -- Resumen, busqueda, filtros y paginacion: los resuelve el servidor sobre TODO el catalogo --

  const consultas = () => apiGetMock.mock.calls.map(([url]) => url).filter((url) => url.includes('productos/paginados'));

  it('las tarjetas cuentan todo el catalogo, no solo la pagina visible', async () => {
    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);

    expect(await screen.findByText('229')).toBeTruthy();
    expect(screen.getByText('2854 u')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('80')).toBeTruthy();
    expect(screen.getByText('Agua Sabor 235ml')).toBeTruthy();
  });

  it('tocar "Agotados" o "Bajo stock" filtra la lista en el servidor', async () => {
    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);
    await screen.findByText('229');

    // La tarjeta y el chip de la tabla hacen lo mismo: se prueba cada uno.
    fireEvent.click(screen.getAllByRole('button', { name: /Agotados/ })[0]);
    await waitFor(() => expect(consultas().at(-1)).toContain('estado=agotado'));
    fireEvent.click(screen.getAllByRole('button', { name: /Bajo stock/ })[0]);
    await waitFor(() => expect(consultas().at(-1)).toContain('estado=bajo'));
    fireEvent.click(screen.getByRole('button', { name: 'Con stock' }));
    await waitFor(() => expect(consultas().at(-1)).toContain('estado=ok'));
  });

  it('el buscador consulta al servidor despues de que dejas de escribir', async () => {
    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);
    await screen.findByText('229');
    const antes = consultas().length;

    fireEvent.change(screen.getByLabelText('Buscar productos'), { target: { value: 'zumo' } });

    await waitFor(() => expect(consultas().at(-1)).toContain('q=zumo'));
    expect(consultas().length).toBe(antes + 1);
  });

  it('con varias paginas se puede avanzar y el servidor recibe la pagina pedida', async () => {
    apiGetMock.mockImplementation((endpoint) => {
      if (endpoint.includes('productos/resumen')) return Promise.resolve(mockResumen);
      return Promise.resolve({ data: mockProductos, page: { total: 229, total_pages: 10, current_page: 1, limit: 25 } });
    });
    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);
    await screen.findByText('Arroz Diana');

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));

    await waitFor(() => expect(consultas().at(-1)).toContain('page=2'));
  });

  it('el stock se ve de un vistazo: agotado y bajo llevan etiqueta', async () => {
    apiGetMock.mockImplementation((endpoint) => {
      if (endpoint.includes('productos/resumen')) return Promise.resolve(mockResumen);
      return Promise.resolve({
        data: [
          { ...mockProductos[0], id: 5, nombre: 'Sin Stock', stock_actual: 0, stock_minimo: 3 },
          { ...mockProductos[0], id: 6, nombre: 'Poco Stock', stock_actual: 2, stock_minimo: 3 },
          { ...mockProductos[0], id: 7, nombre: 'Buen Stock', stock_actual: 30, stock_minimo: 3 },
        ],
        page: { total: 3, total_pages: 1, current_page: 1, limit: 25 },
      });
    });
    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);
    await screen.findByText('Sin Stock');

    expect(within(screen.getByText('Sin Stock').closest('tr')).getByText('Agotado')).toBeTruthy();
    expect(within(screen.getByText('Poco Stock').closest('tr')).getByText('Bajo')).toBeTruthy();
    expect(within(screen.getByText('Buen Stock').closest('tr')).queryByText('Agotado')).toBeNull();
  });

  // -- Edicion segura --

  const abrirEdicion = async (nombre = 'Arroz Diana') => {
    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);
    const fila = (await screen.findByText(nombre)).closest('tr');
    fireEvent.click(within(fila).getByTitle('Editar producto'));
    return screen.findByRole('button', { name: 'Guardar cambios' });
  };

  it('el cuadro de editar tiene etiquetas y muestra el margen', async () => {
    await abrirEdicion();

    ['Nombre', 'Código de barras', 'Precio de costo', 'Precio de venta', 'Stock mínimo', 'Proveedor'].forEach((etiqueta) => {
      expect(screen.getAllByLabelText(etiqueta).length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/Margen: 29%/)).toBeTruthy();
    expect(screen.getByText('50 u')).toBeTruthy();
  });

  it('editar solo el precio envia solo el precio (nunca el stock)', async () => {
    const guardar = await abrirEdicion();

    fireEvent.change(screen.getAllByLabelText('Precio de venta', { selector: 'input' })[0], { target: { value: '3000' } });
    fireEvent.click(guardar);

    await waitFor(() => expect(apiPatchMock).toHaveBeenCalledWith('/api/productos/1', { precio_venta: 3000 }));
  });

  it('sin cambios no envia nada y lo dice', async () => {
    const guardar = await abrirEdicion();

    fireEvent.click(guardar);

    expect(await screen.findByText('No hay cambios para guardar')).toBeTruthy();
    expect(apiPatchMock).not.toHaveBeenCalled();
  });

  it('quitar el proveedor se envia como null', async () => {
    const guardar = await abrirEdicion('Aceite Gourmet');

    fireEvent.change(screen.getByLabelText('Proveedor'), { target: { value: '' } });
    fireEvent.click(guardar);

    await waitFor(() => expect(apiPatchMock).toHaveBeenCalledWith('/api/productos/2', { proveedor_id: null }));
  });

  it('quitar la imagen se envia como null', async () => {
    const guardar = await abrirEdicion('Aceite Gourmet');

    fireEvent.click(screen.getByRole('button', { name: 'Quitar imagen' }));
    fireEvent.click(guardar);

    await waitFor(() => expect(apiPatchMock).toHaveBeenCalledWith('/api/productos/2', { imagen_url: null }));
  });

  it('vender por debajo del costo pide confirmar y, si dices que no, no guarda', async () => {
    const guardar = await abrirEdicion();
    confirmMock.mockResolvedValue(false);

    fireEvent.change(screen.getAllByLabelText('Precio de venta', { selector: 'input' })[0], { target: { value: '1500' } });
    expect(screen.getByText(/por debajo del costo/)).toBeTruthy();
    fireEvent.click(guardar);

    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Precio por debajo del costo' })));
    expect(apiPatchMock).not.toHaveBeenCalled();
  });

  it('si confirma vender por debajo del costo, se guarda', async () => {
    const guardar = await abrirEdicion();
    confirmMock.mockResolvedValue(true);

    fireEvent.change(screen.getAllByLabelText('Precio de venta', { selector: 'input' })[0], { target: { value: '1500' } });
    fireEvent.click(guardar);

    await waitFor(() => expect(apiPatchMock).toHaveBeenCalledWith('/api/productos/1', { precio_venta: 1500 }));
  });

  it('el precio de venta en cero no se envia', async () => {
    const guardar = await abrirEdicion();

    fireEvent.change(screen.getAllByLabelText('Precio de venta', { selector: 'input' })[0], { target: { value: '0' } });
    fireEvent.click(guardar);

    expect(await screen.findByText('El precio de venta debe ser mayor a 0')).toBeTruthy();
    expect(apiPatchMock).not.toHaveBeenCalled();
  });

  // -- Ajuste de stock con motivo --

  const abrirAjuste = async () => {
    await abrirEdicion();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar' }));
    return screen.findByRole('button', { name: 'Ajustar stock' });
  };

  it('ajustar stock: contar muestra cuanto cambia y envia el conteo con su motivo', async () => {
    apiPostMock.mockResolvedValue({ producto: { id: 1, nombre: 'Arroz Diana' }, movimiento: { delta: -5, stock_resultante: 45 } });
    const ajustar = await abrirAjuste();

    fireEvent.change(screen.getByLabelText('Unidades contadas en el estante'), { target: { value: '45' } });
    expect(screen.getByText(/50 → 45 unidades \(-5\)/)).toBeTruthy();
    fireEvent.click(ajustar);

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/productos/1/ajustes-stock', { modo: 'contar', cantidad: 45, motivo: 'conteo' }));
    expect(await screen.findByText(/Stock de "Arroz Diana": 50 → 45/)).toBeTruthy();
  });

  it('sumar y restar ofrecen solo los motivos que tienen sentido', async () => {
    await abrirAjuste();

    fireEvent.click(screen.getByRole('radio', { name: 'Restar' }));
    expect(screen.getByRole('option', { name: 'Merma' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Ingreso sin factura' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Sumar' }));
    expect(screen.getByRole('option', { name: 'Ingreso sin factura' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Merma' })).toBeNull();
  });

  it('no deja restar mas de lo que hay ni guardar sin cantidad', async () => {
    const ajustar = await abrirAjuste();

    fireEvent.click(ajustar);
    expect(await screen.findByText('Escribe una cantidad válida')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Restar' }));
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '60' } });
    fireEvent.click(ajustar);

    expect(await screen.findByText('No se pueden restar 60: solo hay 50')).toBeTruthy();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('el motivo "otro" exige explicar y un conteo igual al stock no ajusta nada', async () => {
    const ajustar = await abrirAjuste();

    fireEvent.change(screen.getByLabelText('Unidades contadas en el estante'), { target: { value: '50' } });
    fireEvent.click(ajustar);
    expect(await screen.findByText('Nada que ajustar: el stock ya es ese')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Sumar' }));
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'otro' } });
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2' } });
    fireEvent.click(ajustar);
    expect(await screen.findByText('Explica qué pasó en la nota')).toBeTruthy();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('si el servidor rechaza el ajuste muestra el motivo', async () => {
    apiPostMock.mockRejectedValue(new Error('El stock no puede quedar negativo'));
    const ajustar = await abrirAjuste();

    fireEvent.click(screen.getByRole('radio', { name: 'Restar' }));
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '5' } });
    fireEvent.click(ajustar);

    expect(await screen.findByText('El stock no puede quedar negativo')).toBeTruthy();
  });

  // -- Ingreso por codigo de barras --

  const procesarCodigo = async (codigo, extra = {}) => {
    const Inventario = (await import('../Inventario')).default;
    render(<Inventario />);
    await screen.findByText('Arroz Diana');
    fireEvent.click(screen.getByText('Agregar producto'));
    fireEvent.click(screen.getByRole('button', { name: /Por código de barras/ }));
    fireEvent.change(screen.getByPlaceholderText('Escanear código de barras'), { target: { value: codigo } });
    if (extra.nombre) fireEvent.change(screen.getByPlaceholderText('Nombre (si es nuevo)'), { target: { value: extra.nombre } });
    fireEvent.change(screen.getByPlaceholderText('Cantidad a ingresar (ej: 6)'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: /Procesar código/ }));
  };

  it('un codigo que ya existe suma stock con motivo, buscandolo en todo el catalogo', async () => {
    apiGetMock.mockImplementation((endpoint) => {
      if (endpoint.includes('productos/resumen')) return Promise.resolve(mockResumen);
      if (endpoint.includes('q=7700000000099')) {
        return Promise.resolve({ data: [{ id: 99, nombre: 'Zumo Hit', codigo_barras: '7700000000099' }], page: { total: 1, total_pages: 1 } });
      }
      if (endpoint.includes('productos/paginados')) return Promise.resolve({ data: mockProductos, page: { total: 2, total_pages: 1 } });
      return Promise.resolve([]);
    });
    apiPostMock.mockResolvedValue({ producto: { id: 99 }, movimiento: { delta: 6, stock_resultante: 6 } });

    await procesarCodigo('7700000000099');

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/productos/99/ajustes-stock', { modo: 'sumar', cantidad: 6, motivo: 'ingreso_sin_factura' }));
    expect(await screen.findByText('Stock actualizado para Zumo Hit')).toBeTruthy();
  });

  it('un codigo nuevo crea el producto', async () => {
    apiGetMock.mockImplementation((endpoint) => {
      if (endpoint.includes('productos/resumen')) return Promise.resolve(mockResumen);
      if (endpoint.includes('q=7709999999999')) return Promise.resolve({ data: [], page: { total: 0, total_pages: 1 } });
      if (endpoint.includes('productos/paginados')) return Promise.resolve({ data: mockProductos, page: { total: 2, total_pages: 1 } });
      return Promise.resolve([]);
    });

    await procesarCodigo('7709999999999', { nombre: 'Producto Nuevo' });

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/productos', expect.objectContaining({ nombre: 'Producto Nuevo', codigo_barras: '7709999999999', stock_actual: 6 })));
  });
});
