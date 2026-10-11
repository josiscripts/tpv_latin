import { X, CheckCheck, Clock } from 'lucide-react';
import { useAuthContext } from './auth-provider';
import { useNotifications } from '@/hooks/useNotifications';
import { notificationsService } from '@/services/notifications.service';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';

export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const { profile } = useAuthContext();
  const queryClient = useQueryClient();
  const { data: notifications = [], isLoading } = useNotifications(profile?.id || null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAsRead = async (id: string) => {
    try {
      await notificationsService.markAsRead(id);
      queryClient.invalidateQueries({
        queryKey: ['notifications', profile?.id],
      });
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      for (const notification of notifications.filter((n) => !n.read)) {
        await notificationsService.markAsRead(notification.id);
      }
      queryClient.invalidateQueries({
        queryKey: ['notifications', profile?.id],
      });
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      sale: 'Venta',
      product: 'Producto',
      system: 'Sistema',
    };
    return labels[type] || type;
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      sale: 'bg-blue-500/10 text-blue-600',
      product: 'bg-green-500/10 text-green-600',
      system: 'bg-gray-500/10 text-gray-600',
    };
    return colors[type] || 'bg-gray-500/10 text-gray-600';
  };

  return (
    <div className="w-96 max-h-96 flex flex-col bg-card border rounded-lg shadow-lg">
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <h2 className="font-semibold text-sm">Notificaciones</h2>
          {unreadCount > 0 && (
            <p className="text-xs text-muted-foreground">{unreadCount} sin leer</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="h-8 px-2 text-xs"
            >
              <CheckCheck size={14} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X size={16} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Cargando...
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Sin notificaciones
          </div>
        ) : (
          <div className="space-y-2 p-2">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-3 rounded-lg border transition-colors ${
                  notification.read
                    ? 'bg-muted/30 opacity-60'
                    : 'bg-primary/5 border-primary/20'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${getTypeColor(notification.type)}`}>
                        {getTypeLabel(notification.type)}
                      </span>
                      {!notification.read && (
                        <span className="size-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground truncate">
                      {notification.title}
                    </p>
                    {notification.content && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {notification.content}
                      </p>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                      <Clock size={12} />
                      {new Date(notification.created_at).toLocaleString('es-ES')}
                    </div>
                  </div>
                  {!notification.read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMarkAsRead(notification.id)}
                      className="h-8 px-2 shrink-0"
                    >
                      <CheckCheck size={14} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
