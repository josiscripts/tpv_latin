import { Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PageHeader } from "./app-shell";
import { usePos } from "./pos-context";
import { useSuppliers, useCreateSupplier } from "@/hooks/useSuppliers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const supplierSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  contact_name: z.string().optional(),
});

type SupplierFormData = z.infer<typeof supplierSchema>;

function SupplierDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const createSupplier = useCreateSupplier();
  const form = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
  });

  const onSubmit = async (data: SupplierFormData) => {
    try {
      await createSupplier.mutateAsync({
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        contact_name: data.contact_name || null,
        active: true,
      });
      toast.success("Proveedor creado");
      setOpen(false);
      form.reset();
    } catch (error) {
      toast.error("Error al crear proveedor");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button><Plus />Nuevo proveedor</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo proveedor</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label>Nombre</Label>
            <Input placeholder="Ej. Andes Foods" {...form.register("name")} />
          </div>
          <div>
            <Label>Contacto</Label>
            <Input placeholder="Opcional" {...form.register("contact_name")} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" placeholder="Opcional" {...form.register("email")} />
          </div>
          <div>
            <Label>Teléfono</Label>
            <Input placeholder="Opcional" {...form.register("phone")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={createSupplier.isPending}>
              {createSupplier.isPending ? "Guardando..." : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SuppliersScreen() {
  const { t } = usePos();
  const { data: suppliers = [], isLoading } = useSuppliers();

  if (isLoading) return <div className="p-8">Cargando proveedores...</div>;

  const colors = ["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500"];

  return (
    <>
      <PageHeader title={t("suppliers")} subtitle="Proveedores y condiciones comerciales" action={<SupplierDialog />} />
      <div className="grid grid-cols-3 gap-4">
        {suppliers.map((sup, i) => (
          <div key={sup.id} className="rounded-lg border bg-card p-5">
            <div className={`grid size-11 place-items-center rounded-lg ${colors[i % colors.length]} text-white text-sm font-bold`}>
              {sup.name.substring(0, 2).toUpperCase()}
            </div>
            <h2 className="mt-4 text-sm font-bold">{sup.name}</h2>
            <p className="text-[11px] text-muted-foreground">{sup.contact_name || "Sin contacto"}</p>
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              {sup.phone && <p>📞 {sup.phone}</p>}
              {sup.email && <p>📧 {sup.email}</p>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
