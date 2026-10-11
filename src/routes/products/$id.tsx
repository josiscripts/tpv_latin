import { createFileRoute } from "@tanstack/react-router";
import { ProductDetailScreen } from "@/components/product-detail-screen";

export const Route = createFileRoute("/products/$id")({
  component: ProductDetailScreen,
  head: () => ({
    meta: [
      { title: "Producto — TPV PRO" },
      { name: "description", content: "Detalle del producto" },
    ],
  }),
});
