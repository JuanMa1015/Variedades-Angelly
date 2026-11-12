import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';

const INPUT = 'w-full rounded-lg border border-gray-300 py-2 pl-3 pr-9 text-sm focus:border-rosewood focus:outline-none';

// Sin tildes ni mayusculas: "dulceria" encuentra "Aquies Dulcería".
const normalizar = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Lista desplegable donde se puede escribir para filtrar en vivo (flechas, Enter y Escape funcionan).
// `opciones`: [{ valor, etiqueta }]; el primer elemento de la lista es siempre `placeholder` (valor ''), para poder quitar la eleccion.
const SelectBuscable = ({ id, value, onChange, opciones, placeholder, ariaLabel, vacio = 'Sin resultados' }) => {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);

  const seleccionada = opciones.find((o) => o.valor === value);
  const filtradas = useMemo(() => {
    const q = normalizar(texto);
    return q ? opciones.filter((o) => normalizar(o.etiqueta).includes(q)) : opciones;
  }, [opciones, texto]);
  // Sin texto escrito se ofrece tambien la opcion vacia ("Selecciona proveedor"); escribiendo solo salen coincidencias.
  const lista = texto.trim() ? filtradas : [{ valor: '', etiqueta: placeholder }, ...filtradas];

  const abrir = () => {
    setTexto('');
    setResaltado(0);
    setAbierto(true);
  };

  const elegir = (opcion) => {
    onChange(opcion.valor);
    setTexto('');
    setAbierto(false);
  };

  const manejarTecla = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!abierto) { abrir(); return; }
      setResaltado((actual) => Math.min(actual + 1, lista.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setResaltado((actual) => Math.max(actual - 1, 0));
    } else if (event.key === 'Enter' && abierto) {
      event.preventDefault();
      if (lista[resaltado]) elegir(lista[resaltado]);
    } else if (event.key === 'Escape') {
      setAbierto(false);
      setTexto('');
    }
  };

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        aria-activedescendant={abierto && lista[resaltado] ? `${id}-opcion-${resaltado}` : undefined}
        value={abierto ? texto : (seleccionada?.etiqueta ?? '')}
        placeholder={placeholder}
        onChange={(event) => { setTexto(event.target.value); setResaltado(0); setAbierto(true); }}
        onFocus={abrir}
        onBlur={() => setTimeout(() => { setAbierto(false); setTexto(''); }, 150)}
        onKeyDown={manejarTecla}
        autoComplete="off"
        className={INPUT}
      />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
      {abierto && (
        <ul id={`${id}-lista`} role="listbox" className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {lista.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">{vacio}</li>}
          {lista.map((opcion, indice) => (
            <li key={`${opcion.valor}-${indice}`} id={`${id}-opcion-${indice}`} role="option" aria-selected={opcion.valor === value}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => elegir(opcion)}
                onMouseEnter={() => setResaltado(indice)}
                className={`w-full px-3 py-2 text-left text-sm transition ${indice === resaltado ? 'bg-rosewood/10' : ''} ${opcion.valor === value ? 'font-semibold text-rosewood' : 'text-gray-800'}`}
              >
                {opcion.etiqueta}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SelectBuscable;
