import { Grid2X2, List, MoreHorizontal, Pencil, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PageHeader } from "./app-shell";
import { ProductImage, StockBadge, money } from "./pos-ui";
import { usePos } from "./pos-context";
import { useProducts, useCreateProduct, useDeleteProduct, useUpdateProduct } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useStockMovements } from "@/hooks/useStock";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const productSchema = z.object({
  name: z.string().min(1),
  barcode: z.string().optional(),
  sku: z.string().optional().nullable(),
  cost_price: z.coerce.number().min(0).nullable(),
  sale_price: z.coerce.number().min(0),
  stock: z.coerce.number().min(0),
  min_stock: z.coerce.number().min(0),
  category_id: z.string().optional().nullable(),
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
  const [showFilters, setShowFilters] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [viewingProduct, setViewingProduct] = useState<any>(null);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [showMovements, setShowMovements] = useState(false);
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "ok" | "critical" | "out">("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const { t } = usePos();
  const { data: products = [], isLoading } = useProducts();
  const { data: categories = [] } = useCategories();
  const deleteProduct = useDeleteProduct();


  const getStockState = (stock: number, minStock: number) => {
    if (stock === 0) return "out";
    if (stock <= minStock) return "critical";
    if (stock <= minStock * 1.5) return "low";
    return "ok";
  };

  const filtered = products.filter((p) => {
    // Búsqueda
    if (q && !(
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      (p.sku?.toLowerCase().includes(q.toLowerCase()) ?? false) ||
      (p.barcode?.includes(q) ?? false)
    )) {
      return false;
    }

    // Filtro de stock
    const stockState = getStockState(Number(p.stock), Number(p.min_stock));
    if (stockFilter !== "all" && stockState !== stockFilter) {
      return false;
    }

    // Filtro de activo/inactivo
    if (activeFilter === "active" && !p.active) {
      return false;
    }
    if (activeFilter === "inactive" && p.active) {
      return false;
    }

    // Filtro de categoría
    if (categoryFilter !== "all" && p.category_id !== categoryFilter) {
      return false;
    }

    return true;
  });

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
        <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
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

      {showFilters && (
        <div className="mb-4 grid grid-cols-3 gap-4 rounded-lg border bg-card p-4">
          <div>
            <Label className="text-xs mb-2 block">Estado de stock</Label>
            <Select value={stockFilter} onValueChange={(v: any) => setStockFilter(v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ok">Correcto</SelectItem>
                <SelectItem value="low">Bajo</SelectItem>
                <SelectItem value="critical">Crítico</SelectItem>
                <SelectItem value="out">Sin stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-2 block">Estado del producto</Label>
            <Select value={activeFilter} onValueChange={(v: any) => setActiveFilter(v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Activos</SelectItem>
                <SelectItem value="inactive">Inactivos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-2 block">Categoría</Label>
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

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
                  {["Producto", "Categoría", "Código de barras", "SKU", "P. venta", "Costo", "Beneficio", "IVA", "Peso (kg)", "Stock", "Estado", ""].map((x) => (
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
                      <div className="flex items-center gap-3 min-w-0">
                        <ProductImage product={p as any} size="sm" />
                        <b className="truncate">{p.name}</b>
                      </div>
                    </td>
                    <td className="px-4 text-muted-foreground">
                      {categories.find(c => c.id === p.category_id)?.name || "—"}
                    </td>
                    <td className="px-4 font-mono text-muted-foreground">{p.barcode || "—"}</td>
                    <td className="px-4">{p.sku || "—"}</td>
                    <td className="px-4 font-semibold">{money(Number(p.sale_price))}</td>
                    <td className="px-4 text-muted-foreground">{p.cost_price !== null ? money(Number(p.cost_price)) : "—"}</td>
                    <td className="px-4 font-semibold text-success">
                      {p.cost_price !== null ? money(Number(p.sale_price) - Number(p.cost_price)) : "—"}
                    </td>
                    <td className="px-4 text-muted-foreground">{p.tax_rate !== null ? `${p.tax_rate},00 %` : "—"}</td>
                    <td className="px-4 text-muted-foreground">{p.weight_kg !== null && p.weight_kg > 0 ? `${Number(p.weight_kg).toFixed(2)} kg` : "—"}</td>
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
                          <DropdownMenuItem onClick={() => setViewingProduct(p)}>Ver producto</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditingProduct(p)}>Editar producto</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setSelectedProduct(p); setShowMovements(true); }}>Ver movimientos</DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              if (confirm(`Se ocultará "${p.name}" de los productos activos. El historial se mantiene.`)) {
                                handleDelete(p.id);
                              }
                            }}
                          >
                            Ocultar producto
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

      {/* Modal: Ver producto */}
      {viewingProduct && (
        <Dialog open={!!viewingProduct} onOpenChange={() => setViewingProduct(null)}>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle>{viewingProduct.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="flex justify-center bg-muted rounded-lg p-8">
                <div className="aspect-square w-64 flex items-center justify-center">
                  <ProductImage product={viewingProduct as any} size="lg" />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3">Información del producto</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SKU:</span>
                    <span className="font-mono">{viewingProduct.sku || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Código de barras:</span>
                    <span className="font-mono">{viewingProduct.barcode || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Categoría:</span>
                    <span>{categories.find(c => c.id === viewingProduct.category_id)?.name || "—"}</span>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-3">Descripción</h3>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{viewingProduct.description || "Sin descripción"}</p>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-3">Información comercial</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Precio de venta:</span>
                    <span className="font-semibold">{money(Number(viewingProduct.sale_price))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Coste:</span>
                    <span className="font-semibold">{viewingProduct.cost_price !== null ? money(Number(viewingProduct.cost_price)) : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Beneficio:</span>
                    <span className="font-semibold text-success">{viewingProduct.cost_price !== null ? money(Number(viewingProduct.sale_price) - Number(viewingProduct.cost_price)) : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IVA:</span>
                    <span className="font-semibold">{viewingProduct.tax_rate !== null ? `${viewingProduct.tax_rate}%` : "—"}</span>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-3">Inventario</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stock actual:</span>
                    <span className="font-semibold">{viewingProduct.stock} unidades</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stock mínimo:</span>
                    <span className="font-semibold">{viewingProduct.min_stock}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Peso:</span>
                    <span className="font-semibold">{viewingProduct.weight_kg !== null && viewingProduct.weight_kg > 0 ? `${Number(viewingProduct.weight_kg).toFixed(2)} kg` : "—"}</span>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Diálogo de editar producto */}
      {editingProduct && (
        <EditProductDialog product={editingProduct} open={!!editingProduct} onOpenChange={() => setEditingProduct(null)} />
      )}

      {/* Diálogo de movimientos */}
      {showMovements && selectedProduct && (
        <MovementsDialog product={selectedProduct} open={showMovements} onOpenChange={setShowMovements} />
      )}
    </>
  );
}

interface MovementsDialogProps {
  product: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EditProductDialogProps {
  product: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EditProductDialog({ product, open, onOpenChange }: EditProductDialogProps) {
  const [minStockEdit, setMinStockEdit] = useState(String(product.min_stock));
  const updateProduct = useUpdateProduct();
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateProduct.mutateAsync({
        id: product.id,
        updates: {
          min_stock: Number(minStockEdit),
        },
      });
      toast.success("Producto actualizado");
      onOpenChange(false);
    } catch (error) {
      toast.error("Error al actualizar producto");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar: {product.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-sm bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-800 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-200">
            <p><b>⚠️ Sincronización automática</b></p>
            <p className="mt-1">Precio de venta, coste y datos del producto se actualizan automáticamente desde Sysme. Solo puedes editar Stock Mínimo.</p>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Nombre</Label>
            <p className="text-sm font-semibold">{product.name}</p>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">SKU</Label>
            <p className="text-sm font-mono">{product.sku || "—"}</p>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Código de barras</Label>
            <p className="text-sm font-mono">{product.barcode || "—"}</p>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Precio de venta (€) — Sincronizado desde Sysme</Label>
            <p className="text-sm font-semibold">{money(Number(product.sale_price))}</p>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Costo (€) — Sincronizado desde Sysme</Label>
            <p className="text-sm font-semibold">{product.cost_price !== null ? money(Number(product.cost_price)) : "—"}</p>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">IVA (%)</Label>
            <p className="text-sm font-semibold">{product.tax_rate !== null ? `${product.tax_rate}%` : "—"}</p>
          </div>

          <div>
            <Label htmlFor="min-stock">Stock mínimo — Editable</Label>
            <Input
              id="min-stock"
              type="number"
              value={minStockEdit}
              onChange={(e) => setMinStockEdit(e.target.value)}
              placeholder="0"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Stock actual</Label>
            <p className="text-sm font-semibold">{product.stock} unidades</p>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Peso</Label>
            <p className="text-sm font-semibold">{product.weight_kg !== null && product.weight_kg > 0 ? `${Number(product.weight_kg).toFixed(2)} kg` : "—"}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Guardando..." : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MovementsDialog({ product, open, onOpenChange }: MovementsDialogProps) {
  const { data: movements = [], isLoading } = useStockMovements(product.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Historial de movimientos: {product.name}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Cargando movimientos...</div>
        ) : movements.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">Sin movimientos de stock registrados</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b bg-muted/50 text-[10px] uppercase">
                <tr>
                  {["Fecha y hora", "Tipo", "Cantidad", "Stock anterior", "Stock nuevo", "Referencia"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movements.map((m: any) => (
                  <tr key={m.id} className="border-b hover:bg-muted/50">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(m.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="px-3 py-2 capitalize">{m.movement_type}</td>
                    <td className="px-3 py-2 text-right">{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
                    <td className="px-3 py-2 text-right">{m.previous_stock}</td>
                    <td className="px-3 py-2 text-right font-semibold">{m.resulting_stock}</td>
                    <td className="px-3 py-2 text-muted-foreground">{m.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}