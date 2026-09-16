import { Banknote, Barcode, CreditCard, Minus, Plus, Search, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useProducts } from "@/hooks/useProducts";
import { useCreateSale } from "@/hooks/useSales";
import { ProductImage, money } from "./pos-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CartItem = { id: string; qty: number };

export function PosScreen() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState("");
  const { data: products = [] } = useProducts();
  const createSale = useCreateSale();
  const [isProcessing, setIsProcessing] = useState(false);

  const change = (id: string, delta: number) =>
    setCart((c) =>
      c.map((x) =>
        x.id === id ? { ...x, qty: Math.max(1, x.qty + delta) } : x
      )
    );

  const subtotal = cart.reduce(
    (a, x) => a + (products.find((p) => p.id === x.id)?.sale_price ?? 0) * x.qty,
    0
  );
  const iva = subtotal * 0.1;

  const addFirst = () => {
    const p = products.find(
      (p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.sku.toLowerCase().includes(query.toLowerCase()) ||
        (p.barcode?.includes(query) ?? false)
    );
    if (!p) {
      toast.error("Producto no encontrado");
      return;
    }
    setCart((c) =>
      c.some((x) => x.id === p.id)
        ? c.map((x) => (x.id === p.id ? { ...x, qty: x.qty + 1 } : x))
        : [...c, { id: p.id, qty: 1 }]
    );
    setQuery("");
  };

  const processSale = async () => {
    if (cart.length === 0) {
      toast.error("Carrito vacío");
      return;
    }
    setIsProcessing(true);
    try {
      const saleCart = cart.map((item) => ({
        productId: item.id,
        quantity: item.qty,
        unitSalePrice: products.find((p) => p.id === item.id)?.sale_price ?? 0,
      }));
      await createSale.mutateAsync({
        sale: {
          source: "latin_pos" as const,
          status: "completed" as const,
          sale_date: new Date().toISOString(),
          subtotal: subtotal - iva,
          tax: iva,
          total: subtotal,
          payment_method: "cash",
        },
        cart: saleCart,
      });
      toast.success("Venta completada");
      setCart([]);
    } catch (error) {
      toast.error("Error al procesar venta");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="grid min-h-[calc(100dvh-120px)] grid-cols-[minmax(0,7fr)_minmax(320px,3fr)] gap-5">
      <section className="flex min-w-0 flex-col">
        <div>
          <h1 className="text-[25px] font-bold">TPV Venta</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Ticket abierto · Caja 01</p>
        </div>
        <div className="relative mt-5">
          <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={23} />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addFirst()}
            className="h-14 bg-card pl-12 pr-24 text-sm shadow-sm"
            placeholder="Escanee un código de barras o escriba un producto..."
          />
          <Button className="absolute right-2 top-2 h-10" onClick={addFirst}>
            <Search />
            Buscar
          </Button>
        </div>
        <div className="mt-4 overflow-hidden rounded-lg border bg-card">
          <div className="grid grid-cols-[minmax(240px,1fr)_90px_130px_90px_44px] border-b bg-muted/50 px-4 py-2.5 text-[10px] font-semibold uppercase text-muted-foreground">
            <span>Producto</span>
            <span>Precio</span>
            <span>Cantidad</span>
            <span>Subtotal</span>
            <span />
          </div>
          {cart.map((item) => {
            const p = products.find((x) => x.id === item.id);
            if (!p) return null;
            return (
              <div
                key={item.id}
                className="grid grid-cols-[minmax(240px,1fr)_90px_130px_90px_44px] items-center border-b px-4 py-3 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <ProductImage product={p as any} />
                  <div>
                    <p className="text-xs font-semibold">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">{p.sku}</p>
                  </div>
                </div>
                <span className="text-xs font-medium">{money(Number(p.sale_price))}</span>
                <div className="flex items-center">
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-8"
                    onClick={() => change(p.id, -1)}
                  >
                    <Minus />
                  </Button>
                  <span className="w-9 text-center text-xs font-bold">{item.qty}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-8"
                    onClick={() => change(p.id, 1)}
                  >
                    <Plus />
                  </Button>
                </div>
                <strong className="text-xs">{money(Number(p.sale_price) * item.qty)}</strong>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setCart((c) => c.filter((x) => x.id !== p.id))}
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}
        </div>
      </section>
      <aside className="flex flex-col rounded-lg border bg-card p-5 shadow-sm">
        <h2 className="text-base font-bold">Resumen del pedido</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {cart.reduce((a, x) => a + x.qty, 0)} artículos
        </p>
        <div className="my-6 space-y-3 border-y py-5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <b>{money(subtotal - iva)}</b>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">IVA (10%)</span>
            <b>{money(iva)}</b>
          </div>
        </div>
        <div className="flex items-end justify-between">
          <span className="text-sm font-bold">TOTAL</span>
          <strong className="text-[32px] leading-none">{money(subtotal)}</strong>
        </div>
        <div className="mt-auto space-y-3 pt-8">
          <Button
            className="h-14 w-full text-sm"
            onClick={processSale}
            disabled={isProcessing || cart.length === 0}
          >
            <Banknote />
            {isProcessing ? "Procesando..." : "Cobrar en efectivo"}
          </Button>
          <Button
            variant="outline"
            className="h-14 w-full text-sm"
            onClick={processSale}
            disabled={isProcessing || cart.length === 0}
          >
            <CreditCard />
            {isProcessing ? "Procesando..." : "Cobrar con tarjeta"}
          </Button>
          <Button
            variant="ghost"
            className="h-11 w-full text-muted-foreground"
            onClick={() => setCart([])}
            disabled={isProcessing}
          >
            <XCircle />
            Cancelar venta
          </Button>
        </div>
      </aside>
    </div>
  );
}
