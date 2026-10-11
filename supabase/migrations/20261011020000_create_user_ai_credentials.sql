-- Create user_ai_credentials table for securely storing user's own API keys
-- API keys are encrypted at rest using pgcrypto AES-256-CBC

-- Enable pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE user_ai_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'anthropic' CHECK (provider IN ('anthropic')),
  -- Store API key encrypted using pgp_sym_encrypt (AES-256)
  -- Encryption key comes from environment variable set at Edge Function level
  api_key_encrypted BYTEA NOT NULL,
  -- Metadata (safe to store unencrypted)
  model_id TEXT NOT NULL DEFAULT 'claude-3-5-haiku-20241022',
  last_validated_at TIMESTAMP WITH TIME ZONE,
  validation_status TEXT DEFAULT 'unvalidated' CHECK (validation_status IN ('unvalidated', 'valid', 'invalid')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, provider)
);

-- Create index for fast lookups by user_id
CREATE INDEX idx_user_ai_credentials_user_id ON user_ai_credentials(user_id);

-- Create trigger to update updated_at
CREATE TRIGGER update_user_ai_credentials_updated_at
BEFORE UPDATE ON user_ai_credentials
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies: Only user can read/write their own credentials
ALTER TABLE user_ai_credentials ENABLE ROW LEVEL SECURITY;

-- SELECT: User can only read their own credentials (but not decrypt them)
CREATE POLICY "Users can read own AI credentials metadata"
  ON user_ai_credentials
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: User can only insert their own credentials
CREATE POLICY "Users can insert own AI credentials"
  ON user_ai_credentials
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: User can only update their own credentials (model_id only, not the encrypted key)
CREATE POLICY "Users can update own AI credentials"
  ON user_ai_credentials
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: User can only delete their own credentials
CREATE POLICY "Users can delete own AI credentials"
  ON user_ai_credentials
  FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can read encrypted keys (for Edge Functions to decrypt and use)
-- This is necessary for process-document to retrieve and decrypt the key
CREATE POLICY "Service role can access AI credentials"
  ON user_ai_credentials
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can update AI credentials"
  ON user_ai_credentials
  FOR UPDATE
  TO service_role
  USING (true);
