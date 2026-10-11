import { Plus, Edit2, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { PageHeader } from "./app-shell";
import { usePos } from "./pos-context";
import { useCategories, useCreateCategory } from "@/hooks/useCategories";
import { useProducts } from "@/hooks/useProducts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const categorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

type CategoryFormData = z.infer<typeof categorySchema>;

function CategoryDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { t } = usePos();
  const [open, setOpen] = useState(false);
  const createCategory = useCreateCategory();
  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
  });

  const onSubmit = async (data: CategoryFormData) => {
    try {
      await createCategory.mutateAsync({
        name: data.name,
        description: data.description || null,
        active: true,
      });
      toast.success("Categoría creada");
      setOpen(false);
      form.reset();
    } catch (error) {
      toast.error("Error al crear categoría");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button><Plus />Nueva categoría</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva categoría</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label>Nombre</Label>
            <Input placeholder="Ej. Bebidas" {...form.register("name")} />
          </div>
          <div>
            <Label>Descripción</Label>
            <Input placeholder="Opcional" {...form.register("description")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={createCategory.isPending}>
              {createCategory.isPending ? "Guardando..." : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CategoriesScreen() {
  const { t } = usePos();
  const navigate = useNavigate();
  const { data: categories = [], isLoading } = useCategories();
  const { data: allProducts = [] } = useProducts();

  if (isLoading) return <div className="p-8">Cargando categorías...</div>;

  const colors = ["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500", "bg-pink-500", "bg-indigo-500", "bg-cyan-500", "bg-amber-500"];

  const getProductCount = (categoryId: string) => {
    return (allProducts || []).filter((p: any) => p.category_id === categoryId).length;
  };

  return (
    <>
      <PageHeader title={t("categories")} subtitle="Organiza y clasifica tu catálogo" action={<CategoryDialog />} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {categories.map((cat: any, i: number) => {
          const productCount = getProductCount(cat.id);
          return (
            <div key={cat.id}
              className="group rounded-lg border bg-card transition-all hover:shadow-lg hover:border-primary cursor-pointer"
              onClick={() => navigate({ to: `/categories/${cat.id}` })}
            >
              {cat.image_url ? (
                <div className="w-full aspect-square overflow-hidden rounded-t-lg bg-muted">
                  <img src={cat.image_url} alt={cat.name} className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className={`w-full aspect-square ${colors[i % colors.length]} rounded-t-lg flex items-center justify-center`}>
                  <span className="text-4xl font-bold text-white opacity-30">{cat.name.charAt(0)}</span>
                </div>
              )}
              <div className="p-4">
                <h2 className="font-bold text-sm">{cat.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{cat.description || "Sin descripción"}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary">{productCount} producto{productCount !== 1 ? 's' : ''}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
