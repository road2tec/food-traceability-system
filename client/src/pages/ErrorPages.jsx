import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/States';
import { Ban, Compass } from 'lucide-react';

export function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20">
      <EmptyState icon={Ban} title="Access denied" message="Your role does not have access to that page." action={<Link to="/app" className="btn-primary">Back to dashboard</Link>} />
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20">
      <EmptyState icon={Compass} title="Page not found" message="The page you are looking for does not exist." action={<Link to="/" className="btn-primary">Go home</Link>} />
    </div>
  );
}
