import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useBusiness } from "@/hooks/useBusiness";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";

type Language = "es" | "en" | "ca";
type PosContextValue = {
  language: Language;
  setLanguage: (v: Language) => void;
  dark: boolean;
  setDark: (v: boolean) => void;
  accentColor: string;
  setAccentColor: (v: string) => void;
  logoUrl: string | null;
  logoUpdatedAt: string | null;
  businessName: string | null;
  avatarUrl: string | null;
  t: (key: string) => string;
};

const copy: Record<Language, Record<string, string>> = {
  es: {
    dashboard: "Panel", pos: "TPV Venta", products: "Productos", categories: "Categorías", stock: "Stock", suppliers: "Proveedores", purchases: "Compras", sales: "Ventas", reports: "Reportes", documents: "Documentos", settings: "Configuración", search: "Buscar productos, ventas o proveedores...", today: "Hoy", week: "Semana", month: "Mes", custom: "Personalizado", newProduct: "Nuevo producto", inventory: "Inventario", movements: "Movimientos", all: "Todos", low: "Bajo", critical: "Crítico", out: "Sin stock", save: "Guardar producto", cancel: "Cancelar"
  },
  en: {
    dashboard: "Dashboard", pos: "POS Sale", products: "Products", categories: "Categories", stock: "Inventory", suppliers: "Suppliers", purchases: "Purchases", sales: "Sales", reports: "Reports", documents: "Documents", settings: "Settings", search: "Search products, sales or suppliers...", today: "Today", week: "Week", month: "Month", custom: "Custom", newProduct: "New product", inventory: "Inventory", movements: "Movements", all: "All", low: "Low", critical: "Critical", out: "Out of stock", save: "Save product", cancel: "Cancel"
  },
  ca: {
    dashboard: "Tauler", pos: "TPV Venda", products: "Productes", categories: "Categories", stock: "Estoc", suppliers: "Proveïdors", purchases: "Compres", sales: "Vendes", reports: "Informes", documents: "Documents", settings: "Configuració", search: "Cerca productes, vendes o proveïdors...", today: "Avui", week: "Setmana", month: "Mes", custom: "Personalitzat", newProduct: "Nou producte", inventory: "Inventari", movements: "Moviments", all: "Tots", low: "Baix", critical: "Crític", out: "Sense estoc", save: "Desar producte", cancel: "Cancel·lar"
  }
};

const PosContext = createContext<PosContextValue | undefined>(undefined);

export function PosProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: preferences } = useUserPreferences(user?.id || null);
  const { data: business } = useBusiness();
  const { data: profile } = useProfile(user?.id || null);

  const [language, setLanguage] = useState<Language>("es");
  const [dark, setDark] = useState(false);
  const [accentColor, setAccentColor] = useState("#3b82f6");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUpdatedAt, setLogoUpdatedAt] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    if (preferences?.theme) {
      setDark(preferences.theme === "dark");
    }
    if (preferences?.language) {
      setLanguage(preferences.language);
    }
  }, [preferences?.theme, preferences?.language]);

  useEffect(() => {
    const accentColor = preferences?.accent_color || "#3b82f6";
    setAccentColor(accentColor);
    document.documentElement.style.setProperty("--accent-color-dynamic", accentColor);
  }, [preferences?.accent_color]);

  useEffect(() => {
    setLogoUrl(business?.logo_url ?? null);
    setLogoUpdatedAt(business?.updated_at ?? null);
    setBusinessName(business?.name ?? null);
  }, [business]);

  useEffect(() => {
    setAvatarUrl(profile?.avatar_url ?? null);
  }, [profile?.avatar_url]);

  const handleSetAccentColor = (color: string) => {
    setAccentColor(color);
    document.documentElement.style.setProperty("--accent-color-dynamic", color);
  };

  return (
    <PosContext.Provider
      value={{
        language,
        setLanguage,
        dark,
        setDark,
        accentColor,
        setAccentColor: handleSetAccentColor,
        logoUrl,
        logoUpdatedAt,
        businessName,
        avatarUrl,
        t: (key) => copy[language][key] ?? key,
      }}
    >
      {children}
    </PosContext.Provider>
  );
}

export function usePos() {
  const value = useContext(PosContext);
  if (!value) throw new Error("PosProvider missing");
  return value;
}