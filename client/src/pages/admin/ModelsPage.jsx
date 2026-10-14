import { useApi } from '../../hooks/useApi';
import * as adminService from '../../services/adminService';
import DataTable from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/Cards';
import { formatDate, formatNumber } from '../../utils/format';
import { asList } from '../../utils/normalize';

export default function ModelsPage() {
  const { data, loading, error, reload } = useApi(adminService.listModels, []);
  const m = (r, k) => (r.metrics ? formatNumber(r.metrics[k], 3) : '—');
  const columns = [
    { key: 'version', header: 'Version' },
    { key: 'type', header: 'Type' },
    { key: 'trainedAt', header: 'Trained', render: (r) => formatDate(r.trainedAt) },
    { key: 'dataset', header: 'Dataset', render: (r) => r.datasetSource || '—' },
    { key: 'licence', header: 'Licence', render: (r) => r.datasetLicence || '—' },
    { key: 'mae', header: 'MAE', render: (r) => m(r, 'mae') },
    { key: 'rmse', header: 'RMSE', render: (r) => m(r, 'rmse') },
    { key: 'r2', header: 'R²', render: (r) => m(r, 'r2') },
    { key: 'demo', header: 'Use', render: (r) => (r.demonstrationOnly ? <span className="text-amber-700">Demonstration only</span> : 'Validated') },
  ];
  return (
    <>
      <PageHeader title="Model versions" subtitle="Freshness prediction models and their evaluation metrics." />
      <DataTable
        caption="Model versions" columns={columns} rows={asList(data)} loading={loading} error={error} onRetry={reload}
        rowKey={(r) => r._id || r.version} emptyTitle="No model versions" emptyMessage="Model versions appear after the AI service reports them."
      />
    </>
  );
}
