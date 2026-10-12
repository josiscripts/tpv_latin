import { useEffect, useState } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { ChevronLeft, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExtractionById } from '@/hooks/useDocuments';
import { documentsService } from '@/services/documents.service';
import { documentSupplierIntegrationService } from '@/services/document-supplier-integration.service';
import { suppliersService } from '@/services/suppliers.service';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { approveExtractionAndCreatePurchase } from '@/services/extraction-approval.service';
import { toast } from 'sonner';

// Las funciones RPC de aprobación no están en los tipos generados; se tipan aquí.
async function callRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const client = supabase as unknown as { rpc: (fn: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

export function ExtractionDetailScreen() {
  const { id } = useParams({ from: '/documents/extraction/$id' as const });
  const navigate = useNavigate();
  const { data: extraction, isLoading, error, refetch } = useExtractionById(id);
  const { profile } = useAuth();
  const [isApproving, setIsApproving] = useState(false);
  // Proveedor elegido a mano cuando la IA no detectó el nombre en el documento.
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [manualSupplierId, setManualSupplierId] = useState('');
  const [newSupplierName, setNewSupplierName] = useState('');

  useEffect(() => {
    suppliersService
      .listActive()
      .then((rows) => setSuppliers(rows.map((s) => ({ id: s.id, name: s.name }))))
      .catch((err) => toast.error(`No se pudieron cargar los proveedores: ${err instanceof Error ? err.message : 'Desconocido'}`));
  }, []);

  const handleDownload = async () => {
    try {
      if (!extraction?.documents?.file_path) {
        toast.error('Archivo no disponible');
        return;
      }
      const url = await documentsService.getSignedUrl(extraction.documents.file_path);
      const link = document.createElement('a');
      link.href = url;
      link.download = extraction.documents.original_name || 'document.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Descargado');
    } catch (err) {
      toast.error('Error al descargar archivo');
    }
  };

  const handleApproveAndCreatePurchase = async () => {
    if (!extraction) return;
    const vendorMissing = !extraction.vendor_name?.trim();
    if (vendorMissing && !manualSupplierId && !newSupplierName.trim()) {
      toast.error('Falta el proveedor: elige uno existente o escribe el nombre de uno nuevo.');
      return;
    }
    setIsApproving(true);
    const loadingId = toast.loading('Creando compra...');
    try {
      let supplierChoice: string | undefined;
      if (vendorMissing) {
        if (manualSupplierId) {
          supplierChoice = manualSupplierId;
        } else {
          // Reutiliza un proveedor con el mismo nombre si existe; si no, lo crea (solo al aprobar).
          const name = newSupplierName.trim();
          const similar = await suppliersService.findByNameSimilarity(name);
          const existing = similar.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
          supplierChoice = existing ? existing.id : (await suppliersService.create({ name, active: true })).id;
        }
      }
      const result = await approveExtractionAndCreatePurchase(
        {
          linkSupplier: (extractionId) => documentSupplierIntegrationService.linkDocumentToSupplier(extractionId, extraction.vendor_name, extraction.vendor_tax_id),
          approve: async (extractionId, supplierId) => {
            const rows = (await callRpc('approve_extraction_create_purchase', { p_extraction_id: extractionId, p_supplier_id: supplierId })) as Array<{ purchase_id: string; created: boolean; lines_copied: number; lines_skipped: number }>;
            const row = rows?.[0];
            if (!row) throw new Error('La aprobación no devolvió compra');
            return { purchaseId: row.purchase_id, created: row.created, linesCopied: row.lines_copied, linesSkipped: row.lines_skipped };
          },
        },
        extraction.id,
        supplierChoice,
      );
      toast.dismiss(loadingId);
      if (result.status === 'created') {
        const omitidas = result.linesSkipped > 0 ? ` ${result.linesSkipped} línea(s) sin importe no se copiaron; siguen en la extracción.` : '';
        toast.success(`Compra creada y vinculada al proveedor.${omitidas}`);
      } else if (result.status === 'already_linked') {
        toast.info('Esta extracción ya tiene compra vinculada. No se ha creado otra.');
      } else {
        toast.error(result.message);
      }
      await refetch();
    } catch (error) {
      toast.dismiss(loadingId);
      toast.error(`Error al aprobar: ${error instanceof Error ? error.message : 'Desconocido'}`);
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!extraction) return;
    try {
      setIsApproving(true);

      // Update approval status
      const { error: updateError } = await supabase
        .from('document_extractions')
        .update({
          approval_status: 'rejected',
          approval_timestamp: new Date().toISOString(),
        })
        .eq('id', extraction.id);

      if (updateError) throw updateError;

      // Refetch to show updated state
      await refetch();
      toast.info('Extracción rechazada');
    } catch (error) {
      toast.error(`Error al rechazar: ${error instanceof Error ? error.message : 'Desconocido'}`);
    } finally {
      setIsApproving(false);
    }
  };

  if (!id) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">ID de extracción no válido</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigate({ to: '/documents' })}
          >
            Volver a documentos
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">Cargando extracción...</p>
        </div>
      </div>
    );
  }

  if (error || !extraction) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">Extracción no encontrada</p>
          <p className="text-xs text-muted-foreground mt-2">ID: {id || 'undefined'}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigate({ to: '/documents' })}
          >
            Volver a documentos
          </Button>
        </div>
      </div>
    );
  }

  const doc = extraction.documents;
  const raw = extraction.raw_response as any;

  const confidenceColor = (score: number) => {
    if (score >= 0.85) return 'text-green-600 bg-green-50 dark:bg-green-950';
    if (score >= 0.70) return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950';
    return 'text-red-600 bg-red-50 dark:bg-red-950';
  };

  const lines = raw?.extraction?.lines || [];
  const vendor = raw?.extraction?.vendor || {};
  const invoice = raw?.extraction?.invoice || {};
  const totals = raw?.extraction?.totals || {};
  const confidence = raw?.confidence || {};
  const warnings = raw?.warnings || [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 border-b bg-card p-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate({ to: '/documents' })}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Detalle de Extracción</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {doc?.original_name || 'Documento'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="h-4 w-4 mr-2" />
          Descargar PDF
        </Button>
      </div>

      <div className="space-y-6 p-6">
        {/* Estado de Extracción */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-card border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <h3 className="font-semibold">Estado de Procesamiento</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estado:</span>
                <span className="capitalize">{extraction.processing_state}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Procesado:</span>
                <span>
                  {new Date(extraction.extracted_at).toLocaleDateString('es-ES')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Modelo IA:</span>
                <span className="font-mono text-xs">{extraction.extraction_model}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Intento:</span>
                <span>#{extraction.attempt_number}</span>
              </div>
            </div>
          </div>

          <div className="bg-card border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <h3 className="font-semibold">Confianza de Extracción</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">General:</span>
                <span className={`px-2 py-1 rounded text-xs font-semibold ${confidenceColor(confidence.overall || 0)}`}>
                  {((confidence.overall || 0) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Proveedor:</span>
                <span className="text-xs">{((confidence.supplier || 0) * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Factura:</span>
                <span className="text-xs">{((confidence.invoice_number || 0) * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Líneas:</span>
                <span className="text-xs">{((confidence.lines || 0) * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Advertencias */}
        {warnings.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-3">
              Advertencias de Extracción ({warnings.length})
            </h3>
            <ul className="space-y-2">
              {warnings.map((warning: string, idx: number) => (
                <li key={idx} className="text-sm text-amber-800 dark:text-amber-200 flex gap-2">
                  <span className="text-lg">•</span>
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Información del Proveedor */}
        <div className="bg-card border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Información del Proveedor</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-1">Nombre</p>
              <p className="font-medium">{vendor.name || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">NIF/CIF</p>
              <p className="font-mono">{vendor.tax_id || '—'}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-muted-foreground mb-1">Dirección</p>
              <p>{vendor.address || '—'}</p>
            </div>
          </div>
        </div>

        {/* Información de la Factura */}
        <div className="bg-card border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Información de la Factura</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-1">Número</p>
              <p className="font-mono font-semibold">{invoice.number || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Fecha de Emisión</p>
              <p>
                {invoice.date
                  ? new Date(invoice.date).toLocaleDateString('es-ES')
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Fecha de Vencimiento</p>
              <p>
                {invoice.due_date
                  ? new Date(invoice.due_date).toLocaleDateString('es-ES')
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Moneda</p>
              <p className="font-mono">{totals.currency || 'EUR'}</p>
            </div>
          </div>
        </div>

        {/* Totales */}
        <div className="bg-card border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Totales</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Base Imponible:</span>
              <span className="font-mono font-medium">
                {totals.subtotal !== null && totals.subtotal !== undefined
                  ? `${totals.subtotal.toFixed(2)} €`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Impuestos (IVA):</span>
              <span className="font-mono font-medium">
                {totals.tax !== null && totals.tax !== undefined
                  ? `${totals.tax.toFixed(2)} €`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tasa de IVA:</span>
              <span className="font-mono">
                {totals.tax_rate !== null && totals.tax_rate !== undefined
                  ? `${totals.tax_rate.toFixed(1)}%`
                  : '—'}
              </span>
            </div>
            <div className="border-t pt-3 flex justify-between font-semibold">
              <span>Total:</span>
              <span className="font-mono">
                {totals.total !== null && totals.total !== undefined
                  ? `${totals.total.toFixed(2)} €`
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Líneas de Factura */}
        {lines.length > 0 && (
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold">Líneas de Factura ({lines.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Descripción</th>
                    <th className="text-right px-4 py-3 font-semibold">Cantidad</th>
                    <th className="text-right px-4 py-3 font-semibold">Precio</th>
                    <th className="text-right px-4 py-3 font-semibold">IVA</th>
                    <th className="text-right px-4 py-3 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line: any, idx: number) => (
                    <tr key={idx} className="border-b hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">{line.description || '—'}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {line.sku && `SKU: ${line.sku}`}
                            {line.sku && line.ean && ' • '}
                            {line.ean && `EAN: ${line.ean}`}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {line.quantity !== null && line.quantity !== undefined
                          ? line.quantity.toString()
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {line.unit_price !== null && line.unit_price !== undefined
                          ? `${line.unit_price.toFixed(2)} €`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="text-xs">
                          {line.tax_rate !== null && line.tax_rate !== undefined
                            ? `${line.tax_rate.toFixed(1)}%`
                            : '—'}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {line.line_tax !== null && line.line_tax !== undefined
                            ? `${line.line_tax.toFixed(2)} €`
                            : '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">
                        {line.line_total !== null && line.line_total !== undefined
                          ? `${line.line_total.toFixed(2)} €`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Nota de Revisión */}
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <p className="text-sm text-blue-900 dark:text-blue-100">
            <span className="font-semibold">ℹ️ Extracción por IA:</span> Los datos mostrados han sido extraídos
            automáticamente de un documento mediante inteligencia artificial. Revisa cuidadosamente antes de usar
            estos datos en operaciones comerciales. La confianza indicada es un estimado, no una garantía de exactitud.
          </p>
        </div>

        {/* Proveedor no detectado: se elige o se escribe antes de aprobar */}
        {!extraction.vendor_name?.trim() && (extraction.approval_status as any) !== 'approved' && (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-sm">Proveedor no detectado</h3>
            <p className="text-xs text-muted-foreground">
              La IA no encontró el nombre del proveedor en este documento. Elige un proveedor existente o escribe el nombre de uno nuevo.
              No se crea nada hasta que pulses «Aprobar y crear compra».
            </p>
            <select
              value={manualSupplierId}
              onChange={(e) => setManualSupplierId(e.target.value)}
              disabled={!!newSupplierName.trim()}
              className="w-full border rounded-md p-2 text-sm bg-background"
            >
              <option value="">— Elegir proveedor existente —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <input
              value={newSupplierName}
              onChange={(e) => setNewSupplierName(e.target.value)}
              disabled={!!manualSupplierId}
              placeholder="o nombre de proveedor nuevo"
              className="w-full border rounded-md p-2 text-sm bg-background"
            />
          </div>
        )}

        {/* Estado de Aprobación */}
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Estado de Aprobación</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Estado actual:{' '}
                <span className={`font-semibold ${
                  extraction.approval_status === 'approved' ? 'text-green-600' :
                  extraction.approval_status === 'rejected' ? 'text-red-600' :
                  'text-amber-600'
                }`}>
                  {extraction.approval_status === 'approved' ? 'Aprobado' :
                   extraction.approval_status === 'rejected' ? 'Rechazado' :
                   'Pendiente de revisión'}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Botones de Acción */}
        <div className="flex gap-3 justify-between pt-6 border-t">
          <Button variant="outline" onClick={() => navigate({ to: '/documents' })}>
            Volver
          </Button>
          <div className="flex gap-2">
            {(extraction.approval_status as any) !== 'approved' && (
              <Button
                variant="destructive"
                size="sm"
                disabled={(extraction.approval_status as any) === 'rejected' || isApproving}
                onClick={handleReject}
              >
                Rechazar
              </Button>
            )}
            {profile?.role_id === 'admin' && (extraction.approval_status as any) !== 'rejected' && !(extraction as any).purchase_id && (
              <Button
                size="sm"
                disabled={isApproving}
                onClick={handleApproveAndCreatePurchase}
              >
                {isApproving ? 'Procesando...' : 'Aprobar y crear compra'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
