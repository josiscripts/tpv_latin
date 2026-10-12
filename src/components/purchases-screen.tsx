import { Plus, Trash2, Search, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PageHeader } from "./app-shell";
import { usePos } from "./pos-context";
import { usePurchases, useCreatePurchase, useReceivePurchase, useRejectPurchase, useDeletePurchase, useSearchPurchases, useSearchPurchasesByProduct } from "@/hooks/usePurchases";
import { useAuth } from "@/hooks/useAuth";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useProducts } from "@/hooks/useProducts";
import { money } from "./pos-ui";
import { PurchaseDetail } from "./purchase-detail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const purchaseSchema = z.object({
  supplier_id: z.string().min(1),
  purchase_date: z.string(),
  type: z.string().default('factura'),
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
      type: 'factura',
      lines: [{ product_id: "", quantity: 1, unit_cost: 0, tax_rate: 0, total: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  const onSubmit = async (data: PurchaseFormData) => {
    try {
      // Validar que haya al menos una línea
      if (!data.lines || data.lines.length === 0) {
        toast.error("Debes agregar al menos una línea de compra");
        return;
      }

      const subtotal = data.lines.reduce((sum, line) => sum + line.total, 0);
      const tax = subtotal * 0.1; // IVA 10%

      await createPurchase.mutateAsync({
        purchase: {
          supplier_id: data.supplier_id,
          purchase_date: data.purchase_date,
          type: data.type,
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
          <div className="grid grid-cols-3 gap-4">
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
            <div>
              <Label>Tipo</Label>
              <Select {...form.register("type")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="factura">Factura</SelectItem>
                  <SelectItem value="albarán">Albarán</SelectItem>
                  <SelectItem value="nota_crédito">Nota de Crédito</SelectItem>
                </SelectContent>
              </Select>
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"supplier" | "product">("supplier");
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);

  const { data: purchasesBySupplier = [], isLoading: isLoadingSupplier } = useSearchPurchases(
    searchMode === "supplier" ? searchQuery : ""
  );
  const { data: purchasesByProduct = [], isLoading: isLoadingProduct } = useSearchPurchasesByProduct(
    searchMode === "product" ? searchQuery : ""
  );
  const { data: allPurchases = [], isLoading: isLoadingAll } = usePurchases();
  const receivePurchase = useReceivePurchase();
  const rejectPurchase = useRejectPurchase();
  const deletePurchase = useDeletePurchase();
  const { profile } = useAuth();
  const isAdmin = profile?.role_id === "admin";
  const [rejectTarget, setRejectTarget] = useState<{ id: string; invoice: string | null } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; invoice: string | null } | null>(null);

  const isLoading = isLoadingSupplier || isLoadingProduct || isLoadingAll;
  const purchases = searchQuery
    ? (searchMode === "supplier" ? purchasesBySupplier : purchasesByProduct)
    : allPurchases;

  // Handle search param for auto-selection from global search
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedId = params.get('selected');
    if (selectedId && allPurchases.length > 0) {
      if (allPurchases.find(p => p.id === selectedId)) {
        setSelectedPurchaseId(selectedId);
        window.history.replaceState({}, '', '/purchases');
      }
    }
  }, [allPurchases]);

  if (isLoading) return <div className="p-8">Cargando compras...</div>;

  const handleReceive = async (purchaseId: string) => {
    try {
      const res = await receivePurchase.mutateAsync(purchaseId);
      toast.success(res?.changed === false ? "Esta compra ya estaba recibida" : "Compra marcada como recibida");
    } catch (error) {
      toast.error(`No se pudo recibir la compra: ${error instanceof Error ? error.message : "Error desconocido"}`);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectTarget) return;
    try {
      await rejectPurchase.mutateAsync({ purchaseId: rejectTarget.id, reason: rejectReason });
      toast.success("Compra rechazada");
    } catch (error) {
      toast.error(`No se pudo rechazar la compra: ${error instanceof Error ? error.message : "Error desconocido"}`);
    } finally {
      setRejectTarget(null);
      setRejectReason("");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePurchase.mutateAsync(deleteTarget.id);
      toast.success("Compra eliminada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar la compra");
    } finally {
      setDeleteTarget(null);
    }
  };

  const getTypeLabel = (type: string | undefined) => {
    const typeMap: Record<string, string> = {
      factura: "Factura",
      albarán: "Albarán",
      nota_crédito: "Nota de Crédito",
    };
    return typeMap[type || "factura"] || type || "Factura";
  };

  const getTotalQuantity = (purchase: any) => {
    const lines = (purchase.purchase_lines as any) || [];
    if (lines.length === 0) {
      return -1; // Signal for "no data"
    }
    return lines.reduce(
      (sum: number, line: any) => sum + Number(line.quantity || 0),
      0
    );
  };

  // Show detail view if a purchase is selected
  if (selectedPurchaseId) {
    return (
      <div>
        <PurchaseDetail purchaseId={selectedPurchaseId} onBack={() => setSelectedPurchaseId(null)} />
      </div>
    );
  }

  return (
    <>
      <PageHeader title={t("purchases")} subtitle="Entrada de mercancía" action={<PurchaseDialog />} />

      <div className="mb-4 space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchMode === "supplier" ? "Buscar por proveedor o factura..." : "Buscar por producto..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <Select value={searchMode} onValueChange={(v) => {
            setSearchMode(v as "supplier" | "product");
            setSearchQuery("");
          }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="supplier">Proveedor/Factura</SelectItem>
              <SelectItem value="product">Producto</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 font-semibold text-left">Proveedor</th>
              <th className="px-4 py-3 font-semibold text-left">Fecha</th>
              <th className="px-4 py-3 font-semibold text-left">Tipo</th>
              <th className="px-4 py-3 font-semibold text-right">Cantidad</th>
              <th className="px-4 py-3 font-semibold text-right">Base imponible</th>
              <th className="px-4 py-3 font-semibold text-right">IVA</th>
              <th className="px-4 py-3 font-semibold text-right">Total</th>
              <th className="px-4 py-3 font-semibold text-center">Estado</th>
              <th className="px-4 py-3 font-semibold text-center">Acción</th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  {searchQuery ? "No se encontraron compras" : "No hay compras registradas"}
                </td>
              </tr>
            ) : (
              purchases.map((purchase) => (
                <tr key={purchase.id} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-3 cursor-pointer" onClick={() => setSelectedPurchaseId(purchase.id)}>{(purchase.suppliers as any)?.name || "?"}</td>
                  <td className="px-4 py-3 cursor-pointer" onClick={() => setSelectedPurchaseId(purchase.id)}>{new Date(purchase.purchase_date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 cursor-pointer" onClick={() => setSelectedPurchaseId(purchase.id)}>{getTypeLabel((purchase as any).type)}</td>
                  <td className="px-4 py-3 text-right cursor-pointer" onClick={() => setSelectedPurchaseId(purchase.id)}>
                    {(() => {
                      const qty = getTotalQuantity(purchase);
                      if (qty === -1) return "—";
                      // Show integer without .00, keep decimals if present
                      return Number.isInteger(qty) ? qty.toString() : qty.toFixed(2);
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right cursor-pointer" onClick={() => setSelectedPurchaseId(purchase.id)}>
                    {purchase.subtotal !== null ? money(Number(purchase.subtotal)) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right cursor-pointer" onClick={() => setSelectedPurchaseId(purchase.id)}>
                    {purchase.tax !== null ? money(Number(purchase.tax)) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-bold cursor-pointer" onClick={() => setSelectedPurchaseId(purchase.id)}>
                    {purchase.total !== null ? money(Number(purchase.total)) : "No disponible"}
                  </td>
                  <td className="px-4 py-3 text-center cursor-pointer" onClick={() => setSelectedPurchaseId(purchase.id)}>
                    <span className={`px-2 py-1 rounded text-xs whitespace-nowrap ${
                      purchase.status === 'draft'
                        ? 'bg-yellow-100 text-yellow-800'
                        : purchase.status === 'received'
                        ? 'bg-green-100 text-green-800'
                        : purchase.status === 'partial'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {purchase.status === 'draft' ? 'Borrador' :
                       purchase.status === 'received' ? 'Recibida' :
                       purchase.status === 'partial' ? 'Parcial' :
                       purchase.status === 'rejected' ? 'Rechazada' : 'Cancelada'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-wrap justify-center gap-2">
                      {(purchase.status === 'draft' || purchase.status === 'partial') && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReceive(purchase.id)}
                            disabled={receivePurchase.isPending}
                          >
                            Recibir
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setRejectReason(""); setRejectTarget({ id: purchase.id, invoice: purchase.invoice_number }); }}
                            disabled={rejectPurchase.isPending}
                          >
                            Rechazar
                          </Button>
                        </>
                      )}
                      {isAdmin && purchase.status !== 'received' && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeleteTarget({ id: purchase.id, invoice: purchase.invoice_number })}
                          disabled={deletePurchase.isPending}
                        >
                          Eliminar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Rechazar compra: motivo opcional */}
      <AlertDialog open={rejectTarget !== null} onOpenChange={(open) => { if (!open) setRejectTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Rechazar esta compra?</AlertDialogTitle>
            <AlertDialogDescription>
              La compra{rejectTarget?.invoice ? ` ${rejectTarget.invoice}` : ""} quedará como rechazada. No se borra ni se modifica el inventario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Motivo (opcional)</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              maxLength={500}
              placeholder="Por ejemplo: precio no acordado"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>No, cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReject} disabled={rejectPurchase.isPending}>
              Sí, rechazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Eliminar compra: confirmación explícita (solo administradores) */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta compra?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.invoice ? `Compra ${deleteTarget.invoice}. ` : ""}
              Esta acción no se puede deshacer. Si la compra tiene documentos, extracciones o movimientos de stock, el sistema lo impedirá y no borrará nada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} disabled={deletePurchase.isPending}>
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
