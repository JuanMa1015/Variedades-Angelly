import { Link } from 'react-router-dom';
import { CheckCircle2, Copy } from 'lucide-react';
import { useState } from 'react';
import usePageTitle from '../hooks/usePageTitle';

const env = import.meta.env;

const DATOS_PAGO = [
  { etiqueta: `${env.VITE_COBRO_BANCO ?? 'Banco'} · ${env.VITE_COBRO_TIPO_CUENTA ?? 'Cuenta'}`, valor: env.VITE_COBRO_NUMERO_CUENTA ?? '', titular: env.VITE_COBRO_TITULAR_CUENTA ?? '' },
  { etiqueta: 'Nequi', valor: env.VITE_COBRO_NEQUI_NUMERO ?? '', titular: env.VITE_COBRO_NEQUI_TITULAR ?? '' },
].filter((item) => item.valor);

const FilaPago = ({ etiqueta, valor, titular }) => {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Portapapeles no disponible; el numero queda visible en pantalla.
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-blush-300/70 bg-white px-4 py-3">
      <div className="text-left">
        <p className="text-xs uppercase tracking-wide text-[#8b5a5f]">{etiqueta}</p>
        <p className="font-mono text-base font-bold text-rosewood">{valor}</p>
        {titular && <p className="text-xs text-rosewood/70">{titular}</p>}
      </div>
      <button
        type="button"
        onClick={copiar}
        aria-label={`Copiar ${etiqueta}`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-blush-300 px-3 py-1.5 text-xs font-semibold text-rosewood transition hover:bg-blush-50"
      >
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
};

const Gracias = () => {
  usePageTitle('Gracias por tu compra');

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fdf1f1] px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-blush-300/70 bg-white/90 p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-14 w-14 text-green-600" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-black text-rosewood sm:text-3xl">
          Gracias por tu compra
        </h1>
        <p className="mt-2 text-sm text-rosewood/80">
          Tu registro quedo guardado en el sistema. Si realizaste tu pago por transferencia,
          estos son los datos oficiales de la tienda:
        </p>

        {DATOS_PAGO.length > 0 ? (
          <div className="mt-5 space-y-3">
            {DATOS_PAGO.map((item) => (
              <FilaPago key={item.etiqueta} {...item} />
            ))}
          </div>
        ) : null}

        <p className="mt-5 text-xs text-rosewood/60">
          Guarda tu comprobante. Consulta nuestros{' '}
          <Link to="/terminos" className="font-semibold underline hover:text-[#7c3f44]">
            Terminos y Condiciones
          </Link>
          .
        </p>
      </div>
    </main>
  );
};

export default Gracias;
