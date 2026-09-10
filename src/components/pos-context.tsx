import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Language = "es" | "en" | "ca";
type PosContextValue = { language:Language; setLanguage:(v:Language)=>void; dark:boolean; setDark:(v:boolean)=>void; t:(key:string)=>string };
const copy:Record<Language,Record<string,string>> = {
  es:{dashboard:"Panel",pos:"TPV Venta",products:"Productos",categories:"Categorías",stock:"Stock",suppliers:"Proveedores",purchases:"Compras",sales:"Ventas",reports:"Reportes",settings:"Configuración",search:"Buscar productos, ventas o proveedores...",today:"Hoy",week:"Semana",month:"Mes",custom:"Personalizado",newProduct:"Nuevo producto",inventory:"Inventario",movements:"Movimientos",all:"Todos",low:"Bajo",critical:"Crítico",out:"Sin stock",save:"Guardar producto",cancel:"Cancelar"},
  en:{dashboard:"Dashboard",pos:"POS Sale",products:"Products",categories:"Categories",stock:"Inventory",suppliers:"Suppliers",purchases:"Purchases",sales:"Sales",reports:"Reports",settings:"Settings",search:"Search products, sales or suppliers...",today:"Today",week:"Week",month:"Month",custom:"Custom",newProduct:"New product",inventory:"Inventory",movements:"Movements",all:"All",low:"Low",critical:"Critical",out:"Out of stock",save:"Save product",cancel:"Cancel"},
  ca:{dashboard:"Tauler",pos:"TPV Venda",products:"Productes",categories:"Categories",stock:"Estoc",suppliers:"Proveïdors",purchases:"Compres",sales:"Vendes",reports:"Informes",settings:"Configuració",search:"Cerca productes, vendes o proveïdors...",today:"Avui",week:"Setmana",month:"Mes",custom:"Personalitzat",newProduct:"Nou producte",inventory:"Inventari",movements:"Moviments",all:"Tots",low:"Baix",critical:"Crític",out:"Sense estoc",save:"Desar producte",cancel:"Cancel·lar"}
};
const PosContext=createContext<PosContextValue|undefined>(undefined);
export function PosProvider({children}:{children:ReactNode}){
  const [language,setLanguage]=useState<Language>("es"); const [dark,setDark]=useState(false);
  useEffect(()=>{document.documentElement.classList.toggle("dark",dark)},[dark]);
  return <PosContext.Provider value={{language,setLanguage,dark,setDark,t:(key)=>copy[language][key]??key}}>{children}</PosContext.Provider>;
}
export function usePos(){const value=useContext(PosContext); if(!value) throw new Error("PosProvider missing"); return value;}