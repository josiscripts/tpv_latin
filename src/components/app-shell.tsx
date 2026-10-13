import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Bell, Boxes, ChartNoAxesCombined, ChevronLeft, CircleDollarSign, ClipboardList, FileText, LayoutDashboard, LogOut, Menu, Moon, Package, Search, Settings, ShoppingBasket, ShoppingCart, Store, Sun, Tags, Truck, UsersRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { usePos } from "./pos-context";
import { useAuthContext } from "./auth-provider";
import { NotificationsPanel } from "./notifications-panel";
import { GlobalSearch } from "./global-search";
import { BridgeStatusIndicator } from "./bridge-status-indicator";
import { useNotifications } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const nav=[
 {to:"/",key:"dashboard",icon:LayoutDashboard},{to:"/pos",key:"pos",icon:ShoppingCart},{to:"/products",key:"products",icon:Package},{to:"/categories",key:"categories",icon:Tags},{to:"/stock",key:"stock",icon:Boxes},{to:"/suppliers",key:"suppliers",icon:Truck},{to:"/purchases",key:"purchases",icon:ShoppingBasket},{to:"/sales",key:"sales",icon:CircleDollarSign},{to:"/reports",key:"reports",icon:ChartNoAxesCombined},{to:"/documents",key:"documents",icon:FileText},{to:"/settings",key:"settings",icon:Settings},
] as const;

export function AppShell({children}:{children:ReactNode}){
 const {language,setLanguage,dark,setDark,t,logoUrl,logoUpdatedAt,businessName,avatarUrl}=usePos(); const path=useRouterState({select:s=>s.location.pathname}); const [collapsed,setCollapsed]=useState(false); const [notificationsOpen,setNotificationsOpen]=useState(false); const {logout,profile}=useAuthContext(); const navigate=useNavigate(); const handleLogout=async()=>{await logout();navigate({to:'/login'});}; const {data:notifications=[]}=useNotifications(profile?.id||null); const unreadCount=notifications.filter(n=>!n.read).length;
 return <TooltipProvider><div className="flex h-dvh min-w-[1024px] overflow-hidden bg-background text-foreground">
  <aside className={`${collapsed?"w-[76px]":"w-[250px]"} flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200`}>
   <div className="flex h-[72px] items-center gap-3 border-b border-sidebar-border px-5">
    <div className="shrink-0 rounded-md overflow-hidden" style={{ aspectRatio: "1/1", width: "40px", height: "40px" }}>
      {logoUrl ? (
        <img src={`${logoUrl}?v=${logoUpdatedAt}`} alt="Logo" className="w-full h-full object-contain" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-sidebar">
          <Store size={21} />
        </div>
      )}
    </div>
    {!collapsed&&<div className="min-w-0"><div className="truncate text-[15px] font-bold">{businessName || "Mercado Central"}</div><div className="text-[11px] text-muted-foreground">TPV PRO</div></div>}
   </div>
   <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Navegación principal">
    {nav.map(item=>{const active=path===item.to; const Icon=item.icon; return <Tooltip key={item.to}><TooltipTrigger asChild><Link to={item.to} className={`flex h-10 items-center gap-3 rounded-md px-3 text-[13px] font-medium transition-colors ${active?"bg-primary/12 text-primary":"text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}><Icon size={18} strokeWidth={active?2.4:1.8}/>{!collapsed&&<span>{t(item.key)}</span>}{active&&!collapsed&&<span className="ml-auto size-1.5 rounded-full bg-primary"/>}</Link></TooltipTrigger>{collapsed&&<TooltipContent side="right">{t(item.key)}</TooltipContent>}</Tooltip>})}
   </nav>
   <div className="border-t border-sidebar-border p-3"><Button variant="ghost" size="sm" className="w-full justify-center" onClick={()=>setCollapsed(v=>!v)} aria-label="Contraer barra">{collapsed?<Menu/>:<><ChevronLeft/><span>Contraer</span></>}</Button></div>
  </aside>
  <div className="flex min-w-0 flex-1 flex-col">
   <header className="flex h-[72px] shrink-0 items-center justify-between gap-5 border-b bg-background px-7">
    <GlobalSearch />
    <div className="flex items-center gap-2">
     <BridgeStatusIndicator />
     <Select value={language} onValueChange={(v)=>setLanguage(v as "es"|"en"|"ca")}><SelectTrigger className="h-9 w-[118px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="es">ES · Español</SelectItem><SelectItem value="en">EN · English</SelectItem><SelectItem value="ca">CA · Català</SelectItem></SelectContent></Select>
     <Button variant="ghost" size="icon" onClick={()=>setDark(!dark)} aria-label="Cambiar tema">{dark?<Sun size={18}/>:<Moon size={18}/>}</Button>
     <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
      <PopoverTrigger asChild>
       <Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones"><Bell size={18}/>{unreadCount>0&&<span className="absolute right-2 top-2 size-2 rounded-full bg-destructive flex items-center justify-center text-[10px] text-background font-bold">{unreadCount>9?'9+':unreadCount}</span>}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
       <NotificationsPanel onClose={()=>setNotificationsOpen(false)}/>
      </PopoverContent>
     </Popover>
     <div className="ml-2 flex items-center gap-2.5 border-l pl-4">
      <button
        onClick={() => navigate({ to: '/profile' })}
        className="grid size-9 shrink-0 place-items-center rounded-full overflow-hidden hover:opacity-75 transition-opacity"
        style={{
          backgroundImage: avatarUrl ? `url(${avatarUrl})` : 'none',
          backgroundColor: avatarUrl ? 'transparent' : '#1f2937',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {!avatarUrl && <span className="text-xs font-semibold text-background">{profile?.email?.charAt(0)?.toUpperCase() || 'U'}</span>}
      </button>
      <div className="hidden xl:block"><div className="text-xs font-semibold">{profile?.full_name || profile?.email}</div><div className="text-[10px] text-muted-foreground capitalize">{profile?.role_id === 'admin' ? 'Administrador' : 'Empleado'}</div></div><Button variant="ghost" size="icon" onClick={handleLogout} className="ml-2" title="Cerrar sesión"><LogOut size={18}/></Button>
     </div>
    </div>
   </header>
   <main className="min-h-0 flex-1 overflow-y-auto bg-muted/30"><div className="animate-page mx-auto max-w-[1660px] p-6 2xl:p-8">{children}</div></main>
  </div>
 </div></TooltipProvider>
}

export function PageHeader({title,subtitle,action}:{title:string;subtitle:string;action?:ReactNode}){return <div className="mb-6 flex items-end justify-between"><div><h1 className="text-[25px] font-bold tracking-normal">{title}</h1><p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p></div>{action}</div>}