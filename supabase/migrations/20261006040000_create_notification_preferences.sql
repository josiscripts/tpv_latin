-- Notification preferences table
-- Fecha: 2026-10-06

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  sales_enabled BOOLEAN NOT NULL DEFAULT true,
  products_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER notification_preferences_updated_at
BEFORE UPDATE ON notification_preferences
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Each user can read and update their own preferences
CREATE POLICY "allow_read_own_notification_prefs" ON notification_preferences
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "allow_update_own_notification_prefs" ON notification_preferences
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "allow_insert_own_notification_prefs" ON notification_preferences
FOR INSERT
WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE notification_preferences IS 'Preferencias de notificaciones del usuario (on/off)';
