import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard.service';

const DASHBOARD_KEY = ['dashboard'];

export function useTodayStats() {
  return useQuery({
    queryKey: [...DASHBOARD_KEY, 'today'],
    queryFn: () => dashboardService.getTodayStats(),
    refetchInterval: 60000, // Refetch cada minuto
  });
}

export function useWeeklySalesData() {
  return useQuery({
    queryKey: [...DASHBOARD_KEY, 'weekly'],
    queryFn: () => dashboardService.getWeeklySalesData(),
  });
}

export function useCriticalStockProducts() {
  return useQuery({
    queryKey: [...DASHBOARD_KEY, 'critical-stock'],
    queryFn: () => dashboardService.getCriticalStockProducts(),
    refetchInterval: 120000, // Refetch cada 2 minutos
  });
}

export function useTopSellingProducts(days = 30) {
  return useQuery({
    queryKey: [...DASHBOARD_KEY, 'top-sellers', days],
    queryFn: () => dashboardService.getTopSellingProducts(days),
  });
}

export function useMonthlySalesData(months = 6) {
  return useQuery({
    queryKey: [...DASHBOARD_KEY, 'monthly', months],
    queryFn: () => dashboardService.getMonthlySalesData(months),
  });
}

export function useTotalInventoryValue() {
  return useQuery({
    queryKey: [...DASHBOARD_KEY, 'inventory-value'],
    queryFn: () => dashboardService.getTotalInventoryValue(),
  });
}

export function useStockStats() {
  return useQuery({
    queryKey: [...DASHBOARD_KEY, 'stock-stats'],
    queryFn: () => dashboardService.getStockStats(),
    refetchInterval: 60000,
  });
}
