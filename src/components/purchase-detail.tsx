import { useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePurchase, useReceivePurchase } from '@/hooks/usePurchases';
import { money } from './pos-ui';
import { toast } from 'sonner';

export function PurchaseDetail({ purchaseId, onBack }: { purchaseId: string; onBack: () => void }) {
  const { data: purchase, isLoading, error } = usePurchase(purchaseId);
  const receivePurchase = useReceivePurchase();
  const [isMarking, setIsMarking] = useState(false);

  const handleMarkReceived = async () => {
    if (!purchase) return;
    try {
      setIsMarking(true);
      await receivePurchase.mutateAsync(purchaseId);
      toast.success('Compra marcada como recibida');
    } catch (e) {
      toast.error('Error al marcar compra');
    } finally {
      setIsMarking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (error || !purchase) {
    return (
      <div className="p-6">
        <Button onClick={onBack} variant="ghost" size="sm">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
        <p className="text-red-500 mt-4">Error cargando compra</p>
      </div>
    );
  }

  const supplier = (purchase.suppliers as any);
  const lines = (purchase.purchase_lines as any) || [];
  const totalQty = lines.reduce((sum: number, line: any) => sum + (line.quantity || 0), 0);

  const statusColors: Record<string, string> = {
    draft: 'bg-yellow-100 text-yellow-800',
    received: 'bg-green-100 text-green-800',
    partial: 'bg-orange-100 text-orange-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Button onClick={onBack} variant="ghost" size="sm">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
        <span className={`px-3 py-1 rounded text-sm font-medium ${statusColors[purchase.status] || 'bg-gray-100'}`}>
          {purchase.status.charAt(0).toUpperCase() + purchase.status.slice(1)}
        </span>
      </div>

      {/* Header Info */}
      <div className="border rounded-lg p-4 space-y-3">
        <div>
          <p className="text-sm text-gray-500">Proveedor</p>
          <p className="text-lg font-semibold">{supplier?.name || 'Unknown'}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Fecha</p>
            <p>{new Date(purchase.purchase_date).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Tipo</p>
            <p className="capitalize">{purchase.type === 'factura' ? 'Factura' : 'Albarán'}</p>
          </div>
        </div>

        {purchase.invoice_number && (
          <div>
            <p className="text-sm text-gray-500">Número de documento</p>
            <p className="font-mono">{purchase.invoice_number}</p>
          </div>
        )}
      </div>

      {/* Lines */}
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-4">Productos comprados ({lines.length})</h3>

        {lines.length === 0 ? (
          <p className="text-gray-500 text-sm">Sin líneas registradas</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Producto</th>
                  <th className="text-left py-2">SKU</th>
                  <th className="text-right py-2">Cantidad</th>
                  <th className="text-right py-2">Precio unitario</th>
                  <th className="text-right py-2">Total línea</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line: any, idx: number) => (
                  <tr key={idx} className="border-b">
                    <td className="py-2">{(line.products as any)?.name || 'Sin mapeo'}</td>
                    <td className="py-2 text-gray-500">{(line.products as any)?.sku || '—'}</td>
                    <td className="text-right py-2 font-semibold">{line.quantity}</td>
                    <td className="text-right py-2">{line.unit_cost !== null ? money(Number(line.unit_cost)) : '—'}</td>
                    <td className="text-right py-2">{line.total !== null ? money(Number(line.total)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 pt-4 border-t space-y-2">
          <div className="flex justify-between font-semibold">
            <span>Cantidad total:</span>
            <span>{totalQty}</span>
          </div>
        </div>
      </div>

      {/* Totals */}
      {purchase.subtotal !== null || purchase.tax !== null || purchase.total !== null ? (
        <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
          <div className="flex justify-between">
            <span>Base imponible:</span>
            <span className="font-mono">{purchase.subtotal !== null ? money(Number(purchase.subtotal)) : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span>IVA:</span>
            <span className="font-mono">{purchase.tax !== null ? money(Number(purchase.tax)) : '—'}</span>
          </div>
          <div className="flex justify-between text-lg font-bold border-t pt-3">
            <span>Total:</span>
            <span className="font-mono">{purchase.total !== null ? money(Number(purchase.total)) : '—'}</span>
          </div>
        </div>
      ) : (
        <div className="border rounded-lg p-4 bg-yellow-50 text-sm text-yellow-800">
          Importes no disponibles (albarán sin precios)
        </div>
      )}

      {/* Actions */}
      {purchase.status === 'draft' && (
        <Button
          onClick={handleMarkReceived}
          disabled={isMarking}
          className="w-full bg-green-600 hover:bg-green-700"
        >
          {isMarking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Marcar como recibida
        </Button>
      )}
    </div>
  );
}
