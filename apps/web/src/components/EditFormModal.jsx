import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const EditFormModal = ({ isOpen, title, fields, initialValues, onSave, onClose }) => {
  const [formValues, setFormValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const firstInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setFormValues({ ...initialValues });
      setError('');
      setSaving(false);
      setTimeout(() => firstInputRef.current?.focus(), 100);
    }
  }, [isOpen, initialValues]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSave(formValues);
      onClose();
    } catch (err) {
      setError(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (name, value) => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map((field, i) => (
            <div key={field.name}>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                {field.label}
                {field.required && <span className="ml-1 text-red-500">*</span>}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  ref={i === 0 ? firstInputRef : null}
                  value={formValues[field.name] ?? ''}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm transition focus:border-[#eebbbb] focus:outline-none focus:ring-2 focus:ring-[#fbe3e3]"
                  rows={3}
                />
              ) : (
                <input
                  ref={i === 0 ? firstInputRef : null}
                  type={field.type || 'text'}
                  value={formValues[field.name] ?? ''}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm transition focus:border-[#eebbbb] focus:outline-none focus:ring-2 focus:ring-[#fbe3e3]"
                />
              )}
            </div>
          ))}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#fbe3e3]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-[#eebbbb] px-4 py-2 text-sm font-semibold text-[#6a3f43] transition hover:bg-[#f6c8c7] disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditFormModal;
