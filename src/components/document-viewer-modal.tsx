import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, ZoomIn, ZoomOut } from 'lucide-react';
import { toast } from 'sonner';
import { documentsService } from '@/services/documents.service';

interface DocumentViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: {
    id: string;
    original_name: string;
    file_path: string;
  };
}

export function DocumentViewerModal({ open, onOpenChange, document: doc }: DocumentViewerModalProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const fileExt = doc.original_name.split('.').pop()?.toLowerCase() || '';

  useEffect(() => {
    if (open) {
      loadSignedUrl();
    } else {
      setSignedUrl(null);
      setError(null);
      setZoom(100);
    }
  }, [open, doc.id]);

  const loadSignedUrl = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = await documentsService.getSignedUrl(doc.file_path, 3600);
      setSignedUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el documento');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      const blob = await documentsService.downloadFile(doc.file_path);
      const link = globalThis.document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = doc.original_name;
      globalThis.document.body.appendChild(link);
      link.click();
      globalThis.document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      toast.success(`Descargado: ${doc.original_name}`);
    } catch (err) {
      toast.error('Error al descargar documento');
    }
  };

  const isPdf = fileExt === 'pdf';
  const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(fileExt);
  const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(fileExt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] h-[98vh] max-w-none max-h-none p-0 flex flex-col">
        <div className="absolute top-2 right-2 z-[100] pointer-events-auto">
          <button
            onClick={() => onOpenChange(false)}
            className="flex items-center justify-center w-10 h-10 bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg text-xl font-bold transition-colors"
            aria-label="Cerrar"
            title="Cerrar (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center" style={{ minHeight: 0 }}>
          {loading && (
            <div className="text-center text-gray-600">
              <div className="inline-block animate-spin">⟳</div>
              <p className="mt-2">Cargando documento...</p>
            </div>
          )}

          {error && !loading && (
            <div className="text-center text-red-600 p-4">
              <p className="font-semibold">Error al cargar</p>
              <p className="text-sm mt-1">{error}</p>
              {isOffice && (
                <p className="text-sm text-gray-600 mt-3">
                  No se puede previsualizar documentos {fileExt.toUpperCase()}. Puedes descargar el archivo para abrirlo.
                </p>
              )}
            </div>
          )}

          {!loading && !error && signedUrl && (
            <div className="w-full h-full flex items-center justify-center p-4">
              {isPdf && (
                <iframe
                  src={`${signedUrl}#toolbar=1&navpanes=0&scrollbar=1`}
                  className="w-full h-full border-0"
                  title="PDF Viewer"
                />
              )}

              {isImage && (
                <div className="w-full h-full flex items-center justify-center overflow-auto">
                  <img
                    src={signedUrl}
                    alt={(doc as any).original_name}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      width: `${zoom}%`,
                      objectFit: 'contain',
                    }}
                  />
                </div>
              )}

              {!isPdf && !isImage && (
                <div className="text-center text-gray-600">
                  <p className="font-semibold">Formato no compatible para previsualización</p>
                  <p className="text-sm mt-2">Tipo: {fileExt.toUpperCase()}</p>
                  <p className="text-sm text-gray-500 mt-3">Descarga el archivo para abrirlo en tu aplicación</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between bg-white bg-opacity-90 rounded-lg p-3 z-50">
          <div className="flex gap-2">
            {isImage && signedUrl && !error && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setZoom(Math.max(50, zoom - 10))}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs text-gray-600 px-2 py-2">{zoom}%</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setZoom(Math.min(200, zoom + 10))}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={handleDownload}
            >
              <Download className="h-4 w-4 mr-1" />
              Descargar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
