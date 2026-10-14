import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { PageSpinner } from '../../components/ui/States';

/**
 * Route guard. UI gating is a convenience only - the server enforces authorization.
 * `roles` omitted = any authenticated user.
 */
export default function ProtectedRoute({ roles, children }) {
  const { isAuthenticated, role, booting } = useAuth();
  const location = useLocation();

  if (booting) return <PageSpinner label="Checking your session" />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (roles && !roles.includes(role)) return <Navigate to="/forbidden" replace />;
  return children || <Outlet />;
}
