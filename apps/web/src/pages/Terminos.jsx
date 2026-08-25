import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import usePageTitle from '../hooks/usePageTitle';
import { CONTACTO } from '../config/site';

const Seccion = ({ titulo, children }) => (
  <section className="space-y-2">
    <h2 className="text-lg font-bold text-rosewood sm:text-xl">{titulo}</h2>
    <div className="space-y-2 text-sm leading-relaxed text-rosewood/85">{children}</div>
  </section>
);

const Terminos = () => {
  usePageTitle('Terminos y Condiciones');

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl bg-[#fdf1f1] px-4 py-10 sm:px-6">
      <article className="rounded-3xl border border-blush-300/70 bg-white/90 p-6 shadow-sm sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#a9646a]">Legal</p>
        <h1 className="mt-1 text-2xl font-black text-rosewood sm:text-3xl">
          Terminos y Condiciones de Uso
        </h1>
        <p className="mt-1 text-sm text-rosewood/70">Ultima actualizacion: agosto de 2026</p>

        <div className="mt-6 space-y-6">
          <Seccion titulo="1. Objeto">
            <p>
              Estos terminos regulan el uso del panel de gestion de Variedades Angelly por
              parte de su personal autorizado, asi como las condiciones generales de las
              operaciones comerciales registradas en el sistema (ventas de contado, ventas a
              credito o "fiado", abonos y devoluciones).
            </p>
          </Seccion>

          <Seccion titulo="2. Acceso y uso del panel">
            <ul className="list-disc space-y-1 pl-5">
              <li>El acceso requiere credenciales entregadas por la gerencia.</li>
              <li>Cada usuario responde por la confidencialidad de su contrasena.</li>
              <li>Las acciones quedan registradas con fines de auditoria interna.</li>
              <li>Queda prohibido compartir cuentas o acceder desde equipos no autorizados.</li>
            </ul>
          </Seccion>

          <Seccion titulo="3. Ventas a credito (fiado) y cartera">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                El credito es una facilidad voluntaria otorgada por la Tienda y esta limitada
                por el cupo asignado a cada cliente.
              </li>
              <li>Los abonos se acreditan al momento de su registro en el sistema.</li>
              <li>La mora puede implicar la suspension de nuevos creditos.</li>
            </ul>
          </Seccion>

          <Seccion titulo="4. Pagos por transferencia">
            <p>
              Los pagos por transferencia o Nequi deben realizarse a las cuentas oficiales
              informadas por la Tienda en el momento de la compra. La Tienda no se hace
              responsable de pagos efectuados a cuentas distintas de las oficiales.
            </p>
          </Seccion>

          <Seccion titulo="5. Devoluciones y garantias">
            <p>
              Las devoluciones se aceptan conforme a la politica informada en el
              establecimiento y dentro de los plazos legales aplicables, siempre que el
              producto conserve sus condiciones originales.
            </p>
          </Seccion>

          <Seccion titulo="6. Propiedad intelectual y datos">
            <p>
              La informacion comercial registrada en el sistema es propiedad de Variedades
              Angelly. El tratamiento de datos personales se rige por nuestra{' '}
              <Link to="/privacidad" className="font-semibold underline hover:text-[#7c3f44]">
                Politica de Privacidad
              </Link>
              .
            </p>
          </Seccion>

          <Seccion titulo="7. Modificaciones y contacto">
            <p>
              La Tienda puede actualizar estos terminos publicando la version vigente en
              esta pagina. Para cualquier consulta escribenos a{' '}
              {CONTACTO.email ? (
                <a
                  href={`mailto:${CONTACTO.email}`}
                  className="font-semibold text-rosewood underline underline-offset-2 hover:text-rosewood/80"
                >
                  {CONTACTO.email}
                </a>
              ) : (
                'nuestros canales de contacto'
              )}
              {CONTACTO.telefono && (
                <>
                  {' '}o llamanos al{' '}
                  <a
                    href={`tel:${CONTACTO.telefono.replace(/[^\d+]/g, '')}`}
                    className="font-semibold text-rosewood underline underline-offset-2 hover:text-rosewood/80"
                  >
                    {CONTACTO.telefono}
                  </a>
                </>
              )}
              .
            </p>
          </Seccion>

          <div className="flex justify-center border-t border-blush-300/50 pt-6">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full bg-blush-300 px-5 py-2.5 text-sm font-semibold text-rosewood transition hover:bg-blush-300/90"
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              Volver al inicio
            </Link>
          </div>
        </div>
      </article>
    </main>
  );
};

export default Terminos;
