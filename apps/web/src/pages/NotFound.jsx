import { Link } from 'react-router-dom';
import { Home, ShieldQuestion } from 'lucide-react';
import usePageTitle from '../hooks/usePageTitle';

const NotFound = () => {
  usePageTitle('Pagina no encontrada');

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fdf1f1] px-4">
      <div className="w-full max-w-md rounded-3xl border border-blush-300/70 bg-white/90 p-8 text-center shadow-sm">
        <ShieldQuestion className="mx-auto h-12 w-12 text-[#a9646a]" aria-hidden="true" />
        <p className="mt-4 text-5xl font-black text-rosewood">404</p>
        <h1 className="mt-2 text-lg font-bold text-rosewood">Pagina no encontrada</h1>
        <p className="mt-2 text-sm text-rosewood/75">
          La direccion que buscas no existe o fue movida. Verifica el enlace o vuelve al
          inicio.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-blush-300 px-5 py-2.5 text-sm font-semibold text-rosewood transition hover:bg-blush-300/90"
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          Volver al inicio
        </Link>
      </div>
    </main>
  );
};

export default NotFound;
