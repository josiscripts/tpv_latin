import { Plus, Search, X, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PageHeader } from "./app-shell";
import { usePos } from "./pos-context";
import { useSuppliers, useCreateSupplier } from "@/hooks/useSuppliers";
import { SupplierDetail } from "./supplier-detail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const supplierSchema = z.object({
  name: z.string().min(1),
  tax_id: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  contact_name: z.string().optional(),
  address: z.string().optional(),
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
        tax_id: data.tax_id || null,
        email: data.email || null,
        phone: data.phone || null,
        contact_name: data.contact_name || null,
        address: data.address || null,
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
            <Label>Nombre comercial</Label>
            <Input placeholder="Ej. Andes Foods" {...form.register("name")} />
          </div>
          <div>
            <Label>NIF/CIF</Label>
            <Input placeholder="Ej. 12345678A" {...form.register("tax_id")} />
          </div>
          <div>
            <Label>Persona de contacto</Label>
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
          <div>
            <Label>Dirección</Label>
            <Input placeholder="Opcional" {...form.register("address")} />
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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const { data: suppliers = [], isLoading } = useSuppliers();

  // Handle search param for auto-selection from global search
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedId = params.get('selected');
    if (selectedId && suppliers.length > 0) {
      if (suppliers.find(s => s.id === selectedId)) {
        setSelectedSupplierId(selectedId);
        window.history.replaceState({}, '', '/suppliers');
      }
    }
  }, [suppliers]);

  if (isLoading) return <div className="p-8">Cargando proveedores...</div>;

  if (selectedSupplierId) {
    return (
      <SupplierDetail
        supplierId={selectedSupplierId}
        onBack={() => setSelectedSupplierId(null)}
      />
    );
  }

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.tax_id?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const colors = ["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500"];

  return (
    <>
      <PageHeader title={t("suppliers")} subtitle="Proveedores y condiciones comerciales" action={<SupplierDialog />} />

      <div className="mb-4 flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o NIF/CIF..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-2.5"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No hay proveedores que coincidan
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {filtered.map((sup, i) => (
            <button
              key={sup.id}
              onClick={() => setSelectedSupplierId(sup.id)}
              className="group rounded-lg border bg-card transition-all hover:shadow-lg hover:border-primary cursor-pointer text-left"
            >
              {(sup as any).logo_url_signed ? (
                <div className="w-full aspect-square overflow-hidden rounded-t-lg bg-muted">
                  <img src={(sup as any).logo_url_signed} alt={sup.name} className="h-full w-full object-contain" />
                </div>
              ) : (
                <div className={`w-full aspect-square ${colors[i % colors.length]} rounded-t-lg flex items-center justify-center`}>
                  <span className="text-4xl font-bold text-white opacity-30">{sup.name.charAt(0).toUpperCase()}</span>
                </div>
              )}
              <div className="p-4">
                <h2 className="font-bold text-sm">{sup.name}</h2>
                {sup.tax_id && <p className="mt-1 text-xs text-muted-foreground">{sup.tax_id}</p>}
                <p className="text-xs text-muted-foreground line-clamp-1">{sup.contact_name || "Sin contacto"}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary">{sup.phone || sup.email || "—"}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
