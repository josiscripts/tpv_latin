import { useParams, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Edit2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useCategories, useUploadCategoryImage } from "@/hooks/useCategories";
import { useProducts } from "@/hooks/useProducts";
import { Button } from "@/components/ui/button";
import { ProductImage, money, getStorageImageUrl } from "./pos-ui";
import { usePos } from "./pos-context";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useUpdateCategory } from "@/hooks/useCategories";
import { toast } from "sonner";

const categorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

type CategoryFormData = z.infer<typeof categorySchema>;

export function CategoryDetailScreen() {
  const { id } = useParams({ from: "/categories/$id" as const });
  const navigate = useNavigate();
  const { data: categories = [], isLoading: catsLoading } = useCategories();
  const { data: allProducts = [], isLoading: prodsLoading } = useProducts();
  const { t } = usePos();
  const [editOpen, setEditOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const updateCategory = useUpdateCategory();
  const uploadImage = useUploadCategoryImage();
  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const category = categories.find((c: any) => c.id === id);
  const products = (allProducts || []).filter((p: any) => p.category_id === id);

  useEffect(() => {
    if (category && categories.length > 0) {
      form.reset({
        name: category.name || "",
        description: category.description || "",
      });
    }
  }, [category, form]);

  if (catsLoading || prodsLoading) {
    return <div className="p-8">Cargando...</div>;
  }

  const onSubmit = async (data: CategoryFormData) => {
    try {
      if (selectedFile) {
        await uploadImage.mutateAsync({
          categoryId: id!,
          file: selectedFile,
        });
        setSelectedFile(null);
      }

      await updateCategory.mutateAsync({
        id: id!,
        updates: {
          name: data.name,
          description: data.description || null,
        },
      });
      toast.success("Categoría actualizada");
      setEditOpen(false);
    } catch (error) {
      toast.error("Error al actualizar categoría");
    }
  };

  if (!category) {
    return (
      <div className="p-8">
        <div className="text-center">
          <p className="text-muted-foreground">Categoría no encontrada</p>
          <p className="text-xs text-muted-foreground mt-2">ID: {id || 'undefined'} | Categorías cargadas: {categories.length}</p>
          <button
            className="mt-4 px-4 py-2 text-sm bg-primary text-primary-foreground rounded"
            onClick={() => navigate({ to: '/categories' })}
          >
            Volver a categorías
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 border-b bg-card p-6">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/categories" })}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{category.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{products.length} producto(s)</p>
        </div>
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Edit2 className="mr-2 h-4 w-4" />
            Editar
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar categoría</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label>Nombre</Label>
                <Input {...form.register("name")} />
              </div>
              <div>
                <Label>Descripción</Label>
                <Input {...form.register("description")} />
              </div>
              <div className="flex flex-col items-center">
                <Label>Imagen</Label>
                <input
                  type="file"
                  id="image-input"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
                <div
                  onClick={() => document.getElementById('image-input')?.click()}
                  className="w-56 aspect-square rounded-lg border-2 border-dashed border-muted-foreground hover:border-primary cursor-pointer flex items-center justify-center bg-muted transition-colors"
                >
                  {selectedFile ? (
                    <div className="relative w-full h-full">
                      <img
                        src={URL.createObjectURL(selectedFile)}
                        alt="Preview"
                        className="w-full h-full object-cover rounded-lg"
                      />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-lg">
                        <span className="text-white text-sm">Cambiar imagen</span>
                      </div>
                    </div>
                  ) : category?.image_url ? (
                    <div className="relative w-full h-full">
                      <img
                        src={category.image_url}
                        alt={category.name}
                        className="w-full h-full object-cover rounded-lg"
                      />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-lg">
                        <span className="text-white text-sm">Cambiar imagen</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-4xl mb-2">📷</div>
                      <p className="text-sm text-muted-foreground">Seleccionar imagen</p>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={updateCategory.isPending}>
                  {updateCategory.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {category.image_url && (
        <div className="flex justify-center py-6 px-4 bg-muted/50">
          <div className="w-full max-w-xs aspect-square overflow-hidden rounded-lg bg-muted">
            <img src={category.image_url} alt={category.name} className="h-full w-full object-cover" />
          </div>
        </div>
      )}

      {category.description && (
        <div className="bg-card p-6 border-b">
          <p className="text-sm text-muted-foreground">{category.description}</p>
        </div>
      )}

      <div className="space-y-6 p-6">
        {products.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground">Sin productos en esta categoría</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((product: any) => (
              <div
                key={product.id}
                className="rounded-lg border bg-card overflow-hidden hover:shadow-lg transition-shadow cursor-pointer flex flex-col"
                onClick={() => navigate({ to: `/products/${product.id}`, search: { categoryId: id } })}
              >
                <div className="h-40 bg-muted flex items-center justify-center overflow-hidden">
                  {product.image ? (
                    <img
                      src={getStorageImageUrl(product.image)}
                      alt={product.name}
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <span className="text-muted-foreground text-sm">Sin imagen</span>
                  )}
                </div>
                <div className="p-3 flex-1 flex flex-col justify-between">
                  <h3 className="font-semibold text-sm line-clamp-2">{product.name}</h3>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-bold text-primary">{money(product.sale_price)}</span>
                    {product.stock !== undefined && (
                      <span className="text-xs text-muted-foreground">Stock: {product.stock}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
