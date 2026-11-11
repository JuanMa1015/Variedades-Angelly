import { Banknote, CreditCard, Receipt, Smartphone, Wallet } from 'lucide-react';
import { formatMoney } from '../../utils/format';

const Tarjeta = ({ icono, titulo, valor, detalle, tono = 'text-gray-900', fondo = 'bg-white' }) => {
  const Icono = icono;
  return (
    <div className={`rounded-2xl border border-gray-200 p-4 shadow-sm ${fondo}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <Icono className="h-4 w-4" aria-hidden="true" /> {titulo}
      </div>
      <p className={`mt-1 text-2xl font-black tabular-nums ${tono}`}>{valor}</p>
      {detalle && <p className="text-xs text-gray-500">{detalle}</p>}
    </div>
  );
};

// Cifras del turno. Cada medio de pago va aparte: el efectivo es lo que debe haber en el cajon,
// transferencias y tarjeta se comparan con el celular y el datafono.
const TurnoResumen = ({ caja }) => (
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    {caja.saldo_esperado != null ? (
      <Tarjeta
        icono={Wallet}
        titulo="Efectivo esperado"
        valor={formatMoney(caja.saldo_esperado)}
        detalle={`${formatMoney(caja.monto_inicial)} inicial + ventas − gastos y compras`}
        tono="text-rosewood"
        fondo="bg-rosewood/5"
      />
    ) : (
      <Tarjeta icono={Wallet} titulo="Efectivo inicial" valor={formatMoney(caja.monto_inicial)} detalle="Al abrir la caja" />
    )}
    <Tarjeta icono={Banknote} titulo="Efectivo" valor={formatMoney(caja.monto_ventas_efectivo)} detalle="Ventas y abonos en efectivo" tono="text-emerald-700" />
    <Tarjeta icono={Smartphone} titulo="Transferencias" valor={formatMoney(caja.monto_ventas_transferencia)} detalle="Nequi y otras" tono="text-blue-700" />
    <Tarjeta icono={CreditCard} titulo="Tarjeta" valor={formatMoney(caja.monto_ventas_tarjeta)} detalle="Datáfono" tono="text-sky-700" />
    <div className="col-span-2 flex items-center gap-2 rounded-xl bg-gray-50 px-4 py-2 text-sm text-gray-600 lg:col-span-4">
      <Receipt className="h-4 w-4 text-red-500" aria-hidden="true" />
      Gastos y compras pagados en efectivo: <strong className="text-red-700">{formatMoney(caja.monto_gastos)}</strong>
    </div>
  </div>
);

export default TurnoResumen;
