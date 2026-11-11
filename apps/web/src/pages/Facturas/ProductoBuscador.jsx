import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

const MAX_RESULTADOS = 30;

// Busca por nombre o codigo de barras y se maneja con teclado: flechas para moverse, Enter elige, Escape cierra.
const ProductoBuscador = ({ productos, onSelect }) => {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);

  const resultados = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return productos
      .filter((p) => !q || p.nombre.toLowerCase().includes(q) || (p.codigo_barras && p.codigo_barras.toLowerCase().includes(q)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .slice(0, MAX_RESULTADOS);
  }, [productos, texto]);

  const elegir = (producto) => {
    onSelect(producto);
    setTexto('');
    setAbierto(false);
  };

  const manejarTecla = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      // Con la lista cerrada la primera flecha solo la abre; con la lista abierta baja una opcion.
      if (!abierto) {
        setAbierto(true);
        return;
      }
      setResaltado((actual) => Math.min(actual + 1, resultados.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setResaltado((actual) => Math.max(actual - 1, 0));
    } else if (event.key === 'Enter' && abierto && resultados[resaltado]) {
      event.preventDefault();
      elegir(resultados[resaltado]);
    } else if (event.key === 'Escape') {
      setAbierto(false);
    }
  };

  return (
    <div className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={abierto}
        aria-controls="productos-resultados"
        aria-label="Buscar producto"
        value={texto}
        onChange={(event) => { setTexto(event.target.value); setResaltado(0); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={manejarTecla}
        className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm focus:border-rosewood focus:outline-none"
        placeholder="Buscar producto..."
        autoComplete="off"
      />
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      {abierto && (
        <ul id="productos-resultados" role="listbox" className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {resultados.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">Sin resultados</li>}
          {resultados.map((producto, indice) => (
            <li key={producto.id} role="option" aria-selected={indice === resaltado}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => elegir(producto)}
                onMouseEnter={() => setResaltado(indice)}
                className={`w-full px-3 py-2 text-left text-sm transition ${indice === resaltado ? 'bg-rosewood/10' : 'hover:bg-rosewood/10'}`}
              >
                <span className="font-medium text-gray-900">{producto.nombre}</span>
                {producto.codigo_barras && <span className="ml-2 text-xs text-gray-400">{producto.codigo_barras}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ProductoBuscador;
