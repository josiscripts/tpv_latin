-- Migration: Add processing lease tokens for worker propiedad persistente
-- Purpose: Enable persistent identification and recovery of processing workers
-- Date: 2026-10-11
-- Status: NOT EXECUTED - Prepared for C7.1 authorization

-- Step 1: Add lease columns to documents table
ALTER TABLE documents
ADD COLUMN processing_lease_token UUID,
ADD COLUMN processing_lease_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN processing_attempt_number INTEGER DEFAULT 1;

-- Step 2: Create indices for efficient lookups
CREATE INDEX idx_documents_lease_token
  ON documents(processing_lease_token)
  WHERE processing_lease_token IS NOT NULL;

CREATE INDEX idx_documents_processing_attempt
  ON documents(id, processing_attempt_number DESC);

-- Step 3: Create function for atomic claim operation
-- This function ensures only one worker can claim a document at a time
CREATE OR REPLACE FUNCTION claim_document_for_processing(
  p_document_id UUID,
  p_lease_duration INTERVAL DEFAULT '5 minutes'::INTERVAL
)
RETURNS UUID AS $$
DECLARE
  v_new_token UUID;
  v_claim_succeeded BOOLEAN;
BEGIN
  v_new_token := gen_random_uuid();

  UPDATE documents
  SET
    processing_status = 'processing',
    processing_lease_token = v_new_token,
    processing_lease_expires_at = NOW() + p_lease_duration,
    processing_attempt_number = COALESCE(processing_attempt_number, 0) + 1,
    processing_error = NULL,
    updated_at = NOW()
  WHERE
    id = p_document_id
    AND processing_status IN ('uploaded', 'error')
    AND (processing_lease_expires_at IS NULL OR processing_lease_expires_at < NOW())
  RETURNING TRUE INTO v_claim_succeeded;

  IF v_claim_succeeded THEN
    RETURN v_new_token;
  ELSE
    RETURN NULL;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 4: Create function for protected finalization
-- Only the holder of the token can mark as processed
CREATE OR REPLACE FUNCTION finalize_document_as_processed(
  p_document_id UUID,
  p_lease_token UUID,
  p_document_date DATE DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_rows_updated INTEGER;
BEGIN
  UPDATE documents
  SET
    processing_status = 'processed',
    processing_error = NULL,
    processing_lease_token = NULL,
    processing_lease_expires_at = NULL,
    document_date = COALESCE(p_document_date, document_date),
    updated_at = NOW()
  WHERE
    id = p_document_id
    AND processing_lease_token = p_lease_token
    AND processing_lease_expires_at > NOW()
  RETURNING TRUE INTO v_rows_updated;

  RETURN v_rows_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 5: Create function for protected error marking
-- Only the holder of the token can mark as error
CREATE OR REPLACE FUNCTION mark_document_as_error(
  p_document_id UUID,
  p_lease_token UUID,
  p_error_message TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_rows_updated INTEGER;
BEGIN
  UPDATE documents
  SET
    processing_status = 'error',
    processing_error = p_error_message,
    processing_lease_token = NULL,
    processing_lease_expires_at = NULL,
    updated_at = NOW()
  WHERE
    id = p_document_id
    AND processing_lease_token = p_lease_token
    AND processing_lease_expires_at > NOW()
  RETURNING TRUE INTO v_rows_updated;

  RETURN v_rows_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 6: Create function for protected extraction persistence
-- Prevents overwriting by non-owner, validates lease is valid
CREATE OR REPLACE FUNCTION persist_extraction_with_ownership(
  p_document_id UUID,
  p_lease_token UUID,
  p_extraction_data JSONB,
  p_extraction_model TEXT
)
RETURNS UUID AS $$
DECLARE
  v_extraction_id UUID;
  v_lease_valid BOOLEAN;
BEGIN
  -- Verify lease is still valid
  SELECT processing_lease_token IS NOT NULL
    AND processing_lease_expires_at > NOW()
  INTO v_lease_valid
  FROM documents
  WHERE id = p_document_id AND processing_lease_token = p_lease_token;

  IF NOT v_lease_valid THEN
    RAISE EXCEPTION 'Document lease invalid or expired for doc %', p_document_id;
  END IF;

  -- Insert extraction with current attempt number
  INSERT INTO document_extractions (
    document_id,
    extraction_model,
    raw_response,
    attempt_number,
    extracted_at
  )
  SELECT
    p_document_id,
    p_extraction_model,
    p_extraction_data,
    processing_attempt_number,
    NOW()
  FROM documents
  WHERE id = p_document_id AND processing_lease_token = p_lease_token
  RETURNING id INTO v_extraction_id;

  RETURN v_extraction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 7: Create function for recovery of abandoned documents
-- Attempts to recover documents with expired leases
-- Returns count of documents recovered
CREATE OR REPLACE FUNCTION recover_abandoned_documents(
  p_max_lease_age INTERVAL DEFAULT '30 minutes'::INTERVAL
)
RETURNS TABLE(recovered_count INTEGER, error_recovery_count INTEGER) AS $$
DECLARE
  v_recovered INTEGER := 0;
  v_error_recovered INTEGER := 0;
BEGIN
  -- Recover documents with expired leases back to 'uploaded'
  UPDATE documents
  SET
    processing_status = 'uploaded',
    processing_lease_token = NULL,
    processing_lease_expires_at = NULL,
    processing_error = NULL,
    updated_at = NOW()
  WHERE
    processing_status = 'processing'
    AND processing_lease_expires_at < NOW()
    AND NOW() - processing_lease_expires_at < p_max_lease_age
  RETURNING TRUE INTO v_recovered;

  -- Also recover error documents if their lease expired
  UPDATE documents
  SET
    processing_status = 'uploaded',
    processing_lease_token = NULL,
    processing_lease_expires_at = NULL,
    updated_at = NOW()
  WHERE
    processing_status = 'error'
    AND processing_lease_expires_at IS NOT NULL
    AND processing_lease_expires_at < NOW()
    AND NOW() - processing_lease_expires_at < p_max_lease_age
  RETURNING TRUE INTO v_error_recovered;

  RETURN QUERY SELECT v_recovered, v_error_recovered;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 8: Grant appropriate permissions
-- Only authenticated users can call claim, not anonymous
GRANT EXECUTE ON FUNCTION claim_document_for_processing TO authenticated;
GRANT EXECUTE ON FUNCTION finalize_document_as_processed TO authenticated;
GRANT EXECUTE ON FUNCTION mark_document_as_error TO authenticated;
GRANT EXECUTE ON FUNCTION persist_extraction_with_ownership TO authenticated;
GRANT EXECUTE ON FUNCTION recover_abandoned_documents TO authenticated;

-- Note: These functions use SECURITY DEFINER to bypass RLS
-- They validate ownership via processing_lease_token before executing
-- This is safe because the token is opaque and generated per request
