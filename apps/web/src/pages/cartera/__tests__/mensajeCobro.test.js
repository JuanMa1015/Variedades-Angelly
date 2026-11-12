import { describe, expect, it } from 'vitest';
import { construirMensajeCobro } from '../mensajeCobro';

const estado = (extra = {}) => ({
  cliente_id: 1, nombre: 'Maria Perez', deuda_total: 3500, dias_deuda: 12, estado_deuda: 'al_dia',
  ultimas_compras: [{ venta_id: 7, fecha: '2026-11-02T15:00:00', total: 6000, articulos: 'Arroz x3' }],
  ultimo_abono: { fecha: '2026-11-08T15:00:00', monto: 1500 }, ...extra,
});

describe('construirMensajeCobro', () => {
  it('dice la deuda real, desde cuando, las ultimas compras y el ultimo abono', () => {
    const mensaje = construirMensajeCobro(estado());

    expect(mensaje).toContain('Hola Maria Perez, un saludo de Tienda Angelly.');
    expect(mensaje).toContain('Tu saldo pendiente es de $3.500 hace 12 días.');
    expect(mensaje).toContain('Tus últimas compras a crédito:');
    expect(mensaje).toContain('- 02/11: Arroz x3 ($6.000)');
    expect(mensaje).toContain('Tu último abono fue de $1.500 el 08/11.');
    expect(mensaje).toContain('Comparte el comprobante para aplicar el abono. Gracias!');
  });

  it('no inventa totales originales ni lo abonado', () => {
    const mensaje = construirMensajeCobro(estado());

    expect(mensaje).not.toMatch(/Total original|Abonado:|Pendiente:/);
  });

  it('sin compras ni abonos solo dice el saldo', () => {
    const mensaje = construirMensajeCobro(estado({ ultimas_compras: [], ultimo_abono: null, dias_deuda: null }));

    expect(mensaje).toContain('Tu saldo pendiente es de $3.500.');
    expect(mensaje).not.toContain('últimas compras');
    expect(mensaje).not.toContain('último abono');
  });

  it('habla en singular y de hoy', () => {
    expect(construirMensajeCobro(estado({ dias_deuda: 1 }))).toContain('hace 1 día.');
    expect(construirMensajeCobro(estado({ dias_deuda: 0 }))).toContain('desde hoy.');
  });

  it('agrega las formas de pago solo si hay', () => {
    expect(construirMensajeCobro(estado())).not.toContain('Formas de pago');

    const mensaje = construirMensajeCobro(estado(), ['Nequi: 3001112233']);

    expect(mensaje).toContain('Formas de pago:\n- Nequi: 3001112233');
  });
});
