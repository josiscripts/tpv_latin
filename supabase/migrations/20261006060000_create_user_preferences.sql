-- User preferences table (theme, language, accent color)
-- Fecha: 2026-10-06

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
  accent_color TEXT NOT NULL DEFAULT '#3b82f6',
  language TEXT NOT NULL DEFAULT 'es' CHECK (language IN ('es', 'en', 'ca')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER user_preferences_updated_at
BEFORE UPDATE ON user_preferences
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Each user can read and update their own preferences
CREATE POLICY "allow_read_own_preferences" ON user_preferences
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "allow_update_own_preferences" ON user_preferences
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "allow_insert_own_preferences" ON user_preferences
FOR INSERT
WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE user_preferences IS 'Preferencias del usuario (tema, color, idioma)';
