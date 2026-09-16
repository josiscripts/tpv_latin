import { Boxes, CircleDollarSign, Plus, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "./app-shell";
import { StockBadge, money } from "./pos-ui";
import { usePos } from "./pos-context";
import { useProducts } from "@/hooks/useProducts";
import { useStockMovements, useCreateAdjustment } from "@/hooks/useStock";
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
  const { data: movements = [] } = useStockMovements();

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
  const criticalCount = products.filter((p) => Number(p.stock) <= Number(p.min_stock)).length;

  const stats = [
    { l: "Stock total", v: `${totalStock.toFixed(0)} uds.`, i: Boxes },
    { l: "Valor del inventario", v: money(inventoryValue), i: CircleDollarSign },
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
          <TabsTrigger value="moves">{t("movements")}</TabsTrigger>
        </TabsList>
        <TabsContent value="inventory" className="mt-4">
          <div className="grid grid-cols-3 gap-4">
            {stats.map((x) => (
              <div key={x.l} className="flex items-center gap-4 rounded-lg border bg-card p-4">
                <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
                  <x.i size={19} />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{x.l}</p>
                  <p className="text-lg font-bold">{x.v}</p>
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
                  {["Producto", "Stock actual", "Stock mínimo", "Costo unitario", "Estado"].map((x) => (
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
                  let state: "ok" | "low" | "critical" | "out" = "ok";
                  if (stock === 0) state = "out";
                  else if (stock <= minStock) state = "critical";
                  else if (stock <= minStock * 1.5) state = "low";

                  return (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <b>{p.name}</b>
                      </td>
                      <td className="px-4 font-bold">{stock.toFixed(2)}</td>
                      <td className="px-4 text-muted-foreground">{minStock.toFixed(2)}</td>
                      <td className="px-4">{money(Number(p.cost_price))}</td>
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
        <TabsContent value="moves" className="mt-5">
          <div className="rounded-lg border bg-card p-6">
            <h2 className="mb-6 text-sm font-semibold">Últimos movimientos</h2>
            {movements.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin movimientos registrados</p>
            ) : (
              <div className="space-y-3">
                {movements.slice(0, 20).map((m) => (
                  <div key={m.id} className="flex justify-between border-b pb-2 text-xs last:border-0">
                    <div>
                      <p className="font-semibold">{m.movement_type}</p>
                      <p className="text-muted-foreground">{m.reason || "Sin razón"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{Number(m.quantity) > 0 ? "+" : ""}{m.quantity}</p>
                      <p className="text-muted-foreground">{new Date(m.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
