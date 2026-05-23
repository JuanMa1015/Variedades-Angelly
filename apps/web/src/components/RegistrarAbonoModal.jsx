import { X, DollarSign } from 'lucide-react';
import { useState } from 'react';
import ErrorMessage from './ErrorMessage';
import SuccessMessage from './SuccessMessage';

const RegistrarAbonoModal = ({ cliente, isOpen, onClose, onConfirm }) => {
  const [monto, setMonto] = useState('');
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!monto || isNaN(monto) || Number(monto) <= 0) {
      alert('Por favor ingresa un monto válido');
      return;
    }

    setLoading(true);
    await onConfirm(Number(monto), metodoPago);
    setLoading(false);
    setMonto('');
    setMetodoPago('efectivo');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold text-gray-900">Registrar Abono</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition"
          >
            <X size={28} />
          </button>
        </div>

        {/* Cliente Info */}
        <div className="bg-gray-50 rounded-xl p-4 mb-6">
          <p className="text-gray-600 text-sm mb-1">Cliente:</p>
          <p className="text-2xl font-bold text-gray-900">{cliente.nombre}</p>
          <p className="text-gray-600 mt-2">Saldo pendiente: <span className="font-bold text-lg">${Number(cliente.deuda_total ?? 0).toLocaleString('es-CO')}</span></p>
        </div>

        {/* Input */}
        <div className="mb-6">
          <label className="block text-lg font-semibold text-gray-700 mb-3">
            Monto del Abono
          </label>
          <div className="relative">
            <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={24} />
            <input
              type="number"
              min="0"
              step="100"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="Ingresa el monto"
              className="w-full pl-12 pr-4 py-4 text-2xl font-bold border-2 border-gray-300 rounded-xl focus:outline-none focus:border-rosewood"
            />
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Método de pago</label>
          <select
            value={metodoPago}
            onChange={(event) => setMetodoPago(event.target.value)}
            className="w-full rounded-xl border-2 border-gray-300 bg-white px-4 py-3 focus:outline-none focus:border-rosewood"
          >
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
          </select>
        </div>

        {/* Botones */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 bg-gray-200 text-gray-700 font-bold text-lg rounded-xl hover:bg-gray-300 transition active:scale-95"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !monto}
            className="flex-1 py-3 px-4 bg-rosewood text-white font-bold text-lg rounded-xl hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition active:scale-95"
          >
            {loading ? 'Guardando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RegistrarAbonoModal;
