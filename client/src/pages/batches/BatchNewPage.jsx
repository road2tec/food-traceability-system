import BatchForm from '../../features/batches/BatchForm';
import { PageHeader } from '../../components/ui/Cards';

export default function BatchNewPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Register a batch" subtitle="A unique batch ID and QR code are generated when you submit." />
      <BatchForm />
    </div>
  );
}
