-- Add sound_enabled column to notification_preferences
-- Fecha: 2026-10-08

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_preferences'
    AND column_name = 'sound_enabled'
  ) THEN
    ALTER TABLE notification_preferences
    ADD COLUMN sound_enabled BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;
