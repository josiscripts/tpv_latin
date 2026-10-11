import { createFileRoute } from "@tanstack/react-router";
import { CategoryDetailScreen } from "@/components/category-detail-screen";

export const Route = createFileRoute("/categories/$id")({
  component: CategoryDetailScreen,
  head: () => ({
    meta: [
      { title: "Categoría — TPV PRO" },
      { name: "description", content: "Detalle de categoría y productos" },
    ],
  }),
});
