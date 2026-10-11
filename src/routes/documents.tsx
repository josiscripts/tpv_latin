import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/documents')({
  head: () => ({
    meta: [
      { title: 'Documentos — TPV PRO' },
      { name: 'description', content: 'Gestión de facturas y albaranes.' },
      { property: 'og:title', content: 'Documentos — TPV PRO' },
      { property: 'og:description', content: 'Gestión de facturas y albaranes.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: Outlet,
});
