import { afterEach, describe, expect, it, vi } from 'vitest';
import { printHtml } from '../printReceipt';
import { buildReceiptHtml, escapeHtml } from '../receiptHtml';

const formatMoney = (value) => `$${value}`;
const site = { name: 'Variedades Angelly' };
const contacto = { nit: '900.123', direccion: 'Cra 10 #20', telefono: '300 000' };

const base = {
  timestamp: '9/11/2026, 10:18 p. m.',
  metodoPago: 'efectivo',
  items: [{ nombre: 'Agua Pool 600ml', cantidad: 1, precio: 1000, subtotal: 1000 }],
  total: 2700,
  pago: 3000,
  cambio: 300,
  esFiado: false,
  abono: 0,
  puntos: 0,
  cliente: null,
};

const html = (receipt = {}, extra = {}) => buildReceiptHtml({ ...base, ...receipt }, { formatMoney, site, contacto, ...extra });

describe('buildReceiptHtml', () => {
  it('incluye datos del negocio, productos y totales', () => {
    const doc = html();

    expect(doc).toContain('Variedades Angelly');
    expect(doc).toContain('NIT: 900.123');
    expect(doc).toContain('Comprobante de venta'.toUpperCase());
    expect(doc).toContain('Documento no válido como factura');
    expect(doc).toContain('Agua Pool 600ml');
    expect(doc).toContain('TOTAL:');
    expect(doc).toContain('$2700');
  });

  it('siempre muestra el cambio en contado, tambien cuando es cero', () => {
    expect(html({ cambio: 300 })).toMatch(/Cambio:<\/span><span>\$300/);
    expect(html({ pago: 2700, cambio: 0 })).toMatch(/Cambio:<\/span><span>\$0/);
    expect(html({ pago: 2700, cambio: undefined })).toMatch(/Cambio:<\/span><span>\$0/);
  });

  it('fiado: muestra cliente, abono y lo que queda fiado en lugar de pago y cambio', () => {
    const doc = html({ esFiado: true, cliente: 'Marta', abono: 700, total: 2700 });

    expect(doc).toContain('Marta');
    expect(doc).toContain('Abono:');
    expect(doc).toMatch(/Queda fiado:<\/span><span>\$2000/);
    expect(doc).not.toContain('Cambio:');
  });

  it('omite los datos de contacto que no estan configurados', () => {
    const doc = html({}, { contacto: { nit: '', direccion: '', telefono: '' } });

    expect(doc).not.toContain('NIT:');
    expect(doc).not.toContain('Tel:');
  });

  it('muestra los puntos ganados y el metodo de pago', () => {
    const doc = html({ puntos: 3, metodoPago: 'nequi' });

    expect(doc).toContain('+3');
    expect(doc).toContain('Método de pago: Nequi');
  });

  it('escapa HTML de nombres para evitar inyeccion', () => {
    const doc = html({ items: [{ nombre: '<img src=x onerror=alert(1)>', cantidad: 1, precio: 1, subtotal: 1 }], cliente: '"><script>' });

    expect(doc).not.toContain('<img src=x');
    expect(doc).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('quita los margenes de la pagina para que el navegador no imprima fecha ni direccion web', () => {
    expect(html()).toContain('@page { margin: 0; }');
  });
});

describe('escapeHtml', () => {
  it('escapa los caracteres especiales', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
    expect(escapeHtml(null)).toBe('');
  });
});

describe('printHtml', () => {
  afterEach(() => vi.useRealTimers());

  const fakeDocument = () => {
    const write = vi.fn();
    const frameWindow = {
      document: { open: vi.fn(), write, close: vi.fn() },
      addEventListener: vi.fn(),
      focus: vi.fn(),
      print: vi.fn(),
    };
    const frame = { setAttribute: vi.fn(), contentWindow: frameWindow, remove: vi.fn() };
    const documentRef = { createElement: vi.fn(() => frame), body: { appendChild: vi.fn() } };
    return { documentRef, frame, frameWindow, write };
  };

  it('imprime el comprobante desde un iframe oculto y lo limpia despues', () => {
    vi.useFakeTimers();
    const { documentRef, frame, frameWindow, write } = fakeDocument();

    printHtml('<html>recibo</html>', { documentRef });

    expect(documentRef.createElement).toHaveBeenCalledWith('iframe');
    expect(documentRef.body.appendChild).toHaveBeenCalledWith(frame);
    expect(write).toHaveBeenCalledWith('<html>recibo</html>');
    expect(frameWindow.print).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60);
    expect(frameWindow.focus).toHaveBeenCalled();
    expect(frameWindow.print).toHaveBeenCalledTimes(1);

    const afterPrint = frameWindow.addEventListener.mock.calls.find(([event]) => event === 'afterprint')[1];
    afterPrint();
    expect(frame.remove).toHaveBeenCalled();
  });

  it('si el navegador nunca avisa del fin de la impresion, igual lo elimina', () => {
    vi.useFakeTimers();
    const { documentRef, frame } = fakeDocument();

    printHtml('<html></html>', { documentRef });
    vi.advanceTimersByTime(61_000);

    expect(frame.remove).toHaveBeenCalled();
  });
});
