import { PageHeader } from "./app-shell";
import { usePos } from "./pos-context";
import { useSales, useCancelSale } from "@/hooks/useSales";
import { money } from "./pos-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import { toast } from "sonner";

export function SalesScreen() {
  const { t } = usePos();
  const { data: sales = [], isLoading } = useSales();
  const cancelSale = useCancelSale();
  const [selectedSale, setSelectedSale] = useState<string | null>(null);

  if (isLoading) return <div className="p-8">Cargando ventas...</div>;

  const handleCancel = async (saleId: string) => {
    try {
      await cancelSale.mutateAsync(saleId);
      toast.success("Venta cancelada");
      setSelectedSale(null);
    } catch (error) {
      toast.error("Error al cancelar venta");
    }
  };

  const selectedSaleData = sales.find((s) => s.id === selectedSale);

  return (
    <>
      <PageHeader title={t("sales")} subtitle="Historial completo de transacciones" />
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 font-semibold">Fecha</th>
              <th className="px-4 py-3 font-semibold">Origen</th>
              <th className="px-4 py-3 font-semibold">Líneas</th>
              <th className="px-4 py-3 font-semibold">Total</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold">Acción</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr
                key={sale.id}
                className="border-b hover:bg-muted/30 cursor-pointer"
                onClick={() => setSelectedSale(sale.id)}
              >
                <td className="px-4 py-3">{new Date(sale.sale_date).toLocaleString()}</td>
                <td className="px-4 py-3">{sale.source === 'sysme' ? 'Sysme' : 'Latin POS'}</td>
                <td className="px-4 py-3">{(sale.sale_lines as any)?.length || 0}</td>
                <td className="px-4 py-3 font-bold">{money(Number(sale.total))}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs ${sale.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {sale.status === 'completed' ? 'Completada' : 'Cancelada'}
                  </span>
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  {sale.status === 'completed' && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleCancel(sale.id)}
                      disabled={cancelSale.isPending}
                    >
                      Cancelar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!selectedSale} onOpenChange={() => setSelectedSale(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalle de venta</DialogTitle>
          </DialogHeader>
          {selectedSaleData && (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span>Fecha:</span>
                <strong>{new Date(selectedSaleData.sale_date).toLocaleString()}</strong>
              </div>
              <div className="flex justify-between">
                <span>Total:</span>
                <strong className="text-lg">{money(Number(selectedSaleData.total))}</strong>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Líneas:</h4>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {(selectedSaleData.sale_lines as any)?.map((line: any) => (
                    <div key={line.id} className="flex justify-between text-sm py-1 border-b">
                      <span>{line.products?.name || 'Producto'}</span>
                      <span>{line.quantity} × {money(line.unit_sale_price)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
