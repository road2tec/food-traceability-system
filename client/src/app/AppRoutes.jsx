import { Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../features/auth/ProtectedRoute';
import PublicLayout from '../layouts/PublicLayout';
import DashboardLayout from '../layouts/DashboardLayout';
import LandingPage from '../pages/public/LandingPage';
import VerifyPage from '../pages/public/VerifyPage';
import ScanPage from '../pages/public/ScanPage';
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import { ForbiddenPage, NotFoundPage } from '../pages/ErrorPages';
import DashboardHome from '../pages/ops/DashboardHome';
import BatchesPage from '../pages/batches/BatchesPage';
import BatchNewPage from '../pages/batches/BatchNewPage';
import BatchDetailPage from '../pages/batches/BatchDetailPage';
import CheckpointPage from '../pages/ops/CheckpointPage';
import TransfersPage from '../pages/ops/TransfersPage';
import ImportPage from '../pages/ops/ImportPage';
import AnalyticsPage from '../pages/ops/AnalyticsPage';
import AlertsPage from '../pages/ops/AlertsPage';
import UsersPage from '../pages/admin/UsersPage';
import OrganisationsPage from '../pages/admin/OrganisationsPage';
import ProductTypesPage from '../pages/admin/ProductTypesPage';
import QuarantinePage from '../pages/admin/QuarantinePage';
import AuditPage from '../pages/admin/AuditPage';
import ModelsPage from '../pages/admin/ModelsPage';
import ReportsPage from '../pages/admin/ReportsPage';

const ADMIN = ['ADMIN'];
const HANDLERS = ['DISTRIBUTOR', 'WAREHOUSE', 'RETAILER'];
const NON_ADMIN = ['PRODUCER', ...HANDLERS];

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/verify/:batchId" element={<VerifyPage />} />
        <Route path="/forbidden" element={<ForbiddenPage />} />
      </Route>

      <Route path="/app" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<DashboardHome />} />
        <Route path="batches" element={<BatchesPage />} />
        <Route path="batches/new" element={<ProtectedRoute roles={['PRODUCER']}><BatchNewPage /></ProtectedRoute>} />
        <Route path="batches/:batchId" element={<BatchDetailPage />} />
        <Route path="transfers" element={<ProtectedRoute roles={NON_ADMIN}><TransfersPage /></ProtectedRoute>} />
        <Route path="checkpoints/new" element={<ProtectedRoute roles={HANDLERS}><CheckpointPage /></ProtectedRoute>} />
        <Route path="imports" element={<ProtectedRoute roles={HANDLERS}><ImportPage /></ProtectedRoute>} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="admin/users" element={<ProtectedRoute roles={ADMIN}><UsersPage /></ProtectedRoute>} />
        <Route path="admin/organisations" element={<ProtectedRoute roles={ADMIN}><OrganisationsPage /></ProtectedRoute>} />
        <Route path="admin/product-types" element={<ProtectedRoute roles={ADMIN}><ProductTypesPage /></ProtectedRoute>} />
        <Route path="admin/quarantine" element={<ProtectedRoute roles={ADMIN}><QuarantinePage /></ProtectedRoute>} />
        <Route path="admin/audit" element={<ProtectedRoute roles={ADMIN}><AuditPage /></ProtectedRoute>} />
        <Route path="admin/models" element={<ProtectedRoute roles={ADMIN}><ModelsPage /></ProtectedRoute>} />
        <Route path="admin/reports" element={<ProtectedRoute roles={ADMIN}><ReportsPage /></ProtectedRoute>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="*" element={<PublicLayout />}>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
