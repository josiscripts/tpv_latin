import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, Edit2, Save, X, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSupplier, useUpdateSupplier, usePurchaseHistory, usePurchaseStats } from '@/hooks/useSuppliers';
import { supabase } from '@/lib/supabase';
import { money } from './pos-ui';
import type { Database } from '@/lib/database.types';

type SupplierUpdate = Database['public']['Tables']['suppliers']['Update'];

const supplierEditSchema = z.object({
  name: z.string().min(1),
  tax_id: z.string().optional(),
  contact_name: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
});

type SupplierEditData = z.infer<typeof supplierEditSchema>;

export function SupplierDetail({ supplierId, onBack }: { supplierId: string; onBack: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const { data: supplier, isLoading } = useSupplier(supplierId);
  const { data: history = [] } = usePurchaseHistory(supplierId);
  const { data: stats } = usePurchaseStats(supplierId);
  const updateSupplier = useUpdateSupplier();

  const form = useForm<SupplierEditData>({
    resolver: zodResolver(supplierEditSchema),
    values: supplier ? {
      name: supplier.name,
      tax_id: supplier.tax_id || '',
      contact_name: supplier.contact_name || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
    } : undefined,
  });

  const handleLogoUpload = async (file: File) => {
    if (!file) return;

    // Validar tipo y tamaño
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      toast.error('Archivo muy grande (máx 5MB)');
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Formato no permitido (JPG, PNG, WebP)');
      return;
    }

    try {
      setIsUploadingLogo(true);

      // 1. Crear preview local
      const reader = new FileReader();
      reader.onload = (e) => {
        setLogoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // 2. Upload a Storage (PRIVADO - requiere signed URL)
      const path = `${supplierId}/${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('supplier-logos')
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      // 3. Get signed URL (privado - válido por 1 hora)
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from('supplier-logos')
        .createSignedUrl(path, 3600); // 1 hora

      if (urlError) throw urlError;

      const signedUrl = signedUrlData?.signedUrl;
      if (!signedUrl) throw new Error('No se pudo generar URL firmada');

      // 4. Guardar referencia (path) en BD - la signed URL se genera bajo demanda
      try {
        await updateSupplier.mutateAsync({
          id: supplierId,
          updates: { logo_url: path }  // Guardamos el path, no la URL que expira
        });

        toast.success('Logo actualizado exitosamente');
      } catch (dbError) {
        // Si falla BD, eliminar archivo para evitar residuos
        await supabase.storage
          .from('supplier-logos')
          .remove([path])
          .catch(() => {}); // Silenciar error de eliminación

        throw dbError;
      }
    } catch (error) {
      console.error('Error al cargar logo:', error);
      toast.error('Error al cargar logo: ' + (error instanceof Error ? error.message : 'desconocido'));
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const onSubmit = async (data: SupplierEditData) => {
    try {
      const updates: SupplierUpdate = {
        name: data.name,
        tax_id: data.tax_id || null,
        contact_name: data.contact_name || null,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        // logo_url será agregado cuando migración esté disponible
      };

      await updateSupplier.mutateAsync({ id: supplierId, updates });
      toast.success('Proveedor actualizado');
      setIsEditing(false);
    } catch (error) {
      toast.error('Error al actualizar proveedor');
    }
  };

  if (isLoading) return <div className="p-8">Cargando proveedor...</div>;
  if (!supplier) return <div className="p-8">Proveedor no encontrado</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver
        </button>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="flex items-center gap-2 text-sm px-3 py-1 rounded hover:bg-muted"
        >
          {isEditing ? <X className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
          {isEditing ? 'Cancelar' : 'Editar'}
        </button>
      </div>

      {/* Main Info */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="border rounded-lg p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nombre comercial</Label>
              {isEditing ? (
                <Input {...form.register('name')} />
              ) : (
                <p className="text-sm font-semibold mt-1">{supplier.name}</p>
              )}
            </div>
            <div>
              <Label>NIF/CIF</Label>
              {isEditing ? (
                <Input {...form.register('tax_id')} />
              ) : (
                <p className="text-sm font-semibold mt-1">{supplier.tax_id || '—'}</p>
              )}
            </div>
          </div>

          {/* Logo Section */}
          <div className="border-t pt-4">
            <Label>Logo del proveedor</Label>
            {isEditing ? (
              <div className="mt-3 space-y-3">
                {/* Logo Preview - 112px (7rem) */}
                <div className="w-28 h-28 bg-gray-100 rounded border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-center text-sm text-gray-500">
                      <Upload className="w-6 h-6 mx-auto mb-2 opacity-50" />
                      <p>Sin logo</p>
                    </div>
                  )}
                </div>

                {/* File Input */}
                <div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoUpload(file);
                    }}
                    disabled={isUploadingLogo}
                    className="text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">JPG, PNG o WebP. Máx 5MB. Proporción 1:1.</p>
                </div>
              </div>
            ) : (
              <div className="mt-3 w-28 h-28 bg-gray-100 rounded border border-gray-300 flex items-center justify-center overflow-hidden">
                {logoPreview || (supplier as any).logo_url_signed ? (
                  <img
                    src={logoPreview || (supplier as any).logo_url_signed}
                    alt={supplier.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center text-sm text-gray-500">
                    <div className="text-lg font-bold">{supplier.name.substring(0, 2).toUpperCase()}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <Label>Persona de contacto</Label>
            {isEditing ? (
              <Input {...form.register('contact_name')} />
            ) : (
              <p className="text-sm mt-1">{supplier.contact_name || '—'}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Email</Label>
              {isEditing ? (
                <Input type="email" {...form.register('email')} />
              ) : (
                <p className="text-sm mt-1">{supplier.email || '—'}</p>
              )}
            </div>
            <div>
              <Label>Teléfono</Label>
              {isEditing ? (
                <Input {...form.register('phone')} />
              ) : (
                <p className="text-sm mt-1">{supplier.phone || '—'}</p>
              )}
            </div>
          </div>

          <div>
            <Label>Dirección</Label>
            {isEditing ? (
              <Input {...form.register('address')} />
            ) : (
              <p className="text-sm mt-1">{supplier.address || '—'}</p>
            )}
          </div>

          {isEditing && (
            <div className="flex gap-2 justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditing(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={updateSupplier.isPending}
              >
                <Save className="w-4 h-4 mr-2" />
                {updateSupplier.isPending ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </div>
          )}
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-4">
            <div className="border rounded-lg p-4 text-center">
              <p className="text-2xl font-bold">{stats.totalPurchases}</p>
              <p className="text-xs text-muted-foreground">Total de compras</p>
            </div>
            <div className="border rounded-lg p-4 text-center">
              <p className="text-2xl font-bold">{stats.receivedPurchases}</p>
              <p className="text-xs text-muted-foreground">Compras recibidas</p>
            </div>
            <div className="border rounded-lg p-4 text-center">
              <p className="text-lg font-bold">{money(stats.totalSpent)}</p>
              <p className="text-xs text-muted-foreground">Total gastado</p>
            </div>
            <div className="border rounded-lg p-4 text-center">
              <p className="text-xs text-muted-foreground">Última compra</p>
              <p className="text-sm font-semibold mt-1">
                {stats.lastPurchase
                  ? new Date(stats.lastPurchase.purchase_date).toLocaleDateString()
                  : '—'}
              </p>
            </div>
          </div>
        )}
      </form>

      {/* Purchase History */}
      {history.length > 0 && (
        <div className="border rounded-lg p-6">
          <h3 className="font-bold mb-4">Historial de compras</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold text-left">Fecha</th>
                  <th className="px-4 py-3 font-semibold text-left">Tipo</th>
                  <th className="px-4 py-3 font-semibold text-left">Documento</th>
                  <th className="px-4 py-3 font-semibold text-left">Productos</th>
                  <th className="px-4 py-3 font-semibold text-right">Total</th>
                  <th className="px-4 py-3 font-semibold text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {history.map((purchase) => (
                  <tr key={purchase.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3">
                      {new Date(purchase.purchase_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {purchase.type === 'factura' ? 'Factura' :
                       purchase.type === 'albarán' ? 'Albarán' : 'Nota de Crédito'}
                    </td>
                    <td className="px-4 py-3">{purchase.invoice_number || '—'}</td>
                    <td className="px-4 py-3 text-xs">
                      {((purchase.purchase_lines as any) || []).length} líneas
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {money(Number(purchase.total))}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs ${
                        purchase.status === 'draft'
                          ? 'bg-yellow-100 text-yellow-800'
                          : purchase.status === 'received'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {purchase.status === 'draft' ? 'Borrador' :
                         purchase.status === 'received' ? 'Recibida' : 'Otra'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
