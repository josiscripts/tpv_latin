import { useState, useMemo, useRef } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Download, Trash2, Search, Upload, Edit2 } from 'lucide-react';
import JSZip from 'jszip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from './app-shell';
import {
  useDocuments,
  useDocumentsByDateRange,
  useDeleteDocument,
  useUploadDocument,
  useRenameDocument,
} from '@/hooks/useDocuments';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { documentsService } from '@/services/documents.service';
import { toast } from 'sonner';

type DocumentType = 'invoice' | 'delivery_note';

const ALLOWED_FORMATS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export function DocumentsScreen() {
  const [documentType, setDocumentType] = useState<DocumentType | 'all'>('all');
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [searchActive, setSearchActive] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const deleteDocument = useDeleteDocument();
  const uploadDocument = useUploadDocument();
  const renameDocument = useRenameDocument();

  // Fetch documents based on filters
  const filterObj = useMemo(() => {
    if (!searchActive || (!fromDate && !toDate)) {
      return documentType === 'all' ? {} : { documentType: documentType as DocumentType };
    }

    const filter: any = {};
    if (documentType !== 'all') {
      filter.documentType = documentType;
    }
    if (fromDate) filter.fromDate = fromDate;
    if (toDate) filter.toDate = toDate;
    return filter;
  }, [documentType, fromDate, toDate, searchActive]);

  const { data: documents = [], isLoading } = useDocuments(
    Object.keys(filterObj).length > 0 ? filterObj : undefined
  );

  const typeLabel = {
    invoice: 'Facturas',
    delivery_note: 'Albaranes',
    all: 'Todos',
  };

  const counts = useMemo(() => {
    const filtered = documents || [];
    return {
      invoices: filtered.filter((d) => d.document_type === 'invoice').length,
      deliveryNotes: filtered.filter((d) => d.document_type === 'delivery_note').length,
      total: filtered.length,
    };
  }, [documents]);

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

      for (const doc of documents) {
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
      toast.error('Error al subir documento');
    }
  };

  const handleRename = async (docId: string) => {
    if (!newName.trim()) {
      toast.error('Ingrese un nombre válido');
      return;
    }

    try {
      await renameDocument.mutateAsync({ docId, newName });
      toast.success('Documento renombrado');
      setRenaming(null);
      setNewName('');
    } catch (error) {
      toast.error('Error al renombrar documento');
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (confirm('¿Eliminar este documento?')) {
      try {
        await deleteDocument.mutateAsync(docId);
        toast.success('Documento eliminado');
      } catch (error) {
        toast.error('Error al eliminar documento');
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
            disabled={documents.length === 0 || isDownloadingZip}
            variant="outline"
            size="sm"
          >
            <Download className="mr-2 h-4 w-4" />
            Descargar ZIP
          </Button>
        </div>
      </div>

      {/* Counters */}
      <div className="mb-4 grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-blue-50 p-4">
          <div className="text-sm text-gray-600">Facturas</div>
          <div className="text-2xl font-bold text-blue-600">{counts.invoices}</div>
        </div>
        <div className="rounded-lg bg-green-50 p-4">
          <div className="text-sm text-gray-600">Albaranes</div>
          <div className="text-2xl font-bold text-green-600">{counts.deliveryNotes}</div>
        </div>
        <div className="rounded-lg bg-purple-50 p-4">
          <div className="text-sm text-gray-600">Total</div>
          <div className="text-2xl font-bold text-purple-600">{counts.total}</div>
        </div>
      </div>

      {/* Documents Table */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Cargando documentos...</div>
        ) : documents.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No hay documentos que mostrar
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
                    <div className="flex gap-2">
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
                            }}
                            title="Renombrar"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[400px]">
                          <DialogHeader>
                            <DialogTitle>Renombrar documento</DialogTitle>
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
                          </div>
                          <DialogFooter>
                            <Button
                              variant="outline"
                              onClick={() => setRenaming(null)}
                            >
                              Cancelar
                            </Button>
                            <Button
                              onClick={() => handleRename(doc.id)}
                              disabled={renameDocument.isPending}
                            >
                              {renameDocument.isPending ? 'Guardando...' : 'Guardar'}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

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
