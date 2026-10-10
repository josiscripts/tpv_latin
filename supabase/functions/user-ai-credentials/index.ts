import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.3';

interface RequestBody {
  action: 'save' | 'delete' | 'get' | 'test';
  apiKey?: string;
  modelId?: string;
}

// Encryption utilities using AES-256-GCM
async function getEncryptionKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('ANTHROPIC_KEY_ENCRYPTION_SECRET');
  if (!secret) {
    throw new Error(
      'ANTHROPIC_KEY_ENCRYPTION_SECRET not configured. ' +
      'Generate with: npx -e "console.log(crypto.getRandomValues(new Uint8Array(32)).reduce((s,b)=>s+b.toString(16).padStart(2,\'0\'),\'\')); "' +
      ' and set in supabase/functions/.env (LOCAL) or Function Secrets (production)'
    );
  }

  // Convert hex string to bytes
  const keyBytes = new Uint8Array(
    secret.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
  );

  if (keyBytes.length !== 32) {
    throw new Error(`ANTHROPIC_KEY_ENCRYPTION_SECRET must be 64 hex chars (32 bytes), got ${secret.length}`);
  }

  return await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptAPIKey(apiKey: string): Promise<string> {
  const key = await getEncryptionKey();
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(apiKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  // Format: 1:iv:ciphertext (version 1 = AES-256-GCM)
  const combined = new Uint8Array(1 + iv.length + ciphertext.byteLength);
  combined[0] = 1;
  combined.set(iv, 1);
  combined.set(new Uint8Array(ciphertext), 1 + iv.length);

  return 'v1:' + btoa(String.fromCharCode(...combined));
}

async function decryptAPIKey(encrypted: string): Promise<string> {
  if (!encrypted.startsWith('v1:')) {
    throw new Error('Invalid encryption format or version mismatch');
  }

  const key = await getEncryptionKey();
  const combined = new Uint8Array(
    atob(encrypted.substring(3))
      .split('')
      .map(c => c.charCodeAt(0))
  );

  if (combined.length < 13) {
    throw new Error('Encrypted data too short');
  }

  const iv = combined.slice(1, 13);
  const ciphertext = combined.slice(13);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Create authenticated Supabase client
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const body: RequestBody = await req.json();
    const userId = user.id;
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Handle actions
    switch (body.action) {
      case 'save': {
        if (!body.apiKey || !body.modelId) {
          return new Response(
            JSON.stringify({ error: 'Missing apiKey or modelId' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }

        // Validate API key format (basic check)
        if (!body.apiKey.startsWith('sk-ant-')) {
          return new Response(
            JSON.stringify({ error: 'Invalid API key format' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }

        // Encrypt API key using AES-256-GCM (server-side only)
        let apiKeyEncrypted: string;
        try {
          apiKeyEncrypted = await encryptAPIKey(body.apiKey);
          console.log(`[user-ai-credentials] Encrypted credentials for user ${userId}`);
        } catch (encryptError) {
          console.error('[user-ai-credentials] Encryption failed:', encryptError instanceof Error ? encryptError.message : String(encryptError));
          return new Response(
            JSON.stringify({ error: 'Failed to encrypt credentials' }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }

        const { data, error } = await serviceClient
          .from('user_ai_credentials')
          .upsert(
            {
              user_id: userId,
              provider: 'anthropic',
              api_key_encrypted: apiKeyEncrypted,
              model_id: body.modelId,
              validation_status: 'unvalidated',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,provider' }
          )
          .select('id, model_id, provider, validation_status, updated_at')
          .single();

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, data }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      case 'get': {
        const { data, error } = await supabase
          .from('user_ai_credentials')
          .select('id, provider, model_id, validation_status, updated_at')
          .eq('user_id', userId)
          .eq('provider', 'anthropic')
          .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;

        return new Response(
          JSON.stringify({ data: data || null }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      case 'delete': {
        const { error } = await supabase
          .from('user_ai_credentials')
          .delete()
          .eq('user_id', userId)
          .eq('provider', 'anthropic');

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      case 'test': {
        // Get the encrypted key
        const { data: creds, error: credsError } = await serviceClient
          .from('user_ai_credentials')
          .select('api_key_encrypted, model_id')
          .eq('user_id', userId)
          .eq('provider', 'anthropic')
          .maybeSingle();

        if (credsError || !creds) {
          return new Response(
            JSON.stringify({ valid: false, error: 'No credentials configured' }),
            { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }

        // Decrypt key using AES-256-GCM
        let apiKey: string;
        try {
          apiKey = await decryptAPIKey(creds.api_key_encrypted);
        } catch (decryptError) {
          console.error('[user-ai-credentials] Decryption failed:', decryptError instanceof Error ? decryptError.message : String(decryptError));
          return new Response(
            JSON.stringify({ valid: false, error: 'Failed to decrypt credentials' }),
            { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }

        // Test with Anthropic API
        try {
          const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'anthropic-version': '2023-06-01',
              'x-api-key': apiKey,
            },
            body: JSON.stringify({
              model: creds.model_id,
              max_tokens: 100,
              messages: [
                {
                  role: 'user',
                  content: 'Test connection',
                },
              ],
            }),
          });

          if (anthropicResponse.ok) {
            // Update validation status
            await serviceClient
              .from('user_ai_credentials')
              .update({
                validation_status: 'valid',
                last_validated_at: new Date().toISOString(),
              })
              .eq('user_id', userId)
              .eq('provider', 'anthropic');

            return new Response(
              JSON.stringify({ valid: true }),
              { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
            );
          } else {
            const errorData = await anthropicResponse.json();
            return new Response(
              JSON.stringify({
                valid: false,
                error: errorData.error?.message || 'API key validation failed',
              }),
              { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
            );
          }
        } catch (testError) {
          return new Response(
            JSON.stringify({
              valid: false,
              error: testError instanceof Error ? testError.message : 'Connection test failed',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
    }
  } catch (error) {
    console.error('[user-ai-credentials] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});
