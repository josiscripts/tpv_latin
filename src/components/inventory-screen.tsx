import { Boxes, CircleDollarSign, SlidersHorizontal, TrendingUp, Percent } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "./app-shell";
import { StockBadge, money, ProductImage } from "./pos-ui";
import { usePos } from "./pos-context";
import { useProducts } from "@/hooks/useProducts";
import { useCreateAdjustment } from "@/hooks/useStock";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function AdjustmentDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [delta, setDelta] = useState("0");
  const [reason, setReason] = useState("");

  const { data: products = [] } = useProducts();
  const createAdjustment = useCreateAdjustment();

  const handleSubmit = async () => {
    if (!selectedProduct || !delta || !reason) {
      toast.error("Complete todos los campos");
      return;
    }
    try {
      await createAdjustment.mutateAsync({
        productId: selectedProduct,
        delta: Number(delta),
        reason,
      });
      toast.success("Ajuste registrado");
      setOpen(false);
      setSelectedProduct("");
      setDelta("0");
      setReason("");
    } catch (error) {
      toast.error("Error al registrar ajuste");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <SlidersHorizontal />
            Registrar ajuste
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar ajuste de stock</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Producto</Label>
            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar producto" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ajuste (positivo o negativo)</Label>
            <Input
              type="number"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="Ej: +5 o -3"
            />
          </div>
          <div>
            <Label>Razón</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Merma, Reconteo, Devolución"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={createAdjustment.isPending}>
            {createAdjustment.isPending ? "Guardando..." : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InventoryScreen() {
  const { t } = usePos();
  const [filter, setFilter] = useState("all");
  const { data: products = [] } = useProducts();

  const visible = filter === "all"
    ? products
    : products.filter((p) => {
        if (Number(p.stock) === 0) return filter === "out";
        if (Number(p.stock) <= Number(p.min_stock)) return filter === "critical";
        if (Number(p.stock) <= Number(p.min_stock) * 1.5) return filter === "low";
        return false;
      });

  const filters = [
    { id: "all", label: t("all") },
    { id: "low", label: t("low") },
    { id: "critical", label: t("critical") },
    { id: "out", label: t("out") },
  ];

  const totalStock = products.reduce((sum, p) => sum + Number(p.stock), 0);
  const inventoryValue = products.reduce((sum, p) => sum + Number(p.stock) * Number(p.cost_price), 0);
  const saleValue = products.reduce((sum, p) => sum + Number(p.stock) * Number(p.sale_price), 0);
  const profitTotal = saleValue - inventoryValue;
  const marginPercent = inventoryValue > 0 ? ((profitTotal / inventoryValue) * 100) : 0;
  const criticalCount = products.filter((p) => Number(p.stock) <= Number(p.min_stock)).length;

  const stats = [
    { l: "Stock total", v: `${totalStock.toFixed(0)} uds.`, i: Boxes },
    { l: "Valor del inventario", v: money(inventoryValue), i: CircleDollarSign },
    { l: "Valor de venta", v: money(saleValue), i: TrendingUp },
    { l: "Beneficio", v: money(profitTotal), i: CircleDollarSign },
    { l: "Margen", v: `${marginPercent.toFixed(1)}%`, i: Percent },
    { l: "Productos críticos", v: criticalCount.toString(), i: Boxes },
  ];

  return (
    <>
      <PageHeader
        title={t("stock")}
        subtitle="Control y trazabilidad del inventario"
        action={<AdjustmentDialog />}
      />
      <Tabs defaultValue="inventory">
        <TabsList>
          <TabsTrigger value="inventory">{t("inventory")}</TabsTrigger>
        </TabsList>
        <TabsContent value="inventory" className="mt-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-3">
            {stats.map((x) => (
              <div key={x.l} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                <div className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary shrink-0">
                  <x.i size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-muted-foreground truncate">{x.l}</p>
                  <p className="text-base font-bold truncate">{x.v}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="my-4 flex gap-2">
            {filters.map((x) => (
              <Button
                key={x.id}
                variant={filter === x.id ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(x.id)}
              >
                {x.label}
              </Button>
            ))}
          </div>
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/50 text-[10px] uppercase text-muted-foreground">
                <tr>
                  {["Imagen", "Producto", "Stock actual", "Stock mínimo", "Costo unitario", "Valor stock", "Estado"].map((x) => (
                    <th key={x} className="px-4 py-3">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const stock = Number(p.stock);
                  const minStock = Number(p.min_stock);
                  const stockValue = stock * Number(p.cost_price);
                  let state: "ok" | "low" | "critical" | "out" = "ok";
                  if (stock === 0) state = "out";
                  else if (stock <= minStock) state = "critical";
                  else if (stock <= minStock * 1.5) state = "low";

                  return (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <ProductImage product={p as any} size="sm" />
                      </td>
                      <td className="px-4 py-2">
                        <b>{p.name}</b>
                      </td>
                      <td className="px-4 font-bold">{stock.toFixed(2)}</td>
                      <td className="px-4 text-muted-foreground">{minStock.toFixed(2)}</td>
                      <td className="px-4">{money(Number(p.cost_price))}</td>
                      <td className="px-4 font-semibold">{money(stockValue)}</td>
                      <td className="px-4">
                        <StockBadge state={state} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
