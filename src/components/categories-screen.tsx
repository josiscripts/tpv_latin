import { Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PageHeader } from "./app-shell";
import { usePos } from "./pos-context";
import { useCategories, useCreateCategory } from "@/hooks/useCategories";
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
  const { data: categories = [], isLoading } = useCategories();

  if (isLoading) return <div className="p-8">Cargando categorías...</div>;

  const colors = ["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500", "bg-pink-500", "bg-indigo-500", "bg-cyan-500", "bg-amber-500"];

  return (
    <>
      <PageHeader title={t("categories")} subtitle="Organiza y clasifica tu catálogo" action={<CategoryDialog />} />
      <div className="grid grid-cols-4 gap-4">
        {categories.map((cat, i) => (
          <div key={cat.id} className="group rounded-lg border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
            <div className={`grid size-11 place-items-center rounded-lg ${colors[i % colors.length]} text-white`}>
              {cat.name.charAt(0)}
            </div>
            <h2 className="mt-7 text-sm font-bold">{cat.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{cat.description || "Sin descripción"}</p>
          </div>
        ))}
      </div>
    </>
  );
}
