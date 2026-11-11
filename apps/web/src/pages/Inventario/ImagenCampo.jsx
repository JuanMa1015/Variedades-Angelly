import { useState } from 'react';
import { ImageUp, Link, X } from 'lucide-react';
import { IMAGEN_VACIA } from './imagenHelpers';

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rosewood focus:outline-none';
const LABEL = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500';
const API_URL = import.meta.env.VITE_API_URL ?? '';

const MODOS = [
  { id: 'upload', texto: 'Subir archivo', icono: <ImageUp className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'url', texto: 'Pegar URL', icono: <Link className="h-3.5 w-3.5" aria-hidden="true" /> },
];

const urlVisible = (url) => (url.startsWith('http') ? url : `${API_URL}${url}`);

// La imagen puede conservarse, cambiarse (archivo o direccion de internet) o quitarse.
// `actual` es la imagen que ya tiene el producto (si la tiene); `valor` y `onChange` llevan lo que el usuario eligio.
const ImagenCampo = ({ actual = null, valor, onChange }) => {
  const [modo, setModo] = useState('upload');
  const [preview, setPreview] = useState(null);

  const elegirArchivo = (event) => {
    const archivo = event.target.files?.[0];
    if (!archivo) return;
    setPreview(URL.createObjectURL(archivo));
    onChange({ archivo, url: '', quitar: false });
  };
  const deshacer = () => { setPreview(null); onChange(IMAGEN_VACIA); };
  const quitar = () => { setPreview(null); onChange({ archivo: null, url: '', quitar: true }); };

  const mostrada = preview ?? (!valor.quitar && !valor.url && actual ? urlVisible(actual) : null);

  return (
    <div>
      <span className={LABEL}>Imagen</span>
      <div className="mb-2 flex gap-1 rounded-lg border border-gray-300 bg-gray-50 p-0.5">
        {MODOS.map(({ id, texto, icono }) => (
          <button key={id} type="button" onClick={() => setModo(id)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${modo === id ? 'bg-white text-rosewood shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {icono} {texto}
          </button>
        ))}
      </div>
      {modo === 'upload' ? (
        mostrada ? (
          <div className="relative inline-block">
            <img src={mostrada} alt="Imagen del producto" className="h-20 w-20 rounded-lg border border-gray-300 object-cover" />
            <button type="button" onClick={preview ? deshacer : quitar} title={preview ? 'Descartar la nueva imagen' : 'Quitar imagen'} aria-label={preview ? 'Descartar la nueva imagen' : 'Quitar imagen'} className="absolute -right-2 -top-2 rounded-full border border-gray-300 bg-white p-0.5 text-gray-500 hover:text-red-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-500 hover:border-rosewood hover:text-rosewood">
            <ImageUp className="h-4 w-4" aria-hidden="true" />
            <span>{valor.quitar ? 'Sin imagen: elegir una nueva' : 'Seleccionar archivo'}</span>
            <input type="file" accept="image/*" onChange={elegirArchivo} className="hidden" />
          </label>
        )
      ) : (
        <input type="text" value={valor.url} onChange={(e) => { setPreview(null); onChange({ archivo: null, url: e.target.value, quitar: false }); }} placeholder="Pega la dirección de la imagen: se guarda una copia" aria-label="Dirección de la imagen" className={INPUT} />
      )}
    </div>
  );
};

export default ImagenCampo;
