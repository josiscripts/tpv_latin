import { Grid2X2, List, MoreHorizontal, Pencil, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PageHeader } from "./app-shell";
import { ProductImage, StockBadge, money } from "./pos-ui";
import { usePos } from "./pos-context";
import { useProducts, useCreateProduct, useDeleteProduct } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";
import { useSuppliers } from "@/hooks/useSuppliers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const productSchema = z.object({
  name: z.string().min(1),
  barcode: z.string().optional(),
  sku: z.string().min(1),
  cost_price: z.coerce.number().min(0),
  sale_price: z.coerce.number().min(0),
  stock: z.coerce.number().min(0),
  min_stock: z.coerce.number().min(0),
  category_id: z.string().min(1),
  supplier_id: z.string().optional().nullable(),
});

type ProductFormData = z.infer<typeof productSchema>;

function ProductDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { t } = usePos();
  const [open, setOpen] = useState(false);
  const { data: categories, isLoading: catsLoading } = useCategories();
  const { data: suppliers, isLoading: suppliersLoading } = useSuppliers();
  const createProduct = useCreateProduct();

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
  });

  const onSubmit = async (data: ProductFormData) => {
    try {
      await createProduct.mutateAsync({
        name: data.name,
        barcode: data.barcode || null,
        sku: data.sku,
        cost_price: data.cost_price,
        sale_price: data.sale_price,
        stock: data.stock,
        min_stock: data.min_stock,
        category_id: data.category_id,
        supplier_id: data.supplier_id || null,
        active: true,
      });
      toast.success("Producto creado");
      setOpen(false);
      form.reset();
    } catch (error) {
      toast.error("Error al crear producto");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button><Plus />{t("newProduct")}</Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{t("newProduct")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nombre</Label>
              <Input placeholder="Ej. Inca Kola 300 ml" {...form.register("name")} />
            </div>
            <div>
              <Label>Código de barras</Label>
              <Input placeholder="0000000000000" {...form.register("barcode")} />
            </div>
            <div>
              <Label>SKU</Label>
              <Input placeholder="BEB-000-000" {...form.register("sku")} />
            </div>
            <div>
              <Label>Categoría</Label>
              <Select {...form.register("category_id")}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Costo proveedor</Label>
              <Input type="number" step="0.01" placeholder="0.00" {...form.register("cost_price")} />
            </div>
            <div>
              <Label>Precio venta</Label>
              <Input type="number" step="0.01" placeholder="0.00" {...form.register("sale_price")} />
            </div>
            <div>
              <Label>Stock inicial</Label>
              <Input type="number" step="0.01" placeholder="0" {...form.register("stock")} />
            </div>
            <div>
              <Label>Stock mínimo</Label>
              <Input type="number" step="0.01" placeholder="0" {...form.register("min_stock")} />
            </div>
            <div className="col-span-2">
              <Label>Proveedor</Label>
              <Select {...form.register("supplier_id")}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers?.map((sup) => (
                    <SelectItem key={sup.id} value={sup.id}>{sup.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button type="submit" disabled={createProduct.isPending}>
              {createProduct.isPending ? "Guardando..." : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProductsScreen() {
  const [grid, setGrid] = useState(false);
  const [q, setQ] = useState("");
  const { t } = usePos();
  const { data: products = [], isLoading } = useProducts();
  const deleteProduct = useDeleteProduct();

  const getStockState = (stock: number, minStock: number) => {
    if (stock === 0) return "out";
    if (stock <= minStock) return "critical";
    if (stock <= minStock * 1.5) return "low";
    return "ok";
  };

  const filtered = q
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(q.toLowerCase()) ||
          p.sku.toLowerCase().includes(q.toLowerCase()) ||
          (p.barcode?.includes(q) ?? false)
      )
    : products;

  const handleDelete = async (id: string) => {
    try {
      await deleteProduct.mutateAsync(id);
      toast.success("Producto eliminado");
    } catch (error) {
      toast.error("Error al eliminar producto");
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">Cargando productos...</div>;
  }

  return (
    <>
      <PageHeader title={t("products")} subtitle={`Catálogo de ${filtered.length} productos`} action={<ProductDialog />} />
      <div className="mb-4 flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
            placeholder="Buscar por nombre, código o SKU"
          />
        </div>
        <Button variant="outline" disabled>
          <SlidersHorizontal />
          Filtros
        </Button>
        <div className="ml-auto flex rounded-md border bg-card p-1">
          <Button
            size="icon"
            variant={!grid ? "secondary" : "ghost"}
            className="size-8"
            onClick={() => setGrid(false)}
          >
            <List />
          </Button>
          <Button
            size="icon"
            variant={grid ? "secondary" : "ghost"}
            className="size-8"
            onClick={() => setGrid(true)}
          >
            <Grid2X2 />
          </Button>
        </div>
      </div>

      {grid ? (
        <div className="grid grid-cols-4 gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md">
              {p.image && <ProductImage product={p as any} size="lg" />}
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">{p.name}</h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">{p.sku}</p>
                  </div>
                  <StockBadge state={getStockState(Number(p.stock), Number(p.min_stock)) as any} />
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-lg font-bold">{money(Number(p.sale_price))}</p>
                    <p className="text-[11px] text-muted-foreground">Stock: {p.stock}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-[11px]">
              <thead className="border-b bg-muted/50 text-[10px] uppercase text-muted-foreground">
                <tr>
                  {["Producto", "Código de barras", "SKU", "P. venta", "Costo", "Beneficio", "Stock", "Estado", ""].map((x) => (
                    <th key={x} className="px-4 py-3 font-semibold">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b transition-colors last:border-0 hover:bg-muted/35">
                    <td className="px-4 py-2.5">
                      <div>
                        <b>{p.name}</b>
                      </div>
                    </td>
                    <td className="px-4 font-mono text-muted-foreground">{p.barcode || "-"}</td>
                    <td className="px-4">{p.sku}</td>
                    <td className="px-4 font-semibold">{money(Number(p.sale_price))}</td>
                    <td className="px-4 text-muted-foreground">{money(Number(p.cost_price))}</td>
                    <td className="px-4 font-semibold text-success">
                      {money(Number(p.sale_price) - Number(p.cost_price))}
                    </td>
                    <td className="px-4 font-semibold">{p.stock}</td>
                    <td className="px-4">
                      <StockBadge state={getStockState(Number(p.stock), Number(p.min_stock)) as any} />
                    </td>
                    <td className="px-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>Editar producto</DropdownMenuItem>
                          <DropdownMenuItem>Ver movimientos</DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDelete(p.id)}
                          >
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}