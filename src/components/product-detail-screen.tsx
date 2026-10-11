import { useParams, useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useProduct } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";
import { Button } from "@/components/ui/button";
import { getStorageImageUrl, money } from "./pos-ui";

export function ProductDetailScreen() {
  const { id } = useParams({ from: "/products/$id" as const });
  const navigate = useNavigate();
  const search = useSearch({ from: "/products/$id" as const });
  const categoryId = (search as any)?.categoryId;
  const { data: product, isLoading } = useProduct(id);
  const { data: categories = [] } = useCategories();

  if (isLoading) {
    return <div className="p-8">Cargando...</div>;
  }

  if (!product) {
    return (
      <div className="p-8">
        <div className="text-center">
          <p className="text-muted-foreground">Producto no encontrado</p>
          <p className="text-xs text-muted-foreground mt-2">ID: {id || 'undefined'}</p>
          <button
            className="mt-4 px-4 py-2 text-sm bg-primary text-primary-foreground rounded"
            onClick={() => navigate({ to: categoryId ? `/categories/${categoryId}` : '/products' })}
          >
            {categoryId ? 'Volver a categoría' : 'Volver a productos'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 border-b bg-card p-6">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: categoryId ? `/categories/${categoryId}` : "/products" })}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{product.name}</h1>
        </div>
      </div>

      <div className="space-y-6 p-6">
        <div className="flex justify-center bg-muted rounded-lg p-8">
          <div className="aspect-square w-64 flex items-center justify-center">
            {product.image ? (
              <img
                src={getStorageImageUrl(product.image)}
                alt={product.name}
                className="w-full h-full object-contain rounded-md"
              />
            ) : (
              <div className="flex items-center justify-center text-muted-foreground text-sm">
                Sin imagen
              </div>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-3">Información del producto</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">SKU:</span>
              <span className="font-mono">{product.sku || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Código de barras:</span>
              <span className="font-mono">{product.barcode || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Categoría:</span>
              <span>{categories.find(c => c.id === product.category_id)?.name || "—"}</span>
            </div>
          </div>
        </div>

        {product.description && (
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3">Descripción</h3>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{product.description}</p>
          </div>
        )}

        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold mb-3">Información comercial</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Precio de venta:</span>
              <span className="font-semibold">{money(Number(product.sale_price))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Coste:</span>
              <span className="font-semibold">{product.cost_price !== null ? money(Number(product.cost_price)) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Beneficio:</span>
              <span className="font-semibold text-success">{product.cost_price !== null ? money(Number(product.sale_price) - Number(product.cost_price)) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA:</span>
              <span className="font-semibold">{product.tax_rate !== null ? `${product.tax_rate}%` : "—"}</span>
            </div>
          </div>
        </div>

        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold mb-3">Inventario</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Stock actual:</span>
              <span className="font-semibold">{product.stock} unidades</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Stock mínimo:</span>
              <span className="font-semibold">{product.min_stock}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Peso:</span>
              <span className="font-semibold">{product.weight_kg !== null && product.weight_kg > 0 ? `${Number(product.weight_kg).toFixed(2)} kg` : "—"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
