import { createFileRoute } from "@tanstack/react-router";
import { ProductsScreen } from "@/components/products-screen";

export const Route = createFileRoute("/products/")({
  component: ProductsScreen,
});
