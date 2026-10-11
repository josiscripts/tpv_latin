import { useState, useCallback, useRef } from 'react';
import { Search, Truck, CircleDollarSign, ShoppingBasket, FileText, Loader2, ChevronRight } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ProductImage, money } from './pos-ui';
import { supabase } from '@/lib/supabase';
import { usePos } from './pos-context';

interface SearchResult {
  id: string;
  title: string;
  subtitle: string | undefined;
  category: 'product' | 'supplier' | 'sale' | 'purchase' | 'document';
  icon: React.ReactNode;
  route: string;
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const { t } = usePos();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout>();

  const searchAll = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    const results: SearchResult[] = [];

    try {
      const q = `%${searchQuery}%`;

      // Productos - buscar por nombre, SKU, barcode
      try {
        const { data: products } = await supabase
          .from('products')
          .select('id, name, sku, barcode, image, sale_price, category_id')
          .is('deleted_at', null)
          .or(`name.ilike.${q},sku.ilike.${q},barcode.ilike.${q}`)
          .limit(5);

        products?.forEach((p: any) => {
          if (p.id && p.name) {
            // Ruta funcional desde Categorías: /products/:id?categoryId=:catId
            const route = p.category_id
              ? `/products/${p.id}?categoryId=${p.category_id}`
              : `/products/${p.id}`;

            results.push({
              id: p.id,
              title: p.name,
              subtitle: `${p.sku ? `SKU: ${p.sku}` : ''}${p.sale_price ? ` - ${money(p.sale_price)}` : ''}`.trim(),
              category: 'product',
              icon: <ProductImage product={p} size="sm" />,
              route: route,
            });
          }
        });
      } catch (err) {
        console.error('Error searching products:', err);
      }

      // Proveedores - buscar por nombre, tax_id
      try {
        const { data: suppliers } = await supabase
          .from('suppliers')
          .select('id, name, tax_id')
          .eq('active', true)
          .or(`name.ilike.${q},tax_id.ilike.${q}`)
          .limit(5);

        suppliers?.forEach(s => {
          if (s.id && s.name) {
            results.push({
              id: s.id,
              title: s.name,
              subtitle: s.tax_id ? `NIF: ${s.tax_id}` : undefined,
              category: 'supplier',
              icon: <Truck className="h-4 w-4" />,
              route: `/suppliers?selected=${s.id}`,
            });
          }
        });
      } catch (err) {
        console.error('Error searching suppliers:', err);
      }

      // Ventas - sin filtro de palabra clave (búsqueda por id/fecha no es práctica)
      // Mostrar últimas ventas completadas
      try {
        const { data: sales } = await supabase
          .from('sales')
          .select('id, sale_date, total, customers(name)')
          .eq('status', 'completed')
          .gte('sale_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .order('sale_date', { ascending: false })
          .limit(5);

        sales?.forEach(s => {
          const customer = (s.customers as any)?.name || 'Cliente';
          // Buscar solo si coincide con búsqueda
          if (
            s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            customer.toLowerCase().includes(searchQuery.toLowerCase())
          ) {
            results.push({
              id: s.id,
              title: `Venta - ${customer}`,
              subtitle: `${new Date(s.sale_date).toLocaleDateString()} - $${s.total}`,
              category: 'sale',
              icon: <CircleDollarSign className="h-4 w-4" />,
              route: `/sales?selected=${s.id}`,
            });
          }
        });
      } catch (err) {
        console.error('Error searching sales:', err);
      }

      // Compras - sin filtro de palabra clave
      try {
        const { data: purchases } = await supabase
          .from('purchases')
          .select('id, purchase_date, total, suppliers(name), invoice_number')
          .eq('status', 'received')
          .order('purchase_date', { ascending: false })
          .limit(10);

        purchases?.forEach(p => {
          const supplier = (p.suppliers as any)?.name || 'Proveedor';
          // Buscar por invoice_number o supplier
          if (
            (p.invoice_number && p.invoice_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
            supplier.toLowerCase().includes(searchQuery.toLowerCase())
          ) {
            results.push({
              id: p.id,
              title: `Compra - ${supplier}`,
              subtitle: `Fact: ${p.invoice_number || 'N/A'} - ${new Date(p.purchase_date).toLocaleDateString()}`,
              category: 'purchase',
              icon: <ShoppingBasket className="h-4 w-4" />,
              route: `/purchases?selected=${p.id}`,
            });
          }
        });
      } catch (err) {
        console.error('Error searching purchases:', err);
      }

      // Documentos - buscar por nombre
      try {
        const { data: documents } = await supabase
          .from('documents')
          .select('id, original_name, document_type, created_at')
          .is('deleted_at', null)
          .ilike('original_name', q)
          .limit(5);

        documents?.forEach(d => {
          if (d.id && d.original_name) {
            const typeLabel = d.document_type === 'invoice' ? 'Factura' :
                            d.document_type === 'delivery_note' ? 'Albarán' :
                            d.document_type === 'other' ? 'Otro' : d.document_type;
            results.push({
              id: d.id,
              title: d.original_name,
              subtitle: `${typeLabel} - ${new Date(d.created_at).toLocaleDateString()}`,
              category: 'document',
              icon: <FileText className="h-4 w-4" />,
              route: `/documents?selected=${d.id}`,
            });
          }
        });
      } catch (err) {
        console.error('Error searching documents:', err);
      }

      setResults(results);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    clearTimeout(debounceTimer.current);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    debounceTimer.current = setTimeout(() => {
      searchAll(value);
    }, 300);
  }, [searchAll]);

  const handleSelect = (route: string) => {
    setOpen(false);
    setQuery('');
    setResults([]);
    const [path, search] = route.split('?');
    navigate({ to: path, search: search ? '?' + search : undefined } as any);
  };

  const groupedResults = {
    product: results.filter(r => r.category === 'product'),
    supplier: results.filter(r => r.category === 'supplier'),
    sale: results.filter(r => r.category === 'sale'),
    purchase: results.filter(r => r.category === 'purchase'),
    document: results.filter(r => r.category === 'document'),
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-full max-w-[460px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} />
          <input
            type="text"
            placeholder={t('search')}
            className="h-10 w-full rounded-md border border-input bg-muted/55 pl-10 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            onClick={() => setOpen(true)}
            onChange={(e) => handleSearch(e.target.value)}
            value={query}
          />
          {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[500px] p-0" align="start">
        <div className="space-y-2 p-3 max-h-[500px] overflow-y-auto">
          {!query.trim() ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              Busca productos, proveedores, ventas, compras o documentos...
            </div>
          ) : loading ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              Buscando...
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No se encontraron resultados para "{query}"
            </div>
          ) : (
            <>
              {groupedResults.product.length > 0 && (
                <div className="space-y-1 border-b pb-2">
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Productos</div>
                  {groupedResults.product.map(r => (
                    <button
                      key={`${r.category}-${r.id}`}
                      onClick={() => handleSelect(r.route)}
                      className="w-full flex items-center justify-between rounded px-2 py-2 text-sm hover:bg-accent text-left transition"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {r.icon}
                        <div className="min-w-0">
                          <div className="font-medium truncate">{r.title}</div>
                          {r.subtitle && <div className="text-xs text-muted-foreground truncate">{r.subtitle}</div>}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}

              {groupedResults.supplier.length > 0 && (
                <div className="space-y-1 border-b pb-2">
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Proveedores</div>
                  {groupedResults.supplier.map(r => (
                    <button
                      key={`${r.category}-${r.id}`}
                      onClick={() => handleSelect(r.route)}
                      className="w-full flex items-center justify-between rounded px-2 py-2 text-sm hover:bg-accent text-left transition"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {r.icon}
                        <div className="min-w-0">
                          <div className="font-medium truncate">{r.title}</div>
                          {r.subtitle && <div className="text-xs text-muted-foreground truncate">{r.subtitle}</div>}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}

              {groupedResults.sale.length > 0 && (
                <div className="space-y-1 border-b pb-2">
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Ventas</div>
                  {groupedResults.sale.map(r => (
                    <button
                      key={`${r.category}-${r.id}`}
                      onClick={() => handleSelect(r.route)}
                      className="w-full flex items-center justify-between rounded px-2 py-2 text-sm hover:bg-accent text-left transition"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {r.icon}
                        <div className="min-w-0">
                          <div className="font-medium truncate">{r.title}</div>
                          {r.subtitle && <div className="text-xs text-muted-foreground truncate">{r.subtitle}</div>}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}

              {groupedResults.purchase.length > 0 && (
                <div className="space-y-1 border-b pb-2">
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Compras</div>
                  {groupedResults.purchase.map(r => (
                    <button
                      key={`${r.category}-${r.id}`}
                      onClick={() => handleSelect(r.route)}
                      className="w-full flex items-center justify-between rounded px-2 py-2 text-sm hover:bg-accent text-left transition"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {r.icon}
                        <div className="min-w-0">
                          <div className="font-medium truncate">{r.title}</div>
                          {r.subtitle && <div className="text-xs text-muted-foreground truncate">{r.subtitle}</div>}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}

              {groupedResults.document.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Documentos</div>
                  {groupedResults.document.map(r => (
                    <button
                      key={`${r.category}-${r.id}`}
                      onClick={() => handleSelect(r.route)}
                      className="w-full flex items-center justify-between rounded px-2 py-2 text-sm hover:bg-accent text-left transition"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {r.icon}
                        <div className="min-w-0">
                          <div className="font-medium truncate">{r.title}</div>
                          {r.subtitle && <div className="text-xs text-muted-foreground truncate">{r.subtitle}</div>}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
