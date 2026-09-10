import { createFileRoute } from "@tanstack/react-router";
import { DashboardScreen } from "@/components/dashboard-screen";

// No head() here: the home route inherits title/description/og/twitter from
// __root.tsx, and ships no og:image so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  head: () => ({meta:[{title:"Panel — TPV PRO"},{name:"description",content:"Resumen diario de ventas, beneficio e inventario."},{property:"og:title",content:"Panel — TPV PRO"},{property:"og:description",content:"Resumen diario de ventas, beneficio e inventario."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),
  component: DashboardScreen,
});
