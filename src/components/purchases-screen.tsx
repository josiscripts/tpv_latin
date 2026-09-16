import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PageHeader } from "./app-shell";
import { usePos } from "./pos-context";
import { usePurchases, useCreatePurchase, useReceivePurchase } from "@/hooks/usePurchases";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useProducts } from "@/hooks/useProducts";
import { money } from "./pos-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const purchaseSchema = z.object({
  supplier_id: z.string().min(1),
  purchase_date: z.string(),
  lines: z.array(z.object({
    product_id: z.string().min(1),
    quantity: z.coerce.number().min(0.01),
    unit_cost: z.coerce.number().min(0),
    tax_rate: z.coerce.number().min(0).max(100),
    total: z.coerce.number().min(0),
  })).min(1),
});

type PurchaseFormData = z.infer<typeof purchaseSchema>;

function PurchaseDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data: suppliers = [] } = useSuppliers();
  const { data: products = [] } = useProducts();
  const createPurchase = useCreatePurchase();

  const form = useForm<PurchaseFormData>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      purchase_date: new Date().toISOString().split('T')[0],
      lines: [{ product_id: "", quantity: 1, unit_cost: 0, tax_rate: 0, total: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  const onSubmit = async (data: PurchaseFormData) => {
    try {
      const subtotal = data.lines.reduce((sum, line) => sum + line.total, 0);
      const tax = subtotal * 0.1; // IVA 10%

      await createPurchase.mutateAsync({
        purchase: {
          supplier_id: data.supplier_id,
          purchase_date: data.purchase_date,
          subtotal,
          tax,
          total: subtotal + tax,
          status: 'draft',
        },
        lines: data.lines,
      });
      toast.success("Compra creada");
      setOpen(false);
      form.reset();
    } catch (error) {
      toast.error("Error al crear compra");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button><Plus />Nueva compra</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva compra</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Proveedor</Label>
              <Select {...form.register("supplier_id")}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha</Label>
              <Input type="date" {...form.register("purchase_date")} />
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <h3 className="font-bold mb-4">Líneas de compra</h3>
            <div className="space-y-3">
              {fields.map((field, idx) => (
                <div key={field.id} className="flex gap-2 items-end">
                  <Select {...form.register(`lines.${idx}.product_id`)}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Producto" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Cant"
                    className="w-20"
                    {...form.register(`lines.${idx}.quantity`)}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Precio"
                    className="w-20"
                    {...form.register(`lines.${idx}.unit_cost`)}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Total"
                    className="w-20"
                    {...form.register(`lines.${idx}.total`)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(idx)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => append({ product_id: "", quantity: 1, unit_cost: 0, tax_rate: 0, total: 0 })}
            >
              <Plus /> Añadir línea
            </Button>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={createPurchase.isPending}>
              {createPurchase.isPending ? "Guardando..." : "Crear compra"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PurchasesScreen() {
  const { t } = usePos();
  const { data: purchases = [], isLoading } = usePurchases();
  const receivePurchase = useReceivePurchase();

  if (isLoading) return <div className="p-8">Cargando compras...</div>;

  const handleReceive = async (purchaseId: string) => {
    try {
      await receivePurchase.mutateAsync(purchaseId);
      toast.success("Compra recibida y stock actualizado");
    } catch (error) {
      toast.error("Error al recibir compra");
    }
  };

  return (
    <>
      <PageHeader title={t("purchases")} subtitle="Entrada de mercancía" action={<PurchaseDialog />} />
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 font-semibold">Proveedor</th>
              <th className="px-4 py-3 font-semibold">Fecha</th>
              <th className="px-4 py-3 font-semibold">Líneas</th>
              <th className="px-4 py-3 font-semibold">Total</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold">Acción</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((purchase) => (
              <tr key={purchase.id} className="border-b hover:bg-muted/30">
                <td className="px-4 py-3">{(purchase.suppliers as any)?.name || "?"}</td>
                <td className="px-4 py-3">{new Date(purchase.purchase_date).toLocaleDateString()}</td>
                <td className="px-4 py-3">{(purchase.purchase_lines as any)?.length || 0}</td>
                <td className="px-4 py-3 font-bold">{money(Number(purchase.total))}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs ${purchase.status === 'draft' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                    {purchase.status === 'draft' ? 'Borrador' : 'Recibida'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {purchase.status === 'draft' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReceive(purchase.id)}
                      disabled={receivePurchase.isPending}
                    >
                      Recibir
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
