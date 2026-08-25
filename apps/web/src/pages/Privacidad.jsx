import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import usePageTitle from '../hooks/usePageTitle';
import { CONTACTO, contactoCompleto, SITE } from '../config/site';

const Seccion = ({ titulo, children }) => (
  <section className="space-y-2">
    <h2 className="text-lg font-bold text-rosewood sm:text-xl">{titulo}</h2>
    <div className="space-y-2 text-sm leading-relaxed text-rosewood/85">{children}</div>
  </section>
);

const Privacidad = () => {
  usePageTitle('Politica de Privacidad');

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl bg-[#fdf1f1] px-4 py-10 sm:px-6">
      <article className="rounded-3xl border border-blush-300/70 bg-white/90 p-6 shadow-sm sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#a9646a]">Legal</p>
        <h1 className="mt-1 text-2xl font-black text-rosewood sm:text-3xl">
          Politica de Privacidad y Cookies
        </h1>
        <p className="mt-1 text-sm text-rosewood/70">Ultima actualizacion: agosto de 2026</p>

        <div className="mt-6 space-y-6">
          <Seccion titulo="1. Responsable del tratamiento">
            <p>
              {SITE.name} (en adelante "la Tienda") trata datos personales de clientes y
              usuarios del panel de gestion con domicilio{' '}
              {CONTACTO.direccion ? CONTACTO.direccion : 'declarado en el establecimiento'}
              {CONTACTO.email && (
                <>
                  {' '}y correo de contacto{' '}
                  <a
                    href={`mailto:${CONTACTO.email}`}
                    className="font-semibold text-rosewood underline underline-offset-2 hover:text-rosewood/80"
                  >
                    {CONTACTO.email}
                  </a>
                </>
              )}
              .
            </p>
            {!contactoCompleto() && import.meta.env.DEV && (
              <p className="rounded-xl bg-blush-50 px-3 py-2 text-xs text-[#8b5a5f]">
                (Pendiente: completa VITE_CONTACTO_DIRECCION / TELEFONO / EMAIL en el archivo
                .env para mostrar la informacion de contacto real.)
              </p>
            )}
          </Seccion>

          <Seccion titulo="2. Datos que recopilamos">
            <ul className="list-disc space-y-1 pl-5">
              <li>Datos de clientes de tienda y cartera: nombre, documento y telefono de WhatsApp.</li>
              <li>Datos de ventas, abonos, fiados y facturas asociados a cada cliente.</li>
              <li>Usuarios del sistema: nombre de usuario y contrasena almacenada unicamente como hash bcrypt.</li>
              <li>Imagenes de productos que los empleados suben al sistema.</li>
            </ul>
            <p>
              No recopilamos datos sensibles, ni datos de tarjetas de credito o debito.
            </p>
          </Seccion>

          <Seccion titulo="3. Finalidad del tratamiento">
            <p>
              Los datos se usan exclusivamente para la operacion del negocio: registrar
              ventas y pagos, gestionar creditos (fiado y cartera), controlar inventario,
              emitir recibos y atender solicitudes de clientes.
            </p>
          </Seccion>

          <Seccion titulo="4. Uso de cookies">
            <p>
              El panel utiliza unicamente <strong>cookies esenciales</strong> de sesion
              (<code>access_token</code> y <code>refresh_token</code>), necesarias para
              mantener tu autenticacion. Estas cookies son httpOnly, no son accesibles por
              javascript y no se comparten con terceros.
            </p>
            <p>
              No utilizamos cookies publicitarias, de analisis de terceros activadas por
              defecto, ni rastreo entre sitios. Puedes cerrar sesion para eliminarlas; sin
              ellas el sistema simplemente no puede mantenerte autenticado.
            </p>
          </Seccion>

          <Seccion titulo="5. Seguridad">
            <ul className="list-disc space-y-1 pl-5">
              <li>Contrasenas cifradas con bcrypt; nunca se guardan en texto plano.</li>
              <li>Tokens de sesion firmados (JWT) transportados en cookies httpOnly y SameSite.</li>
              <li>Comunicacion cifrada (HTTPS) en produccion.</li>
              <li>Acceso restringido por roles (vendedor, administrador, superadministrador).</li>
            </ul>
          </Seccion>

          <Seccion titulo="6. Derechos del titular">
            <p>
              Conforme a la normativa aplicable de proteccion de datos (Ley 1581 de 2012 y
              decretos reglamentarios en Colombia), puedes solicitar el acceso, la
              actualizacion, la rectificacion o la supresion de tus datos personales
              contactando a la Tienda en el telefono o correo indicados arriba.
            </p>
          </Seccion>

          <Seccion titulo="7. Conservacion">
            <p>
              Los registros comerciales (ventas, abonos, facturas) se conservan mientras
              existan obligaciones contables. Las demas informaciones se eliminan cuando el
              cliente lo solicita y no exista obligacion legal de conservarlas.
            </p>
          </Seccion>

          <p className="text-xs text-rosewood/60">
            Consulta tambien nuestros{' '}
            <Link to="/terminos" className="font-semibold underline hover:text-[#7c3f44]">
              Terminos y Condiciones
            </Link>
            .
          </p>

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

export default Privacidad;
