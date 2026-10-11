import { createFileRoute } from '@tanstack/react-router';
import { DocumentsScreen } from '@/components/documents-screen';

export const Route = createFileRoute('/documents/')({
  component: DocumentsScreen,
});
