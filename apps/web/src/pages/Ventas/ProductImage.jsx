import { useState } from 'react';
import { DEFAULT_TINT, getInitials, getProductVisual, resolveImageUrl } from './productVisuals';

// Foto del producto; si no existe o no carga (p. ej. se perdio del servidor) muestra un
// recuadro de color con un icono o con las iniciales, nunca una imagen rota.
const ProductImage = ({ producto, iconClass = 'text-4xl' }) => {
  const [failedUrl, setFailedUrl] = useState(null);
  const url = resolveImageUrl(producto.imagen_url);
  const visual = getProductVisual(producto.nombre);
  const showPhoto = Boolean(url) && failedUrl !== url;

  return (
    <div className={`absolute inset-0 ${visual?.tint ?? DEFAULT_TINT}`}>
      {showPhoto ? (
        <img
          src={url}
          alt={producto.nombre}
          loading="lazy"
          onError={() => setFailedUrl(url)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center" aria-hidden="true">
          {visual ? (
            <span className={iconClass}>{visual.icon}</span>
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/80 text-lg font-bold tracking-wide text-rosewood shadow-sm">
              {getInitials(producto.nombre)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default ProductImage;
