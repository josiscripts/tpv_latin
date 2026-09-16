import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "./app-shell";
import { SectionCard, StockBadge, money } from "./pos-ui";
import { usePos } from "./pos-context";
import { useTodayStats, useWeeklySalesData, useCriticalStockProducts, useTopSellingProducts, useMonthlySalesData } from "@/hooks/useDashboard";
import { useProducts } from "@/hooks/useProducts";

const chartColors=["var(--chart-1)","var(--chart-2)","var(--chart-3)","var(--chart-4)","var(--chart-5)","var(--chart-6)"];

function StatsRow() {
  const { data: todayStats } = useTodayStats();
  const { data: stockStats } = useProducts();

  const stats = [
    { label: "Ventas del día", value: todayStats ? money(todayStats.totalSales) : "0,00 €", trend: "+12%", note: "respecto ayer" },
    { label: "Beneficio del día", value: todayStats ? money(todayStats.totalProfit) : "0,00 €", trend: "+8,4%", note: "margen" },
    { label: "Productos en stock", value: stockStats?.length || 0, trend: "+6", note: "esta semana" },
    { label: "Stock crítico", value: stockStats?.filter((p) => Number(p.stock) <= Number(p.min_stock)).length || 0, trend: "-3", note: "productos" },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {stats.map((s, i) => (
        <div key={s.label} className="rounded-lg border bg-card p-5">
          <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
          <p className="mt-2 text-[25px] font-bold tracking-normal">{s.value}</p>
          <div className="mt-2 flex items-center gap-1.5 text-[11px]">
            <span className={i === 3 ? "text-destructive" : "text-success"}>{s.trend}</span>
            <span className="text-muted-foreground">{s.note}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardScreen(){
  const {t}=usePos();
  const { data: weeklySales = [] } = useWeeklySalesData();
  const { data: monthlySales = [] } = useMonthlySalesData();
  const { data: criticalStock = [] } = useCriticalStockProducts();
  const { data: topProducts = [] } = useTopSellingProducts();
  const { data: products = [] } = useProducts();

  return <>
    <PageHeader title={t("dashboard")} subtitle="Resumen de actividad en tiempo real"/>
    <StatsRow/>
    <div className="mt-4 grid grid-cols-[1.6fr_1fr] gap-4">
      <SectionCard title="Ventas de los últimos 7 días" subtitle="Ingresos brutos diarios">
        <div className="h-[230px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weeklySales} margin={{top:10,right:8,left:-20,bottom:0}}>
              <XAxis dataKey="d" axisLine={false} tickLine={false} tick={{fontSize:11,fill:"var(--muted-foreground)"}}/>
              <YAxis axisLine={false} tickLine={false} tick={{fontSize:11,fill:"var(--muted-foreground)"}}/>
              <Tooltip contentStyle={{borderRadius:6,border:"1px solid var(--border)",background:"var(--popover)",fontSize:12}}/>
              <Line type="monotone" dataKey="v" stroke="var(--primary)" strokeWidth={2.5} dot={{r:3,fill:"var(--primary)",strokeWidth:0}} activeDot={{r:5}} isAnimationActive={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>
      <SectionCard title="Ventas mensuales" subtitle="Últimos 6 meses">
        <div className="h-[230px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlySales} margin={{top:10,right:8,left:-20,bottom:0}}>
              <XAxis dataKey="m" axisLine={false} tickLine={false} tick={{fontSize:11,fill:"var(--muted-foreground)"}}/>
              <YAxis axisLine={false} tickLine={false} tick={{fontSize:11,fill:"var(--muted-foreground)"}}/>
              <Tooltip contentStyle={{borderRadius:6,border:"1px solid var(--border)",background:"var(--popover)",fontSize:12}}/>
              <Line type="monotone" dataKey="sales" stroke="var(--primary)" strokeWidth={2.5} dot={false} isAnimationActive={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-4">
      <SectionCard title="Productos más vendidos" subtitle="Últimos 30 días">
        <div className="space-y-1">
          {topProducts.slice(0,4).map((p,i)=>(
            <div key={i} className="flex items-center gap-3 border-b py-2.5 last:border-0">
              <span className="w-4 text-xs font-semibold text-muted-foreground">{i+1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{p.name}</p>
                <p className="text-[10px] text-muted-foreground">{p.category}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold">{p.quantity.toFixed(0)} uds.</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Productos con poco stock" subtitle="Requieren atención">
        <div className="space-y-1">
          {criticalStock.slice(0,4).map(p=>(
            <div key={p.id} className="flex items-center gap-3 border-b py-2.5 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{p.name}</p>
                <p className="text-[10px] text-muted-foreground">Mínimo: {p.min_stock} uds.</p>
              </div>
              <strong className="text-xs">{p.stock}</strong>
              <StockBadge state={Number(p.stock) <= 0 ? "out" : Number(p.stock) <= Number(p.min_stock) ? "critical" : "low"}/>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  </>
}
