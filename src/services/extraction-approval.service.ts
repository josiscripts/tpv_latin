// Aprobación de extracciones. La creación de compra es atómica en la base de datos
// (approve_extraction_create_purchase): este servicio solo resuelve el proveedor y llama a esa función.
export interface ApprovalRpcResult {
  purchaseId: string;
  created: boolean;
  linesCopied: number;
  linesSkipped: number;
}

export interface ApprovalDeps {
  linkSupplier(extractionId: string): Promise<{ supplierId: string; conflict?: string }>;
  approve(extractionId: string, supplierId: string): Promise<ApprovalRpcResult>;
}

export type ApprovalResult =
  | { status: 'created'; purchaseId: string; supplierId: string; linesCopied: number; linesSkipped: number }
  | { status: 'already_linked'; purchaseId: string; supplierId: string }
  | { status: 'error'; message: string };

// Si el administrador eligió el proveedor en la revisión (p. ej. la IA no lo detectó),
// se usa ese proveedor y no se intenta deducirlo del documento.
export async function approveExtractionAndCreatePurchase(
  deps: ApprovalDeps,
  extractionId: string,
  manualSupplierId?: string,
): Promise<ApprovalResult> {
  let supplierId: string;
  if (manualSupplierId) {
    supplierId = manualSupplierId;
  } else {
    try {
      const supplier = await deps.linkSupplier(extractionId);
      if (supplier.conflict) {
        return { status: 'error', message: `Proveedor ambiguo: ${supplier.conflict}. Revisar manualmente.` };
      }
      supplierId = supplier.supplierId;
    } catch (err) {
      return { status: 'error', message: `No se pudo vincular el proveedor: ${messageOf(err)}` };
    }
  }

  try {
    const result = await deps.approve(extractionId, supplierId);
    if (!result.created) {
      return { status: 'already_linked', purchaseId: result.purchaseId, supplierId };
    }
    return {
      status: 'created',
      purchaseId: result.purchaseId,
      supplierId,
      linesCopied: result.linesCopied,
      linesSkipped: result.linesSkipped,
    };
  } catch (err) {
    // Si la respuesta se pierde, el reintento devuelve already_linked: la compra no se duplica.
    return { status: 'error', message: `No se pudo aprobar: ${messageOf(err)}` };
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Desconocido';
}
