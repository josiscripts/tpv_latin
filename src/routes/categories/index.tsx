import { createFileRoute } from "@tanstack/react-router";
import { CategoriesScreen } from "@/components/categories-screen";

export const Route = createFileRoute("/categories/")({
  component: CategoriesScreen,
});
