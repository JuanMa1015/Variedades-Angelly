import { Plus } from 'lucide-react';

const AdminSection = ({ title, description, onCreate, children }) => (
  <section className="rounded-[28px] border border-blush-300/70 bg-white/90 p-4 shadow-[0_20px_50px_rgba(106,63,67,0.08)] backdrop-blur sm:p-5">
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-xl font-bold text-rosewood sm:text-2xl">{title}</h2>
        <p className="text-sm text-rosewood/70">{description}</p>
      </div>
      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-blush-300 px-4 py-2 text-sm font-semibold text-rosewood transition hover:bg-blush-300"
        >
          <Plus className="h-4 w-4" />
          Crear
        </button>
      )}
    </div>
    {children}
  </section>
);

export default AdminSection;
