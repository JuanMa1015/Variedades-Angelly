import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClientCombobox from '../ClientCombobox';
import MoneyInput from '../MoneyInput';
import { formatThousands, parseMoney } from '../posHelpers';

const clientes = [
  { id: 1, nombre: 'Berta Villa', telefono_whatsapp: '573001110001', deuda_total: 12000 },
  { id: 2, nombre: 'Doña Consuelo', telefono_whatsapp: '573001110002', deuda_total: 0 },
  { id: 3, nombre: 'Karol Machado', telefono_whatsapp: '573001110003', deuda_total: 500 },
];

const setup = (props = {}) => {
  const onChange = vi.fn();
  const onCreate = vi.fn();
  render(
    <ClientCombobox
      id="c"
      label="Cliente"
      clientes={clientes}
      value=""
      onChange={onChange}
      onCreate={onCreate}
      placeholder="Buscar cliente"
      getHint={(c) => (c.deuda_total > 0 ? `Debe ${c.deuda_total}` : '')}
      {...props}
    />,
  );
  return { onChange, onCreate, input: screen.getByRole('combobox', { name: 'Cliente' }) };
};

const optionNames = () => screen.queryAllByRole('option').map((option) => option.textContent);

describe('ClientCombobox', () => {
  it('al enfocar muestra todos los clientes con su deuda', () => {
    const { input } = setup();

    fireEvent.focus(input);

    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(optionNames()[0]).toContain('Berta Villa');
    expect(optionNames()[0]).toContain('Debe 12000');
  });

  it('filtra en vivo mientras se escribe, sin importar mayusculas ni tildes', () => {
    const { input } = setup();
    fireEvent.focus(input);

    fireEvent.change(input, { target: { value: 'dona' } });
    expect(optionNames()).toHaveLength(2); // "Doña Consuelo" + opcion de crear

    fireEvent.change(input, { target: { value: 'KAROL' } });
    expect(optionNames()[0]).toContain('Karol Machado');
  });

  it('tambien busca por telefono', () => {
    const { input } = setup();
    fireEvent.focus(input);

    fireEvent.change(input, { target: { value: '0003' } });

    expect(optionNames()[0]).toContain('Karol Machado');
  });

  it('elige con clic y cierra la lista', () => {
    const { input, onChange } = setup();
    fireEvent.focus(input);

    fireEvent.click(screen.getByRole('option', { name: /Karol Machado/ }));

    expect(onChange).toHaveBeenCalledWith('3');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('se maneja con el teclado: flechas, Enter y Escape', () => {
    const { input, onChange } = setup();
    fireEvent.focus(input);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('2');

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('ofrece crear el cliente con el texto buscado cuando no existe', () => {
    const { input, onCreate } = setup();
    fireEvent.focus(input);

    fireEvent.change(input, { target: { value: 'Pedro Nuevo' } });
    fireEvent.click(screen.getByRole('option', { name: /Crear cliente «Pedro Nuevo»/ }));

    expect(onCreate).toHaveBeenCalledWith('Pedro Nuevo');
  });

  it('muestra el cliente elegido y permite quitarlo', () => {
    const { input, onChange } = setup({ value: '1' });

    expect(input).toHaveValue('Berta Villa');
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Berta Villa' }));

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('sin resultados lo dice', () => {
    const { input } = setup({ onCreate: undefined });
    fireEvent.focus(input);

    fireEvent.change(input, { target: { value: 'zzz' } });

    expect(screen.getByText('No hay clientes para mostrar.')).toBeInTheDocument();
  });
});

describe('MoneyInput', () => {
  it('muestra el monto con puntos de miles', () => {
    render(<MoneyInput id="m" label="Monto" value={5000} onChange={() => {}} />);

    expect(screen.getByLabelText('Monto')).toHaveValue('5.000');
  });

  it('al escribir entrega solo el numero, ignorando puntos y letras', () => {
    const onChange = vi.fn();
    render(<MoneyInput id="m" label="Monto" value={0} onChange={onChange} placeholder="Recibido" />);

    fireEvent.change(screen.getByPlaceholderText('Recibido'), { target: { value: '1.250.000abc' } });

    expect(onChange).toHaveBeenCalledWith(1250000);
  });

  it('vacio o cero se muestra sin texto', () => {
    render(<MoneyInput id="m" label="Monto" value={0} onChange={() => {}} />);

    expect(screen.getByLabelText('Monto')).toHaveValue('');
  });
});

describe('formatThousands / parseMoney', () => {
  it.each([[999, '999'], [1000, '1.000'], [5000, '5.000'], [1234567, '1.234.567'], [0, ''], [-5, ''], ['abc', '']])(
    'formatThousands(%s) = %s',
    (value, esperado) => {
      expect(formatThousands(value)).toBe(esperado);
    },
  );

  it('parseMoney ignora todo lo que no sea digito', () => {
    expect(parseMoney('$ 12.500')).toBe(12500);
    expect(parseMoney('')).toBe(0);
    expect(parseMoney('x')).toBe(0);
  });
});
