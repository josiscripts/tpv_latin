import { ArrowDownRight, ArrowUpRight, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Database } from "@/lib/database.types";

type Product = Database['public']['Tables']['products']['Row'];
type StockState = 'ok' | 'low' | 'critical' | 'out';

export const money=(n:number)=>new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"}).format(n);
export function ProductImage({product,size="md"}:{product:Product;size?:"sm"|"md"|"lg"}){const classes=size==="sm"?"size-10":size==="lg"?"h-44 w-full":"size-12";return product.image?<img src={product.image} alt={product.name || "Producto"} loading="lazy" width={768} height={768} className={`${classes} shrink-0 rounded-md bg-muted object-cover`}/>:<div className={`${classes} shrink-0 rounded-md bg-muted flex items-center justify-center`}><Package size={16} className="text-muted-foreground"/></div>}
export function StockBadge({state}:{state:StockState}){const map={ok:["Correcto","bg-success/12 text-success"],low:["Bajo","bg-warning/12 text-warning"],critical:["Crítico","bg-destructive/12 text-destructive"],out:["Sin stock","bg-muted text-muted-foreground"]} as const;return <Badge variant="secondary" className={`border-0 ${map[state][1]}`}>{map[state][0]}</Badge>}
export function SectionCard({title,subtitle,children,className=""}:{title:string;subtitle?:string;children:React.ReactNode;className?:string}){return <Card className={className}><CardHeader className="flex-row items-center justify-between space-y-0 pb-3"><div><CardTitle className="text-sm">{title}</CardTitle>{subtitle&&<p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>}</div></CardHeader><CardContent>{children}</CardContent></Card>}
export function Delta({positive=true,children}:{positive?:boolean;children:React.ReactNode}){const I=positive?ArrowUpRight:ArrowDownRight;return <span className={positive?"inline-flex items-center text-success":"inline-flex items-center text-destructive"}><I size={13}/>{children}</span>}