import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, Boxes, ChartNoAxesCombined, ChevronLeft, CircleDollarSign, ClipboardList, LayoutDashboard, Menu, Moon, Package, Search, Settings, ShoppingBasket, ShoppingCart, Store, Sun, Tags, Truck, UsersRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { usePos } from "./pos-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const nav=[
 {to:"/",key:"dashboard",icon:LayoutDashboard},{to:"/pos",key:"pos",icon:ShoppingCart},{to:"/products",key:"products",icon:Package},{to:"/categories",key:"categories",icon:Tags},{to:"/stock",key:"stock",icon:Boxes},{to:"/suppliers",key:"suppliers",icon:Truck},{to:"/purchases",key:"purchases",icon:ShoppingBasket},{to:"/sales",key:"sales",icon:CircleDollarSign},{to:"/reports",key:"reports",icon:ChartNoAxesCombined},{to:"/settings",key:"settings",icon:Settings},
] as const;

export function AppShell({children}:{children:ReactNode}){
 const {language,setLanguage,dark,setDark,t}=usePos(); const path=useRouterState({select:s=>s.location.pathname}); const [collapsed,setCollapsed]=useState(false);
 return <TooltipProvider><div className="flex h-dvh min-w-[1024px] overflow-hidden bg-background text-foreground">
  <aside className={`${collapsed?"w-[76px]":"w-[250px]"} flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200`}>
   <div className="flex h-[72px] items-center gap-3 border-b border-sidebar-border px-5">
    <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm"><Store size={21}/></div>
    {!collapsed&&<div className="min-w-0"><div className="truncate text-[15px] font-bold">Mercado Central</div><div className="text-[11px] text-muted-foreground">TPV PRO</div></div>}
   </div>
   <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Navegación principal">
    {nav.map(item=>{const active=path===item.to; const Icon=item.icon; return <Tooltip key={item.to}><TooltipTrigger asChild><Link to={item.to} className={`flex h-10 items-center gap-3 rounded-md px-3 text-[13px] font-medium transition-colors ${active?"bg-primary/12 text-primary":"text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}><Icon size={18} strokeWidth={active?2.4:1.8}/>{!collapsed&&<span>{t(item.key)}</span>}{active&&!collapsed&&<span className="ml-auto size-1.5 rounded-full bg-primary"/>}</Link></TooltipTrigger>{collapsed&&<TooltipContent side="right">{t(item.key)}</TooltipContent>}</Tooltip>})}
   </nav>
   <div className="border-t border-sidebar-border p-3"><Button variant="ghost" size="sm" className="w-full justify-center" onClick={()=>setCollapsed(v=>!v)} aria-label="Contraer barra">{collapsed?<Menu/>:<><ChevronLeft/><span>Contraer</span></>}</Button></div>
  </aside>
  <div className="flex min-w-0 flex-1 flex-col">
   <header className="flex h-[72px] shrink-0 items-center justify-between gap-5 border-b bg-background px-7">
    <div className="relative w-full max-w-[460px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={17}/><Input className="h-10 bg-muted/55 pl-10 shadow-none" placeholder={t("search")}/></div>
    <div className="flex items-center gap-2">
     <Select value={language} onValueChange={(v)=>setLanguage(v as "es"|"en"|"ca")}><SelectTrigger className="h-9 w-[118px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="es">ES · Español</SelectItem><SelectItem value="en">EN · English</SelectItem><SelectItem value="ca">CA · Català</SelectItem></SelectContent></Select>
     <Button variant="ghost" size="icon" onClick={()=>setDark(!dark)} aria-label="Cambiar tema">{dark?<Sun size={18}/>:<Moon size={18}/>}</Button>
     <Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones"><Bell size={18}/><span className="absolute right-2 top-2 size-1.5 rounded-full bg-destructive"/></Button>
     <div className="ml-2 flex items-center gap-2.5 border-l pl-4"><div className="grid size-9 place-items-center rounded-full bg-foreground text-xs font-semibold text-background">JE</div><div className="hidden xl:block"><div className="text-xs font-semibold">Josias Espinoza</div><div className="text-[10px] text-muted-foreground">Administrador</div></div></div>
    </div>
   </header>
   <main className="min-h-0 flex-1 overflow-y-auto bg-muted/30"><div className="animate-page mx-auto max-w-[1660px] p-6 2xl:p-8">{children}</div></main>
  </div>
 </div></TooltipProvider>
}

export function PageHeader({title,subtitle,action}:{title:string;subtitle:string;action?:ReactNode}){return <div className="mb-6 flex items-end justify-between"><div><h1 className="text-[25px] font-bold tracking-normal">{title}</h1><p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p></div>{action}</div>}