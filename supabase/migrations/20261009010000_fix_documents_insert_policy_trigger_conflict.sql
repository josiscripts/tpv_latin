-- FASE 0: Fix documents INSERT policy to align with BEFORE INSERT trigger
-- Fecha: 2026-10-09
-- Purpose: Resolve RLS contradiction between trigger (sets uploaded_by = auth.uid())
--          and policy (required uploaded_by IS NULL)

-- ============================================================================
-- ISSUE ANALYSIS
-- ============================================================================
-- The trigger documents_set_uploaded_by (BEFORE INSERT) modifies:
--   IF NEW.uploaded_by IS NULL THEN NEW.uploaded_by = auth.uid()
--
-- But the policy "documents_insert_authenticated" requires:
--   WITH CHECK (auth.role() = 'authenticated' AND uploaded_by IS NULL)
--
-- Execution order: TRIGGER fires BEFORE policy evaluation, so policy sees
-- the MODIFIED value (uploaded_by = auth.uid()), not the original NULL.
-- Result: Policy rejects with 403 Forbidden.
--
-- Solution: Policy must accept the value AFTER trigger modification, which is
-- uploaded_by = auth.uid(). Trigger guarantees this, so policy should validate it.

-- ============================================================================
-- FIX: DROP and RECREATE INSERT POLICY
-- ============================================================================

DROP POLICY IF EXISTS "documents_insert_authenticated" ON public.documents;

CREATE POLICY "documents_insert_authenticated"
ON public.documents
FOR INSERT
TO authenticated
WITH CHECK (uploaded_by = (SELECT auth.uid()));

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "documents_insert_authenticated" ON public.documents IS
  'Authenticated users can upload. The trigger ensures uploaded_by = auth.uid() before this policy evaluation. Policy validates that the row belongs to the uploader.';
