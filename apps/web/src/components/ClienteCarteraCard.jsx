const ClienteCarteraCard = ({
  cliente,
  onRegistrarAbono,
  onVerDetalle,
  onEnviarWhatsapp,
  canRegistrarAbono = true,
}) => {
  const deudaActual = Number(cliente.deuda_total ?? 0);

  let indicatorColor, indicatorBg, indicatorLabel;
  if (deudaActual === 0) {
    indicatorColor = '#10b981';
    indicatorBg = '#ecfdf5';
    indicatorLabel = 'Al Día';
  } else if (deudaActual <= 200000) {
    indicatorColor = '#f59e0b';
    indicatorBg = '#fffbeb';
    indicatorLabel = 'Alerta';
  } else {
    indicatorColor = '#ef4444';
    indicatorBg = '#fef2f2';
    indicatorLabel = 'Moroso';
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 hover:shadow-xl transition-shadow border border-gray-100 h-full">
      <div className="flex justify-between items-start mb-6">
        <div className="flex-1">
          <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1 leading-tight">{cliente.nombre}</h3>
          <p className="text-gray-600 text-base sm:text-lg">Cédula: {cliente.documento || 'N/A'}</p>
          <p className="text-gray-500 text-sm mt-1">WhatsApp: {cliente.telefono_whatsapp || 'No registrado'}</p>
        </div>
        <div
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex flex-col items-center justify-center text-center shrink-0 font-bold"
          style={{ backgroundColor: indicatorBg, color: indicatorColor }}
        >
          {indicatorLabel}
        </div>
      </div>

      <hr className="my-4 border-gray-200" />

      <div className="space-y-4 mb-6">
        <div
          className="rounded-lg p-4 border-2"
          style={{
            backgroundColor: indicatorBg,
            borderColor: indicatorColor,
          }}
        >
          <p className="text-sm font-semibold uppercase mb-1" style={{ color: indicatorColor }}>
            SALDO PENDIENTE
          </p>
          <p className="text-3xl sm:text-4xl font-bold" style={{ color: indicatorColor }}>
            ${deudaActual.toLocaleString('es-CO')}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mt-auto">
        <button
          onClick={() => onEnviarWhatsapp(cliente)}
          disabled={!cliente.telefono_whatsapp}
          className="flex-1 border-2 border-emerald-400 text-emerald-700 py-3 sm:py-4 rounded-xl font-bold text-base sm:text-lg hover:bg-emerald-50 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          title={cliente.telefono_whatsapp ? 'Enviar mensaje por WhatsApp' : 'Cliente sin teléfono registrado'}
        >
          📲 WHATSAPP
        </button>
        {canRegistrarAbono && (
          <button
            onClick={() => onRegistrarAbono(cliente)}
            className="flex-1 bg-rosewood text-white py-3 sm:py-4 rounded-xl font-bold text-base sm:text-lg hover:bg-opacity-90 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            💰 REGISTRAR ABONO
          </button>
        )}
        <button
          onClick={() => onVerDetalle(cliente)}
          className={`border-2 border-rosewood text-rosewood py-3 sm:py-4 rounded-xl font-bold text-base sm:text-lg hover:bg-blush-100 transition-all active:scale-95 flex items-center justify-center gap-2 ${
            canRegistrarAbono ? 'flex-1' : 'w-full'
          }`}
        >
          📝 VER DETALLES
        </button>
      </div>
    </div>
  );
};

export default ClienteCarteraCard;
