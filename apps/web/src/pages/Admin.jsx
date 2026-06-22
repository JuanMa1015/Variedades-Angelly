import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import TabNavigation from '../components/TabNavigation';
import DataTable from '../components/DataTable';
import ErrorMessage from '../components/ErrorMessage';
import { useAdminCrud } from './admin/useAdminCrud';
import { useTabSections } from './admin/useTabSections';
import { MODULE_LABELS, ENDPOINTS, ROLE_GROUPS } from './admin/constants';
import { InformesSection } from './admin/InformesSection';
import { DIALOG_MAP } from './admin/components/CreateDialogs';
import { moduleReducer, initialModuleState } from './admin/moduleReducer';

const Admin = () => {
  const { user } = useAuth();
  const currentRole = user?.role ?? 'vendedor';
  const tabs = ROLE_GROUPS[currentRole] ?? ['productos'];
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [state, dispatch] = useReducer(moduleReducer, initialModuleState);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState('');
  const isFirstRender = useRef(true);

  const clearError = useCallback(() => setError(''), []);

  const { handleEdit, handleDelete, handleToggle } = useAdminCrud(dispatch, setError);

  const loadData = useCallback(async (tab) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true, module: tab });
      const endpoint = ENDPOINTS[tab];
      if (!endpoint) {
        dispatch({ type: 'SET_LOADING', payload: false, module: tab });
        return;
      }
      const { apiGet } = await import('../api/httpClient');
      const data = await apiGet(endpoint, { skipCache: true });
      dispatch({
        type: 'SET_DATA',
        payload: { module: tab, data, showInactive: data.some((item) => item.activo === false || item.activo === 0) },
      });
    } catch (err) {
      setError(err.message || 'Error al cargar datos');
      dispatch({ type: 'SET_LOADING', payload: false, module: tab });
    }
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    loadData(activeTab);
  }, [activeTab, loadData]);

  useEffect(() => {
    loadData(activeTab);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sections = useTabSections(searchTerm, showInactive);

  const section = sections[activeTab];
  const data = state[activeTab]?.data ?? [];
  const loading = state[activeTab]?.loading ?? false;
  const CreateDialog = DIALOG_MAP[activeTab];

  const refreshAfterMutation = useCallback(() => {
    loadData(activeTab);
  }, [activeTab, loadData]);

  const handleTabChange = useCallback((tab) => {
    setSearchTerm('');
    setActiveTab(tab);
  }, []);

  const activeFilters = useMemo(() => {
    const filters = [];
    if (searchTerm) filters.push(`búsqueda: "${searchTerm}"`);
    if (showInactive) filters.push('mostrando inactivos');
    return filters;
  }, [searchTerm, showInactive]);

  const isInformes = activeTab === 'informes';

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-gray-50 via-white to-blush-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <TabNavigation tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange} labels={MODULE_LABELS} />

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeFilters.map((filter) => (
              <span key={filter} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-rosewood/10 text-rosewood">
                {filter}
              </span>
            ))}
          </div>
        )}

        <ErrorMessage message={error} onDismiss={clearError} />

        {isInformes ? (
          <InformesSection />
        ) : (
          <>
            {data.length > 0 && !loading && data.some((item) => item.activo === false || item.activo === 0) && (
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-rosewood focus:ring-rosewood"
                />
                Mostrar inactivos
              </label>
            )}

            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="relative w-full sm:w-80 order-2 sm:order-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder={`Buscar en ${MODULE_LABELS[activeTab]?.toLowerCase() ?? activeTab}...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-gray-200 bg-white focus:outline-none focus:border-rosewood transition"
                />
              </div>
              <div className="flex gap-2 order-1 sm:order-2">
                <Suspense fallback={null}>
                  {CreateDialog && (
                    <CreateDialog onSuccess={refreshAfterMutation} />
                  )}
                </Suspense>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-rosewood" />
              </div>
            ) : section ? (
              <DataTable
                columns={section.columns}
                data={data}
                onEdit={section.onEdit ?? handleEdit}
                onDelete={section.onDelete ?? handleDelete}
                onToggle={section.onToggle}
                renderRowMenu={section.renderRowMenu}
              />
            ) : (
              <p className="text-center text-gray-500 py-8">Módulo no implementado.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Admin;
