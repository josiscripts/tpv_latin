import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useLocation,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { PosProvider } from "../components/pos-context";
import { AppShell } from "../components/app-shell";
import { AuthProvider, useAuthContext } from "../components/auth-provider";
import { Toaster } from "../components/ui/sonner";
import { useRealtimeSubscriptions } from "../hooks/useRealtimeSubscriptions";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TPV PRO — Mercado Central" },
      { name: "description", content: "Sistema profesional de punto de venta e inventario para Mercado Central." },
      { name: "author", content: "TPV PRO" },
      { property: "og:title", content: "TPV PRO — Mercado Central" },
      { property: "og:description", content: "Punto de venta, inventario y analítica comercial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RealtimeInitializer({ children }: { children: ReactNode }) {
  useRealtimeSubscriptions();
  return <>{children}</>;
}

function ProtectedLayout() {
  const { isAuthenticated, loading } = useAuthContext();
  const router = useRouter();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !isAuthenticated && location.pathname !== '/login') {
      router.navigate({ to: '/login' });
    }
  }, [isAuthenticated, loading, location.pathname, router]);

  // While loading auth, show loading screen
  if (loading) {
    return <div className="flex h-dvh items-center justify-center bg-background" />;
  }

  // If not authenticated and trying to access protected route, show login
  if (!isAuthenticated) {
    if (location.pathname === '/login') {
      return <Outlet />;
    }
    // Redirect will happen via useEffect above
    return <div className="flex h-dvh items-center justify-center bg-background" />;
  }

  // If authenticated, show the app
  return <AppShell><Outlet /></AppShell>;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeInitializer>
          <PosProvider>
            <ProtectedLayout />
            <Toaster position="bottom-right" richColors />
          </PosProvider>
        </RealtimeInitializer>
      </AuthProvider>
    </QueryClientProvider>
  );
}
