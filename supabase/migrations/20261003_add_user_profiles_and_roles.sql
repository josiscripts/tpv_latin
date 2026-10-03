-- User profiles and roles for TPV LAB authentication
-- Fecha: 2026-10-03

-- ============================================================================
-- TABLA: USER_ROLES (Tipos de roles disponibles)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO user_roles (id, name, description) VALUES
  ('admin', 'Administrador', 'Acceso completo al TPV'),
  ('employee', 'Empleado', 'Acceso estándar al TPV')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- TABLA: PROFILES (Perfiles de usuario asociados a auth.users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role_id TEXT NOT NULL DEFAULT 'employee',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT email_not_empty CHECK (LENGTH(TRIM(email)) > 0),
  FOREIGN KEY (role_id) REFERENCES user_roles(id) ON DELETE RESTRICT
);

CREATE TRIGGER profiles_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_role_id ON profiles(role_id);
CREATE INDEX idx_profiles_active ON profiles(active);

-- ============================================================================
-- FUNCTION: Crear perfil automáticamente al crear usuario en auth.users
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  is_first_user BOOLEAN;
  initial_role TEXT;
BEGIN
  -- Verificar si es el primer usuario en la tabla profiles
  is_first_user := (SELECT COUNT(*) FROM public.profiles) = 0;

  -- El primer usuario es admin, el resto employee
  initial_role := CASE WHEN is_first_user THEN 'admin' ELSE 'employee' END;

  INSERT INTO public.profiles (id, email, full_name, role_id, active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    initial_role,
    TRUE
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- TRIGGER: Ejecutar handle_new_user cuando se crea un usuario en auth.users
-- ============================================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- RLS en user_roles (lectura pública, escritura restringida)
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_read_user_roles" ON user_roles
FOR SELECT
USING (true);

-- RLS en profiles (cada usuario ve su perfil + admin ve todo)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_read_own_profile" ON profiles
FOR SELECT
USING (auth.uid() = id OR auth.jwt() ->> 'role' = 'authenticated' AND
  (SELECT role_id FROM profiles WHERE id = auth.uid()) = 'admin'
);

CREATE POLICY "allow_update_own_profile" ON profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Admin puede insertar/actualizar perfiles
CREATE POLICY "allow_admin_manage_profiles" ON profiles
FOR ALL
USING (
  (SELECT role_id FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================================================
-- COMENTARIOS
-- ============================================================================
COMMENT ON TABLE profiles IS 'Perfiles de usuario vinculados a auth.users';
COMMENT ON TABLE user_roles IS 'Roles disponibles en el TPV (admin, employee)';
COMMENT ON COLUMN profiles.role_id IS 'Rol del usuario (admin o employee)';
COMMENT ON FUNCTION handle_new_user() IS 'Crear perfil automáticamente cuando se crea usuario en auth.users. El primer usuario es admin.';
