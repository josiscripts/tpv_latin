import { useState, useRef } from 'react';
import { Download, FileIcon, Trash2, Upload, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDocumentsBySale, useDocumentsByPurchase, useUploadDocument, useDeleteDocument, useRenameDocument } from '@/hooks/useDocuments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface DocumentsPanelProps {
  saleId?: string;
  purchaseId?: string;
  title?: string;
}

export function DocumentsPanel({ saleId, purchaseId, title = 'Documentos' }: DocumentsPanelProps) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: documents = [], isLoading } = saleId
    ? useDocumentsBySale(saleId)
    : useDocumentsByPurchase(purchaseId || '');

  const uploadDocument = useUploadDocument();
  const deleteDocument = useDeleteDocument();
  const renameDocument = useRenameDocument();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Solo se permiten archivos PDF');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('El archivo no puede exceder 10 MB');
      return;
    }

    try {
      await uploadDocument.mutateAsync({
        file,
        saleId,
        purchaseId,
        documentType: 'invoice',
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

  const handleDelete = async (docId: string) => {
    if (confirm('¿Eliminar este documento?')) {
      try {
        await deleteDocument.mutateAsync(docId);
        toast.success('Documento eliminado');
      } catch (error) {
        toast.error('Error al eliminar documento');
      }
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm">{title}</h3>
        <label className="cursor-pointer">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
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
              {uploadDocument.isPending ? 'Subiendo...' : 'Subir PDF'}
            </span>
          </Button>
        </label>
      </div>

      {isLoading ? (
        <div className="text-center py-4 text-sm text-muted-foreground">Cargando documentos...</div>
      ) : documents.length === 0 ? (
        <div className="text-center py-4 text-sm text-muted-foreground">Sin documentos</div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between p-2 rounded border bg-muted/30 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <FileIcon size={14} className="text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{doc.original_name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(doc.created_at).toLocaleDateString('es-ES')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => {
                        setRenaming(doc.id);
                        setNewName(doc.original_name);
                      }}
                    >
                      <Edit2 size={12} />
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
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  asChild
                >
                  <a
                    href={`${process.env.VITE_SUPABASE_URL}/storage/v1/object/public/documents/${doc.file_path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Descargar"
                  >
                    <Download size={12} />
                  </a>
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(doc.id)}
                  disabled={deleteDocument.isPending}
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
