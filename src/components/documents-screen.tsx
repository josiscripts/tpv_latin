import { useState, useMemo, useRef, useEffect } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Download, Trash2, Search, Upload, Edit2, Zap, AlertCircle, Eye, FileText, Truck, Files, BarChart3, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import JSZip from 'jszip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from './app-shell';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  useDocumentsSearch,
  useDocumentsByDateRange,
  useDeleteDocument,
  useUploadDocument,
  useUpdateDocument,
  useProcessDocument,
} from '@/hooks/useDocuments';
import { useAuth } from '@/hooks/useAuth';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { documentsService, type DocumentSearchStatus } from '@/services/documents.service';
import { DocumentViewerModal } from './document-viewer-modal';
import { toast } from 'sonner';

type DocumentType = 'invoice' | 'delivery_note';

const ALLOWED_FORMATS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const PAGE_SIZE = 20;
const SEARCH_PAGE_SIZE_MAX = 100; // límite de search_documents por petición (ZIP recorre todas las páginas)

export function DocumentsScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: preferences } = useUserPreferences(user?.id || null);

  const [documentType, setDocumentType] = useState<DocumentType | 'all'>('all');
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [searchActive, setSearchActive] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [documentStatus, setDocumentStatus] = useState<DocumentSearchStatus | 'all'>('all');
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDocType, setNewDocType] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDocument, setViewerDocument] = useState<any>(null);

  const deleteDocument = useDeleteDocument();
  const uploadDocument = useUploadDocument();
  const updateDocument = useUpdateDocument();
  const processDocument = useProcessDocument();
  const [processingDocId, setProcessingDocId] = useState<string | null>(null);

  // Búsqueda y filtros en servidor, paginados. Las fechas solo se aplican al pulsar «Buscar».
  const debouncedSearch = useDebouncedValue(search, 300);
  const searchParams = useMemo(() => ({
    query: debouncedSearch.trim() || undefined,
    documentType: documentType === 'all' ? undefined : documentType,
    status: documentStatus === 'all' ? undefined : documentStatus,
    from: searchActive && fromDate ? fromDate : undefined,
    to: searchActive && toDate ? toDate : undefined,
    page,
    pageSize: PAGE_SIZE,
  }), [debouncedSearch, documentType, documentStatus, fromDate, toDate, searchActive, page]);

  const { data: searchResult, isLoading } = useDocumentsSearch(searchParams);
  const documents = searchResult?.items ?? [];
  const total = searchResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveSearch = debouncedSearch.trim().length > 0;

  // Cualquier cambio de búsqueda o filtro vuelve a la primera página
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, documentType, documentStatus, fromDate, toDate, searchActive]);

  // Si la lista se reduce y la página actual ya no existe, volver a la última válida
  useEffect(() => {
    if (searchResult && page > totalPages) setPage(totalPages);
  }, [searchResult, page, totalPages]);

  // Abrir un documento desde la búsqueda global (?selected=id), esté o no en la página actual
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedId = params.get('selected');
    if (!selectedId) return;
    documentsService
      .getById(selectedId)
      .then((doc) => {
        setViewerDocument(doc);
        setViewerOpen(true);
        window.history.replaceState({}, '', '/documents');
      })
      .catch(() => {
        window.history.replaceState({}, '', '/documents');
      });
  }, []);

  // Recorre todas las páginas de la búsqueda activa (para el ZIP)
  const fetchAllMatches = async () => {
    const all: typeof documents = [];
    let p = 1;
    while (all.length < total || p === 1) {
      const res = await documentsService.search({ ...searchParams, page: p, pageSize: SEARCH_PAGE_SIZE_MAX });
      all.push(...res.items);
      if (res.items.length < SEARCH_PAGE_SIZE_MAX) break;
      p += 1;
    }
    return all;
  };

  const typeLabel = {
    invoice: 'Facturas',
    delivery_note: 'Albaranes',
    all: 'Todos',
  };

  // Contadores reales de toda la búsqueda activa (no solo de la página visible)
  const counts = {
    invoices: searchResult?.invoices ?? 0,
    deliveryNotes: searchResult?.delivery_notes ?? 0,
    others: searchResult?.others ?? 0,
    total,
  };

  const handleDownloadFile = async (doc: any) => {
    try {
      const url = await documentsService.getSignedUrl(doc.file_path);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.original_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Descargado: ${doc.original_name}`);
    } catch (error) {
      toast.error('Error al descargar archivo');
    }
  };

  const handleDownloadZip = async () => {
    try {
      setIsDownloadingZip(true);

      const zip = new JSZip();
      const fileMap = new Map<string, number>();
      const allDocs = await fetchAllMatches();

      for (const doc of allDocs) {
        try {
          const blob = await documentsService.downloadFile(doc.file_path);
          let fileName = doc.original_name;

          // Evitar sobrescrituras en el ZIP
          if (fileMap.has(fileName)) {
            const count = fileMap.get(fileName)! + 1;
            fileMap.set(fileName, count);
            const parts = fileName.split('.');
            const ext = parts.pop();
            const name = parts.join('.');
            fileName = `${name}_${count}.${ext}`;
          } else {
            fileMap.set(fileName, 1);
          }

          zip.file(fileName, blob);
        } catch (err) {
          console.error(`Failed to download ${doc.original_name}:`, err);
        }
      }

      const zipName = generateZipName(documentType, fromDate, toDate);
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = zipName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      toast.success(`ZIP descargado: ${zipName}`);
    } catch (error) {
      console.error('Error al crear ZIP:', error);
      toast.error('Error al crear ZIP');
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_FORMATS.includes(fileExt)) {
      toast.error(`Formato no permitido. Permitidos: ${ALLOWED_FORMATS.join(', ')}`);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error('El archivo no puede exceder 50 MB');
      return;
    }

    try {
      await uploadDocument.mutateAsync({
        file,
        documentType: documentType === 'all' ? 'invoice' : (documentType as DocumentType),
      });
      toast.success('Documento subido correctamente');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      toast.error(`Error al subir documento: ${(error as { message?: string })?.message ?? 'Desconocido'}`);
    }
  };

  const handleEditDocument = async (docId: string) => {
    if (!newName.trim()) {
      toast.error('Ingrese un nombre válido');
      return;
    }

    try {
      await updateDocument.mutateAsync({
        docId,
        updates: {
          original_name: newName,
          ...(newDocType && { document_type: newDocType })
        }
      });
      toast.success('Documento actualizado');
      setRenaming(null);
      setNewName('');
      setNewDocType('');
    } catch (error) {
      toast.error(`Error al actualizar documento: ${(error as { message?: string })?.message ?? 'Desconocido'}`);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (confirm('¿Eliminar este documento?')) {
      try {
        await deleteDocument.mutateAsync(docId);
        toast.success('Documento eliminado');
      } catch (error) {
        toast.error(`Error al eliminar documento: ${(error as { message?: string })?.message ?? 'Desconocido'}`);
      }
    }
  };

  const handleSearch = () => {
    setSearchActive(true);
  };

  const handleReset = () => {
    setFromDate(null);
    setToDate(null);
    setDocumentType('all');
    setSearchActive(false);
    setSearch('');
    setDocumentStatus('all');
    setPage(1);
  };

  const handleProcessDocument = async (docId: string) => {
    try {
      setProcessingDocId(docId);
      const aiModelId = preferences?.ai_model_id || 'claude-haiku-5-5';
      // Solo extracción con IA: no crea compras ni proveedores. La aprobación es manual en la revisión.
      const result = await processDocument.mutateAsync({ docId, aiModelId });
      if (result.extraction_id) {
        toast.success(result.isIdempotent ? 'Documento ya procesado. Abriendo revisión...' : 'Extracción guardada. Revísala antes de crear la compra.');
        navigate({ to: `/documents/extraction/${result.extraction_id}` });
      } else {
        toast.warning('Documento procesado pero no se encontró la extracción');
      }
    } catch (error) {
      toast.error(`Error al procesar documento: ${error instanceof Error ? error.message : 'Desconocido'}`);
    } finally {
      setProcessingDocId(null);
    }
  };

  const handleViewDocument = (doc: any) => {
    setViewerDocument(doc);
    setViewerOpen(true);
  };

  return (
    <>
      <PageHeader title="Documentos" subtitle="Gestión de facturas y albaranes" />

      {/* Upload Section */}
      <div className="mb-6 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Subir Documento</h3>
          <label className="cursor-pointer">
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_FORMATS.join(',')}
              onChange={handleFileSelect}
              className="hidden"
              disabled={uploadDocument.isPending}
            />
            <Button
              size="sm"
              variant="outline"
              asChild
              className="cursor-pointer"
              disabled={uploadDocument.isPending}
            >
              <span>
                <Upload size={14} className="mr-1" />
                {uploadDocument.isPending ? 'Subiendo...' : 'Subir Documento'}
              </span>
            </Button>
          </label>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Formatos permitidos: PDF, DOC, DOCX, JPG, JPEG, PNG (máx. 50 MB)
        </p>
      </div>

      {/* Filters Section */}
      <div className="mb-6 space-y-4 rounded-lg border bg-card p-4">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, proveedor o número de documento..."
            aria-label="Buscar documentos"
            className="w-full pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Type Tabs */}
        <div className="flex gap-2">
          {(['all', 'invoice', 'delivery_note'] as const).map((type) => (
            <Button
              key={type}
              variant={documentType === type ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setDocumentType(type);
                setSearchActive(false);
              }}
            >
              {typeLabel[type]}
            </Button>
          ))}
        </div>

        {/* Estado del documento */}
        <div className="max-w-xs">
          <label className="text-sm font-medium">Estado</label>
          <Select value={documentStatus} onValueChange={(v) => { setDocumentStatus(v as DocumentSearchStatus | 'all'); }}>
            <SelectTrigger aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="uploaded">Subido</SelectItem>
              <SelectItem value="processing">Procesando</SelectItem>
              <SelectItem value="processed">Procesado</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Desde</label>
            <Input
              type="date"
              value={fromDate ? format(fromDate, 'yyyy-MM-dd') : ''}
              onChange={(e) => setFromDate(e.target.value ? new Date(e.target.value) : null)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Hasta</label>
            <Input
              type="date"
              value={toDate ? format(toDate, 'yyyy-MM-dd') : ''}
              onChange={(e) => setToDate(e.target.value ? new Date(e.target.value) : null)}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button onClick={handleSearch} variant="default" size="sm">
            <Search className="mr-2 h-4 w-4" />
            Buscar
          </Button>
          <Button onClick={handleReset} variant="outline" size="sm">
            Limpiar
          </Button>
          <Button
            onClick={handleDownloadZip}
            disabled={total === 0 || isDownloadingZip}
            variant="outline"
            size="sm"
          >
            <Download className="mr-2 h-4 w-4" />
            Descargar ZIP
          </Button>
        </div>
      </div>

      {/* Counters */}
      <div className="mb-4 grid grid-cols-4 gap-4">
        <div className="rounded-lg bg-blue-50 p-4 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-gray-700">Facturas</div>
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-blue-600">{counts.invoices}</div>
        </div>
        <div className="rounded-lg bg-emerald-50 p-4 border border-emerald-200">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-gray-700">Albaranes</div>
            <Truck className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-600">{counts.deliveryNotes}</div>
        </div>
        <div className="rounded-lg bg-violet-50 p-4 border border-violet-200">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-gray-700">Otros</div>
            <Files className="h-5 w-5 text-violet-600" />
          </div>
          <div className="text-2xl font-bold text-violet-600">{counts.others}</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-4 border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-gray-700">Total</div>
            <BarChart3 className="h-5 w-5 text-slate-600" />
          </div>
          <div className="text-2xl font-bold text-slate-700">{counts.total}</div>
        </div>
      </div>

      {/* Documents Table */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Cargando documentos...</div>
        ) : documents.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {hasActiveSearch ? 'No se encontraron documentos con esa búsqueda' : 'No hay documentos que mostrar'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 font-semibold text-left">Tipo</th>
                <th className="px-4 py-3 font-semibold text-left">Documento</th>
                <th className="px-4 py-3 font-semibold text-left">Fecha</th>
                <th className="px-4 py-3 font-semibold text-left">Referencia</th>
                <th className="px-4 py-3 font-semibold text-left">Tamaño</th>
                <th className="px-4 py-3 font-semibold text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                      doc.document_type === 'invoice'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {doc.document_type === 'invoice' ? 'Factura' : 'Albarán'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{doc.original_name}</td>
                  <td className="px-4 py-3">
                    {format(new Date(doc.created_at), 'dd/MM/yyyy HH:mm')}
                  </td>
                  <td className="px-4 py-3">
                    {doc.sale_id && <span className="text-gray-600">Venta</span>}
                    {doc.purchase_id && <span className="text-gray-600">Compra</span>}
                  </td>
                  <td className="px-4 py-3">
                    {doc.file_size
                      ? `${(doc.file_size / 1024).toFixed(2)} KB`
                      : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 flex-wrap">
                      {/* Process with IA button - show for uploaded status */}
                      {(doc as any).processing_status === 'uploaded' && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleProcessDocument(doc.id)}
                          disabled={processingDocId === doc.id}
                          title="Procesar con IA"
                        >
                          <Zap className="h-4 w-4 mr-1" />
                          {processingDocId === doc.id ? 'Procesando...' : 'Procesar'}
                        </Button>
                      )}

                      {/* Status indicator for processing */}
                      {(doc as any).processing_status === 'processing' && (
                        <Button size="sm" variant="outline" disabled>
                          <span className="animate-spin">⟳</span> Procesando...
                        </Button>
                      )}

                      {/* Status indicator for error */}
                      {(doc as any).processing_status === 'error' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleProcessDocument(doc.id)}
                          className="text-red-600"
                          title="Reintentar procesamiento"
                        >
                          <AlertCircle className="h-4 w-4 mr-1" />
                          Reintentar
                        </Button>
                      )}

                      {/* Review button for processed status */}
                      {(doc as any).processing_status === 'processed' && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => {
                            // Fetch extraction ID and navigate
                            documentsService.getDocumentExtraction(doc.id).then((ext) => {
                              if (ext?.id) {
                                navigate({ to: `/documents/extraction/${ext.id}` });
                              } else {
                                toast.error('Extracción no encontrada');
                              }
                            });
                          }}
                          title="Ver detalles de extracción"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Revisar
                        </Button>
                      )}

                      {/* Approve status indicator */}
                      {(doc as any).processing_status === 'approved' && (
                        <Button size="sm" variant="outline" disabled className="text-green-600">
                          ✓ Confirmado
                        </Button>
                      )}

                      {/* Reject status indicator */}
                      {(doc as any).processing_status === 'rejected' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleProcessDocument(doc.id)}
                          title="Reprocesar"
                        >
                          Reprocesar
                        </Button>
                      )}

                      <Dialog open={renaming === doc.id} onOpenChange={(open) => {
                        if (!open) setRenaming(null);
                      }}>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setRenaming(doc.id);
                              setNewName(doc.original_name);
                              setNewDocType(doc.document_type || '');
                            }}
                            title="Editar"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[400px]">
                          <DialogHeader>
                            <DialogTitle>Editar documento</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <Label>Nuevo nombre</Label>
                              <Input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Nombre del documento"
                              />
                            </div>
                            <div>
                              <Label>Tipo</Label>
                              <Select value={newDocType} onValueChange={setNewDocType}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Seleccionar tipo" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="invoice">Factura</SelectItem>
                                  <SelectItem value="delivery_note">Albarán</SelectItem>
                                  <SelectItem value="other">Otro</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button
                              variant="outline"
                              onClick={() => setRenaming(null)}
                            >
                              Cancelar
                            </Button>
                            <Button
                              onClick={() => handleEditDocument(doc.id)}
                              disabled={updateDocument.isPending}
                            >
                              {updateDocument.isPending ? 'Guardando...' : 'Guardar'}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewDocument(doc)}
                        title="Ver documento"
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadFile(doc)}
                        title="Descargar"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteDocument(doc.id)}
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación y número real de resultados */}
      {total > 0 && (
        <div className="mt-3 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-muted-foreground">
            Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total} documento{total === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[5rem] text-center">
              Página {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              aria-label="Página siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {viewerDocument && (
        <DocumentViewerModal
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          document={viewerDocument}
        />
      )}
    </>
  );
}

function generateZipName(
  documentType: string | DocumentType,
  fromDate: Date | null,
  toDate: Date | null
): string {
  const typeLabel =
    documentType === 'invoice'
      ? 'facturas'
      : documentType === 'delivery_note'
        ? 'albaranes'
        : 'documentos';

  if (fromDate && toDate) {
    const from = format(fromDate, 'yyyy-MM-dd');
    const to = format(toDate, 'yyyy-MM-dd');
    return `${typeLabel}_${from}_${to}.zip`;
  }

  return `${typeLabel}_todos.zip`;
}
