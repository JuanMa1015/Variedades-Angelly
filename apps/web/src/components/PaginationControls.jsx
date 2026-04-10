import { ChevronLeft, ChevronRight } from 'lucide-react';

const PaginationControls = ({ currentPage, totalPages, onPageChange }) => {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 mt-8 pb-6">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="flex items-center gap-1 sm:gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl bg-white border border-gray-300 text-gray-700 text-sm sm:text-base font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
      >
        <ChevronLeft size={20} className="sm:w-6 sm:h-6" />
        Anterior
      </button>

      <div className="text-sm sm:text-lg font-bold text-gray-900 min-w-max order-3 sm:order-none w-full sm:w-auto text-center">
        Página <span className="text-rosewood">{currentPage}</span> de{' '}
        <span className="text-rosewood">{totalPages}</span>
      </div>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="flex items-center gap-1 sm:gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl bg-white border border-gray-300 text-gray-700 text-sm sm:text-base font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
      >
        Siguiente
        <ChevronRight size={20} className="sm:w-6 sm:h-6" />
      </button>
    </div>
  );
};

export default PaginationControls;
