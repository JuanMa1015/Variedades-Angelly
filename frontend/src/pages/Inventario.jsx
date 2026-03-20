import { Package, AlertTriangle } from 'lucide-react';

const Inventario = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Package className="w-8 h-8 text-rosewood" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inventario</h1>
          <p className="text-gray-600">Gestión de Stock y Productos</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6 border-t-4 border-rosewood">
          <h3 className="text-sm font-semibold text-gray-600 uppercase mb-2">Productos Total</h3>
          <p className="text-3xl font-bold text-gray-900">0</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border-t-4 border-gold-100">
          <h3 className="text-sm font-semibold text-gray-600 uppercase mb-2">Stock Total</h3>
          <p className="text-3xl font-bold text-gray-900">0 u</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border-t-4 border-orange-200 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-600 uppercase mb-2">Bajo Stock</h3>
            <p className="text-3xl font-bold text-orange-600">0</p>
          </div>
          <AlertTriangle className="w-6 h-6 text-orange-500" />
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Productos</h2>
          <button className="px-4 py-2 bg-rosewood text-white rounded-lg hover:bg-opacity-90 transition-colors">
            Agregar Producto
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Producto</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Stock Actual</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Mínimo</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">P. Venta</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100 hover:bg-gray-50">
                <td colSpan="4" className="text-center py-8 text-gray-500">
                  No hay productos registrados
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Inventario;
