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

  const formatDate = (dateStr: string) => {
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, year, month, day] = match;
      return `${day}/${month}/${year}`;
    }
    return '—';
  };

  const formatTime = (dateStr: string) => {
    const match = dateStr.match(/T(\d{2}:\d{2}:\d{2})/);
    if (match) {
      return match[1];
    }
    return '—';
  };

  const getProductDisplay = (sale: any) => {
    const lines = (sale.sale_lines as any) || [];
    if (lines.length === 0) return '—';
    if (lines.length === 1) return lines[0].products?.name || 'Producto';
    const firstProduct = lines[0].products?.name || 'Producto';
    return `${firstProduct} + ${lines.length - 1} más`;
  };

  return (
    <>
      <PageHeader title={t("sales")} subtitle="Historial completo de transacciones" />
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 font-semibold">Fecha</th>
              <th className="px-4 py-3 font-semibold">Hora</th>
              <th className="px-4 py-3 font-semibold">Origen</th>
              <th className="px-4 py-3 font-semibold">Producto(s)</th>
              <th className="px-4 py-3 font-semibold">Líneas</th>
              <th className="px-4 py-3 font-semibold">Total</th>
              <th className="px-4 py-3 font-semibold">Pago</th>
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
                <td className="px-4 py-3">{formatDate(sale.sale_date)}</td>
                <td className="px-4 py-3">{formatTime(sale.sale_date)}</td>
                <td className="px-4 py-3">{sale.source === 'sysme' ? 'Sysme' : 'Latin POS'}</td>
                <td className="px-4 py-3 text-xs max-w-xs truncate">{getProductDisplay(sale)}</td>
                <td className="px-4 py-3">{(sale.sale_lines as any)?.length || 0}</td>
                <td className="px-4 py-3 font-bold">{money(Number(sale.total))}</td>
                <td className="px-4 py-3">{sale.payment_method || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs ${sale.status === 'completed' ? 'bg-green-100 text-green-800' : sale.status === 'cancelled' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {sale.status === 'completed' ? 'Completada' : sale.status === 'cancelled' ? 'Cancelada' : 'Pendiente'}
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle de venta</DialogTitle>
          </DialogHeader>
          {selectedSaleData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm border-b pb-4">
                <div>
                  <span className="text-muted-foreground">Fecha</span>
                  <p className="font-semibold">{formatDate(selectedSaleData.sale_date)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Hora</span>
                  <p className="font-semibold">{formatTime(selectedSaleData.sale_date)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Origen</span>
                  <p className="font-semibold">{selectedSaleData.source === 'sysme' ? 'Sysme' : 'Latin POS'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Documento</span>
                  <p className="font-semibold">{selectedSaleData.sysme_id_tiquet || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Método de pago</span>
                  <p className="font-semibold">{selectedSaleData.payment_method || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Estado</span>
                  <p className={`font-semibold ${selectedSaleData.status === 'completed' ? 'text-green-700' : selectedSaleData.status === 'cancelled' ? 'text-red-700' : 'text-yellow-700'}`}>
                    {selectedSaleData.status === 'completed' ? 'Completada' : selectedSaleData.status === 'cancelled' ? 'Cancelada' : 'Pendiente'}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Líneas de venta</h4>
                <div className="overflow-x-auto border rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Producto</th>
                        <th className="px-3 py-2 text-right font-semibold">Cantidad</th>
                        <th className="px-3 py-2 text-right font-semibold">Precio</th>
                        <th className="px-3 py-2 text-right font-semibold">Descuento</th>
                        <th className="px-3 py-2 text-right font-semibold">IVA</th>
                        <th className="px-3 py-2 text-right font-semibold">Coste</th>
                        <th className="px-3 py-2 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedSaleData.sale_lines as any)?.map((line: any) => (
                        <tr key={line.id} className="border-b hover:bg-muted/20">
                          <td className="px-3 py-2">{line.products?.name || 'Producto'}</td>
                          <td className="px-3 py-2 text-right">{line.quantity}</td>
                          <td className="px-3 py-2 text-right">{money(Number(line.unit_sale_price))}</td>
                          <td className="px-3 py-2 text-right">{line.discount ? money(Number(line.discount)) : '—'}</td>
                          <td className="px-3 py-2 text-right">{line.tax_rate}%</td>
                          <td className="px-3 py-2 text-right">{line.unit_cost_at_time !== null && line.unit_cost_at_time !== undefined ? money(Number(line.unit_cost_at_time)) : '—'}</td>
                          <td className="px-3 py-2 text-right font-semibold">{money(Number(line.total_sale))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border-t pt-4 flex justify-between items-center">
                <div className="space-y-1">
                  <div className="flex justify-between gap-8 text-sm">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span className="font-semibold">{money(Number(selectedSaleData.subtotal))}</span>
                  </div>
                  <div className="flex justify-between gap-8 text-sm">
                    <span className="text-muted-foreground">IVA total:</span>
                    <span className="font-semibold">{money(Number(selectedSaleData.tax))}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground text-sm">Total</span>
                  <p className="text-2xl font-bold">{money(Number(selectedSaleData.total))}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
