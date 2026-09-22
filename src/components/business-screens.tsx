import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Building2, CalendarDays, ChevronRight, CreditCard, Mail, MapPin, PackagePlus, Phone, Plus, ReceiptText, Trash2, Truck } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "./app-shell";
import { ProductImage, SectionCard, money } from "./pos-ui";
import { usePos } from "./pos-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSales } from "@/hooks/useSales";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useMonthlySalesData, usePaymentMethodStats } from "@/hooks/useDashboard";
import { useProducts } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";

export function CategoriesScreen() {
  const { t } = usePos();
  const { data: categories = [], isLoading } = useCategories();
  const { data: products = [] } = useProducts();

  if (isLoading) return <div className="p-8">Cargando categorías...</div>;

  const productsByCategory = categories.map(cat => ({
    ...cat,
    count: products.filter(p => p.category_id === cat.id).length
  }));

  return (
    <>
      <PageHeader title={t("categories")} subtitle="Organiza y clasifica tu catálogo" action={<Button><Plus />Nueva categoría</Button>} />
      <div className="grid grid-cols-4 gap-4">
        {productsByCategory.map((x, i) => (
          <div key={x.id} className="group rounded-lg border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start justify-between">
              <div className={`grid size-11 place-items-center rounded-lg category-${i % 4}`}>
                <PackagePlus size={20} />
              </div>
              <Button size="icon" variant="ghost"><ChevronRight /></Button>
            </div>
            <h2 className="mt-7 text-sm font-bold">{x.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{x.count} productos</p>
          </div>
        ))}
      </div>
    </>
  );
}

export function SuppliersScreen() {
  const { t } = usePos();
  const { data: suppliers = [], isLoading } = useSuppliers();
  const [selected, setSelected] = useState<any>(null);

  if (isLoading) return <div className="p-8">Cargando proveedores...</div>;

  return (
    <>
      <PageHeader title={t("suppliers")} subtitle="Proveedores y condiciones comerciales" action={<Button><Plus />Nuevo proveedor</Button>} />
      <div className="grid grid-cols-3 gap-4">
        {suppliers.map((s, i) => (
          <div key={s.id} className="rounded-lg border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className={`grid size-11 place-items-center rounded-lg category-${i % 4} text-sm font-bold`}>
                {s.name.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 className="text-sm font-bold">{s.name}</h2>
                <p className="text-[11px] text-muted-foreground">Activo</p>
              </div>
            </div>
            <div className="mt-5 space-y-2 text-xs text-muted-foreground">
              <p className="flex items-center gap-2"><Phone size={14} />{s.phone || "N/A"}</p>
              <p className="flex items-center gap-2"><Mail size={14} />{s.email || "N/A"}</p>
              <p className="flex items-center gap-2"><MapPin size={14} />{s.address || "Sin dirección"}</p>
            </div>
            <Button variant="outline" className="mt-5 w-full" onClick={() => setSelected(s)}>Ver detalle</Button>
          </div>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div>
              <div className="grid grid-cols-3 gap-3 rounded-md bg-muted/45 p-4 text-xs">
                <span><b className="block">Teléfono</b>{selected.phone || "N/A"}</span>
                <span><b className="block">Correo</b>{selected.email || "N/A"}</span>
                <span><b className="block">NIF</b>{selected.tax_id || "N/A"}</span>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{selected.address || "Sin dirección registrada"}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PurchasesScreen() {
  const { t } = usePos();
  const { data: products = [] } = useProducts();
  const [rows, setRows] = useState([{ id: "", q: 1 }]);

  const total = rows.reduce((a, r) => {
    const p = products.find((x) => x.id === r.id);
    return a + (p?.cost_price ?? 0) * r.q;
  }, 0);

  return (
    <>
      <PageHeader title={t("purchases")} subtitle="Entrada de mercancía · Nuevo borrador" action={<Button variant="outline"><Plus />Añadir producto</Button>} />
      <div className="grid grid-cols-[1fr_330px] gap-5">
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/50 text-[10px] uppercase text-muted-foreground">
              <tr>
                {["Producto", "Costo", "Cantidad", "Costo Unit.", "Total", ""].map((x) => (
                  <th key={x} className="px-4 py-3">{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const p = products.find((x) => x.id === r.id);
                return (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <select
                        className="w-full border rounded px-2 py-1 text-xs"
                        value={r.id}
                        onChange={(e) => setRows((a) => a.map((x, i) => i === idx ? { ...x, id: e.target.value } : x))}
                      >
                        <option value="">Seleccionar...</option>
                        {products.map((prod) => (
                          <option key={prod.id} value={prod.id}>{prod.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">{p ? money(p.cost_price) : "-"}</td>
                    <td className="px-4 py-3">
                      <Input className="h-8 w-20" type="number" value={r.q} onChange={(e) => setRows((a) => a.map((x, i) => i === idx ? { ...x, q: +e.target.value } : x))} />
                    </td>
                    <td className="px-4 py-3">{p ? money(p.cost_price) : "-"}</td>
                    <td className="px-4 py-3 font-bold">{p ? money(p.cost_price * r.q) : "-"}</td>
                    <td className="px-4 py-3">
                      <Button size="icon" variant="ghost" onClick={() => setRows((a) => a.filter((_, i) => i !== idx))}><Trash2 /></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <aside className="rounded-lg border bg-card p-5">
          <h2 className="font-bold">Resumen de compra</h2>
          <div className="mt-5 space-y-4 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Proveedor</span>
              <b>Varios</b>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unidades</span>
              <b>{rows.reduce((a, x) => a + x.q, 0)}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA estimado</span>
              <b>{money(total * 0.1)}</b>
            </div>
            <div className="flex justify-between border-t pt-4 text-base">
              <span>Total</span>
              <b>{money(total * 1.1)}</b>
            </div>
          </div>
          <Button className="mt-8 h-12 w-full"><PackagePlus />Registrar compra</Button>
        </aside>
      </div>
    </>
  );
}

export function SalesScreen() {
  const { t } = usePos();
  const { data: sales = [], isLoading } = useSales();
  const [selectedSale, setSelectedSale] = useState<any>(null);

  if (isLoading) return <div className="p-8">Cargando ventas...</div>;

  const selectedSaleData = sales.find((s) => s.id === selectedSale);

  return (
    <>
      <PageHeader title={t("sales")} subtitle="Historial completo de transacciones" action={<Button variant="outline"><CalendarDays />Exportar</Button>} />
      <div className="mb-4 flex gap-2">
        {[t("today"), t("week"), t("month"), t("custom")].map((x, i) => (
          <Button key={x} variant={i === 0 ? "default" : "outline"} size="sm">{x}</Button>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-left text-xs">
          <thead className="border-b bg-muted/50 text-[10px] uppercase text-muted-foreground">
            <tr>
              {["Fecha", "Origen", "Líneas", "Método pago", "Total", "Estado"].map((x) => (
                <th key={x} className="px-4 py-3">{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr
                key={sale.id}
                className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                onClick={() => setSelectedSale(sale.id)}
              >
                <td className="px-4 py-4">{new Date(sale.sale_date).toLocaleString()}</td>
                <td className="px-4 py-4">{sale.source === "sysme" ? "Sysme" : "Latin POS"}</td>
                <td className="px-4 py-4">{(sale.sale_lines as any)?.length || 0}</td>
                <td className="px-4 py-4">{sale.payment_method || "N/A"}</td>
                <td className="px-4 py-4 font-bold">{money(Number(sale.total))}</td>
                <td className="px-4 py-4">
                  <span className={`text-xs ${sale.status === "completed" ? "text-success" : "text-warning"}`}>
                    {sale.status === "completed" ? "Completada" : "Cancelada"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!selectedSale} onOpenChange={() => setSelectedSale(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ReceiptText />Detalle de venta</DialogTitle>
          </DialogHeader>
          {selectedSaleData && (
            <div className="border-y py-4 text-xs">
              <div className="mb-4 flex justify-between text-muted-foreground">
                <span>{new Date(selectedSaleData.sale_date).toLocaleString()}</span>
                <span>Caja 01</span>
              </div>
              {(selectedSaleData.sale_lines as any)?.map((line: any, idx: number) => (
                <div key={line.id || idx} className="flex justify-between py-2 border-b">
                  <span>{line.quantity} × {line.products?.name || "Producto"}</span>
                  <b>{money(line.unit_sale_price * line.quantity)}</b>
                </div>
              ))}
              <div className="flex justify-between text-lg font-bold mt-4">
                <span>TOTAL</span>
                <span>{money(Number(selectedSaleData.total))}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ReportsScreen() {
  const { t } = usePos();
  const { data: monthlySales = [] } = useMonthlySalesData();
  const { data: paymentMethods = [] } = usePaymentMethodStats();

  const chartColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

  return (
    <>
      <PageHeader
        title={t("reports")}
        subtitle="Rendimiento del negocio"
        action={
          <Select defaultValue="6">
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">Últimos 6 meses</SelectItem>
              <SelectItem value="12">Últimos 12 meses</SelectItem>
            </SelectContent>
          </Select>
        }
      />
      <div className="grid grid-cols-2 gap-4">
        <SectionCard title="Ventas mensuales" subtitle="Ingresos brutos">
          <Chart dataKey="sales" data={monthlySales} />
        </SectionCard>
        <SectionCard title="Beneficio mensual" subtitle="Beneficio neto">
          <Chart dataKey="profit" data={monthlySales} />
        </SectionCard>
        <SectionCard title="Métodos de pago">
          <div className="flex h-[220px] items-center">
            <ResponsiveContainer width="60%">
              <PieChart>
                <Pie data={paymentMethods} dataKey="v" innerRadius={48} outerRadius={70} stroke="none" isAnimationActive={false}>
                  {paymentMethods.map((_, idx) => (
                    <Cell key={`cell-${idx}`} fill={chartColors[idx % chartColors.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3 text-xs">
              {paymentMethods.map((method, idx) => (
                <p key={method.n}><i className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: chartColors[idx % chartColors.length] }} />{method.n} <b>{method.v}%</b></p>
              ))}
            </div>
          </div>
        </SectionCard>
      </div>
    </>
  );
}

function Chart({ dataKey, data }: { dataKey: "sales" | "profit"; data: any[] }) {
  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 5, left: -15 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="m" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
          <Tooltip />
          <Bar
            dataKey={dataKey}
            fill={dataKey === "sales" ? "var(--primary)" : "var(--chart-2)"}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
