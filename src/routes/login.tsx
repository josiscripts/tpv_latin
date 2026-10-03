import { createFileRoute } from '@tanstack/react-router';
import { LoginScreen } from '@/components/login-screen';

export const Route = createFileRoute('/login')({
  head: () => ({
    meta: [
      { title: 'Iniciar sesión — TPV PRO' },
      { name: 'description', content: 'Iniciar sesión en el sistema TPV PRO.' },
    ],
  }),
  component: LoginScreen,
});
