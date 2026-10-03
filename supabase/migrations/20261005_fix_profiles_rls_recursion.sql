-- Fix infinite recursion in profiles RLS policies
-- Fecha: 2026-10-04

-- ============================================================================
-- CREATE FUNCTION: is_admin_user() - Check if user is admin without recursion
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_admin_user(user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM profiles
    WHERE id = user_id AND role_id = 'admin'
  );
$$;

COMMENT ON FUNCTION is_admin_user(UUID) IS 'Check if a user has admin role without causing RLS recursion';

-- ============================================================================
-- DROP RECURSIVE POLICIES FROM profiles TABLE
-- ============================================================================

DROP POLICY IF EXISTS "allow_read_own_profile" ON profiles;
DROP POLICY IF EXISTS "allow_admin_manage_profiles" ON profiles;

-- ============================================================================
-- CREATE NEW NON-RECURSIVE POLICIES ON profiles TABLE
-- ============================================================================

-- RLS: Authenticated users can read ONLY their own profile
CREATE POLICY "profiles_select_own"
ON profiles
FOR SELECT
USING (auth.uid() = id);

-- RLS: Authenticated users can update ONLY their own profile
CREATE POLICY "profiles_update_own"
ON profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- RLS: Admin users can manage all profiles (using function, not recursive subquery)
CREATE POLICY "profiles_admin_all"
ON profiles
FOR ALL
USING (is_admin_user(auth.uid()))
WITH CHECK (is_admin_user(auth.uid()));

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "profiles_select_own" ON profiles IS 'Users can read their own profile';
COMMENT ON POLICY "profiles_update_own" ON profiles IS 'Users can update their own profile';
COMMENT ON POLICY "profiles_admin_all" ON profiles IS 'Admin users can manage all profiles';
