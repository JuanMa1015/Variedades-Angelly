import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Plus, X } from 'lucide-react';

const normalize = (text) => String(text ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase();

const MAX_RESULTS = 50;
const LIST_HEIGHT = 240;

// El desplegable se dibuja fuera del panel (portal) para que no lo recorte el area con scroll.
const useDropdownPosition = (anchorRef, open) => {
  const [position, setPosition] = useState(null);

  const update = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const opensUp = spaceBelow < LIST_HEIGHT && rect.top > spaceBelow;
    setPosition({
      left: rect.left,
      width: rect.width,
      maxHeight: Math.min(LIST_HEIGHT, (opensUp ? rect.top : spaceBelow) - 12),
      ...(opensUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
  }, [anchorRef]);

  // Mientras esta abierto se reposiciona si cambia el tamano de la ventana o se desplaza el panel.
  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, update]);

  return [position, update];
};

const OptionRow = ({ optionId, active, onPick, onHover, children }) => (
  <li
    id={optionId}
    role="option"
    aria-selected={active}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onPick}
    onMouseEnter={onHover}
    className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
      active ? 'bg-blush-100 text-gray-900' : 'text-gray-800'
    }`}
  >
    {children}
  </li>
);

// Selector con busqueda en vivo: se escribe parte del nombre (o telefono) y la lista se filtra al instante.
const ClientCombobox = ({ id, label, clientes, value, onChange, onCreate, placeholder, getHint }) => {
  const listId = useId();
  const anchorRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, measure] = useDropdownPosition(anchorRef, open);

  const selected = clientes.find((cliente) => String(cliente.id) === String(value)) ?? null;
  const trimmedQuery = query.trim();

  const results = useMemo(() => {
    const needle = normalize(trimmedQuery);
    const matches = needle
      ? clientes.filter((c) => normalize(c.nombre).includes(needle) || normalize(c.telefono_whatsapp).includes(needle))
      : clientes;
    return matches.slice(0, MAX_RESULTS);
  }, [clientes, trimmedQuery]);

  const canCreate = Boolean(onCreate) && trimmedQuery.length >= 2
    && !results.some((c) => normalize(c.nombre) === normalize(trimmedQuery));
  const optionCount = results.length + (canCreate ? 1 : 0);

  const openList = () => {
    measure();
    setOpen(true);
    setActiveIndex(0);
  };

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const pickClient = (cliente) => {
    onChange(String(cliente.id));
    close();
  };

  const pickCreate = () => {
    onCreate(trimmedQuery);
    close();
  };

  const pickActive = () => {
    if (activeIndex < results.length) pickClient(results[activeIndex]);
    else if (canCreate) pickCreate();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) openList();
      if (optionCount > 0) setActiveIndex((current) => (current + (event.key === 'ArrowDown' ? 1 : optionCount - 1)) % optionCount);
    } else if (event.key === 'Enter' && open) {
      event.preventDefault(); // no enviar el formulario del ticket
      pickActive();
    } else if (event.key === 'Escape' && open) {
      event.stopPropagation();
      close();
    }
  };

  const clearSelection = () => {
    onChange('');
    setQuery('');
    inputRef.current?.focus();
  };

  const activeOptionId = open && optionCount > 0 ? `${listId}-${activeIndex}` : undefined;

  return (
    <div ref={anchorRef} className="relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeOptionId}
        autoComplete="off"
        value={open ? query : (selected?.nombre ?? '')}
        placeholder={placeholder}
        onFocus={openList}
        onBlur={close}
        onChange={(event) => { setQuery(event.target.value); openList(); }}
        onKeyDown={handleKeyDown}
        className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-3 pr-16 text-sm focus:border-rosewood focus:outline-none focus:ring-2 focus:ring-rosewood/20"
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-gray-400">
        {selected && (
          <button type="button" onClick={clearSelection} aria-label={`Quitar ${selected.nombre}`} className="rounded-full p-1 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        )}
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </div>

      {open && position && createPortal(
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          style={{ position: 'fixed', zIndex: 60, ...position }}
          className="overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
        >
          {results.map((cliente, index) => (
            <OptionRow
              key={cliente.id}
              optionId={`${listId}-${index}`}
              active={index === activeIndex}
              onPick={() => pickClient(cliente)}
              onHover={() => setActiveIndex(index)}
            >
              <span className="min-w-0 truncate font-medium">{cliente.nombre}</span>
              {getHint?.(cliente) && <span className="shrink-0 text-xs text-gray-500">{getHint(cliente)}</span>}
            </OptionRow>
          ))}
          {canCreate && (
            <OptionRow
              optionId={`${listId}-${results.length}`}
              active={activeIndex === results.length}
              onPick={pickCreate}
              onHover={() => setActiveIndex(results.length)}
            >
              <span className="flex items-center gap-2 font-semibold text-rosewood">
                <Plus className="h-4 w-4" aria-hidden="true" /> Crear cliente «{trimmedQuery}»
              </span>
            </OptionRow>
          )}
          {optionCount === 0 && <li className="px-3 py-2 text-sm text-gray-500">No hay clientes para mostrar.</li>}
        </ul>,
        document.body,
      )}
    </div>
  );
};

export default ClientCombobox;
