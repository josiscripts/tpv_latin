-- Notifications table
-- Fecha: 2026-10-06

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('sale', 'product', 'system')),
  title TEXT NOT NULL,
  content TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Each user can read their own notifications
CREATE POLICY "allow_read_own_notifications" ON notifications
FOR SELECT
USING (auth.uid() = user_id);

-- Admin can insert notifications for any user
CREATE POLICY "allow_admin_insert_notifications" ON notifications
FOR INSERT
WITH CHECK (
  (SELECT role_id FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- Each user can update their own notifications (mark as read)
CREATE POLICY "allow_update_own_notifications" ON notifications
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE notifications IS 'Notificaciones del sistema para usuarios';
