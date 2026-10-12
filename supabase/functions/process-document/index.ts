import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.3';
import { Anthropic } from 'https://esm.sh/@anthropic-ai/sdk@0.27.3';
// Decryption function for user API keys
async function getEncryptionKey() {
  const secret = Deno.env.get('ANTHROPIC_KEY_ENCRYPTION_SECRET');
  if (!secret) {
    throw new Error('ANTHROPIC_KEY_ENCRYPTION_SECRET not configured');
  }
  const keyBytes = new Uint8Array(secret.match(/.{1,2}/g)?.map((byte)=>parseInt(byte, 16)) || []);
  if (keyBytes.length !== 32) {
    throw new Error(`Invalid encryption key length: ${keyBytes.length * 8} bits`);
  }
  return await crypto.subtle.importKey('raw', keyBytes, {
    name: 'AES-GCM'
  }, false, [
    'decrypt'
  ]);
}
async function decryptAPIKey(encrypted) {
  if (!encrypted.startsWith('v1:')) {
    throw new Error('Invalid encryption format');
  }
  const key = await getEncryptionKey();
  const combined = new Uint8Array(atob(encrypted.substring(3)).split('').map((c)=>c.charCodeAt(0)));
  if (combined.length < 13) {
    throw new Error('Encrypted data too short');
  }
  const iv = combined.slice(1, 13);
  const ciphertext = combined.slice(13);
  const plaintext = await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv
  }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
// Modelos permitidos (whitelist de servidor)
// Verificados contra documentación oficial de Anthropic (2025)
const ALLOWED_AI_MODELS = [
  'claude-haiku-5-5',
  'claude-sonnet-5-5',
  'claude-opus-5-5'
];
const DEFAULT_AI_MODEL = 'claude-haiku-5-5';
// Presupuesto de salida. Si el modelo consume parte en razonamiento, el JSON se trunca: se detecta abajo.
const MAX_OUTPUT_TOKENS = 8192;
const ACCEPTED_STOP_REASONS = ['end_turn', 'stop_sequence'];
// Mapeo para fallback de modelos antiguos (datos existentes de usuarios)
const MODEL_FALLBACK = {
  'claude-3-5-haiku-20241022': 'claude-haiku-5-5',
  'claude-3-5-sonnet-20241022': 'claude-sonnet-5-5',
  'claude-opus-4-1-20250805': 'claude-opus-5-5',
  'claude-haiku-4-5-20251001': 'claude-haiku-5-5',
  'claude-sonnet-5': 'claude-sonnet-5-5'
};
// Extrae JSON válido de una respuesta que puede contener Markdown (Robusto)
function extractJsonFromResponse(responseText) {
  const text = responseText.trim();
  const attempts = [];
  // Caso 1: JSON válido sin Markdown (más común)
  try {
    if (text.startsWith('{')) {
      const parsed = JSON.parse(text);
      return parsed;
    }
  } catch (e) {
    attempts.push(`Direct parse: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
  // Caso 2: JSON dentro de un bloque ```json...``` o ````
  try {
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch && jsonMatch[1]) {
      const extracted = jsonMatch[1].trim();
      if (extracted.startsWith('{')) {
        const parsed = JSON.parse(extracted);
        return parsed;
      }
    }
  } catch (e) {
    attempts.push(`Markdown parse: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
  // Caso 3: Buscar primer { y último } como fallback
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      const jsonStr = text.substring(start, end + 1);
      const parsed = JSON.parse(jsonStr);
      return parsed;
    }
  } catch (e) {
    attempts.push(`Bracket extraction: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
  // Caso 4: No se encontró JSON válido
  const preview = text.length > 200 ? text.substring(0, 200) + '...' : text;
  throw new Error(`No valid JSON found in response. Response length: ${text.length}. ` + `Attempts: [${attempts.join('; ')}]. Response: ${preview}`);
}
// Valida que el objeto parseado cumple el esquema DocumentExtraction
function validateExtraction(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Parsed JSON is not an object');
  }
  // Validar document_type
  if (![
    'invoice',
    'delivery_note',
    'unknown'
  ].includes(data.document_type)) {
    throw new Error(`Invalid document_type: must be 'invoice', 'delivery_note', or 'unknown'`);
  }
  // Validar confidence
  if (!data.confidence || typeof data.confidence !== 'object') {
    throw new Error('Missing or invalid confidence object');
  }
  const requiredConfidenceFields = [
    'overall',
    'supplier',
    'invoice_number',
    'invoice_date',
    'lines'
  ];
  for (const field of requiredConfidenceFields){
    if (typeof data.confidence[field] !== 'number' || data.confidence[field] < 0 || data.confidence[field] > 1) {
      throw new Error(`confidence.${field} must be a number between 0 and 1`);
    }
  }
  // Validar extraction
  if (!data.extraction || typeof data.extraction !== 'object') {
    throw new Error('Missing or invalid extraction object');
  }
  // Validar vendor
  if (!data.extraction.vendor || typeof data.extraction.vendor !== 'object') {
    throw new Error('Missing or invalid extraction.vendor object');
  }
  for (const field of [
    'name',
    'tax_id',
    'address'
  ]){
    if (data.extraction.vendor[field] !== null && typeof data.extraction.vendor[field] !== 'string') {
      throw new Error(`extraction.vendor.${field} must be string or null`);
    }
  }
  // Validar invoice
  if (!data.extraction.invoice || typeof data.extraction.invoice !== 'object') {
    throw new Error('Missing or invalid extraction.invoice object');
  }
  for (const field of [
    'number',
    'date',
    'due_date'
  ]){
    if (data.extraction.invoice[field] !== null && typeof data.extraction.invoice[field] !== 'string') {
      throw new Error(`extraction.invoice.${field} must be string or null`);
    }
    if (field !== 'number' && data.extraction.invoice[field] !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.extraction.invoice[field])) {
        throw new Error(`extraction.invoice.${field} must be in YYYY-MM-DD format or null`);
      }
    }
  }
  // Validar totals
  if (!data.extraction.totals || typeof data.extraction.totals !== 'object') {
    throw new Error('Missing or invalid extraction.totals object');
  }
  const numericTotalFields = [
    'subtotal',
    'tax',
    'tax_rate',
    'total'
  ];
  for (const field of numericTotalFields){
    if (data.extraction.totals[field] !== null && typeof data.extraction.totals[field] !== 'number') {
      throw new Error(`extraction.totals.${field} must be number or null`);
    }
  }
  if (typeof data.extraction.totals.currency !== 'string') {
    throw new Error('extraction.totals.currency must be a string');
  }
  // Validar lines
  if (!Array.isArray(data.extraction.lines)) {
    throw new Error('extraction.lines must be an array');
  }
  for(let i = 0; i < data.extraction.lines.length; i++){
    const line = data.extraction.lines[i];
    if (typeof line !== 'object' || line === null) {
      throw new Error(`extraction.lines[${i}] is not an object`);
    }
    if (typeof line.description !== 'string') {
      throw new Error(`extraction.lines[${i}].description must be a string`);
    }
    if (typeof line.quantity !== 'number') {
      throw new Error(`extraction.lines[${i}].quantity must be a number (required)`);
    }
    const optionalStringFields = [
      'sku',
      'ean',
      'supplier_code'
    ];
    for (const field of optionalStringFields){
      if (line[field] !== null && typeof line[field] !== 'string') {
        throw new Error(`extraction.lines[${i}].${field} must be string or null`);
      }
    }
    const optionalNumericFields = [
      'unit_price',
      'discount_percent',
      'discount_amount',
      'tax_rate',
      'line_subtotal',
      'line_tax',
      'line_total'
    ];
    for (const field of optionalNumericFields){
      if (line[field] !== null && typeof line[field] !== 'number') {
        throw new Error(`extraction.lines[${i}].${field} must be number or null`);
      }
    }
  }
  // Validar warnings
  if (!Array.isArray(data.warnings)) {
    throw new Error('warnings must be an array');
  }
  for (const warn of data.warnings){
    if (typeof warn !== 'string') {
      throw new Error('Each warning must be a string');
    }
  }
  // Validar processing_time_ms
  if (typeof data.processing_time_ms !== 'number') {
    throw new Error('processing_time_ms must be a number');
  }
  return data;
}
// Convert ArrayBuffer to Base64 safely, processing in chunks to avoid stack overflow
// on Deno edge-runtime with limited resources
function arrayBufferToBase64Safe(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 8192; // Process 8KB at a time
  let binaryString = '';
  for(let i = 0; i < bytes.length; i += chunkSize){
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    // Only use spread on small chunks, not the entire array
    binaryString += String.fromCharCode(...chunk);
  }
  return btoa(binaryString);
}
const EXTRACTION_PROMPT = `You are a document processing assistant specialized in extracting structured data from invoices and delivery notes.

Your task: Extract ALL available information from the provided document image/PDF.

CRITICAL RULES:
1. If a field is not present in the document, return null, NOT an invented value
2. Do NOT make assumptions or fill in missing data
3. Be honest about confidence levels
4. Extract numbers exactly as they appear (no rounding or corrections)
5. Dates should be in YYYY-MM-DD format, or null if not found

DOCUMENT CLASSIFICATION:
First, classify the document as:
- "invoice" (has invoice number, date, prices, VAT, totals)
- "delivery_note" (shipping document, may lack prices)
- "unknown" (unclear document type)

EXTRACTION TARGET:

VENDOR INFORMATION:
- vendor.name: Business name
- vendor.tax_id: NIF/CIF/VAT ID
- vendor.address: Full address

INVOICE INFORMATION (if invoice):
- invoice.number: Invoice/document number
- invoice.date: Invoice date
- invoice.due_date: Payment due date (if present)

TOTALS:
- totals.subtotal: Subtotal (excluding VAT)
- totals.tax: Total VAT/tax amount
- totals.tax_rate: VAT percentage rate (e.g., 21 for 21%)
- totals.total: Final total (subtotal + tax)
- totals.currency: ISO code (EUR, USD, etc)

LINE ITEMS:
For each line, extract:
- sku: Internal SKU/code
- ean: EAN/barcode
- supplier_code: Supplier's product code
- description: Product/service description
- quantity: Units/quantity
- unit_price: Price per unit
- discount_percent: Discount percentage (if any)
- discount_amount: Discount amount in €/currency
- tax_rate: VAT % for this line
- line_subtotal: Line total before VAT (qty * unit_price)
- line_tax: VAT amount for this line
- line_total: Final line total (with VAT)

CONFIDENCE SCORING:
Assign 0.0-1.0 confidence for:
- overall: Overall extraction quality
- supplier: Confidence in vendor name and tax ID
- invoice_number: Confidence in invoice number
- invoice_date: Confidence in invoice date
- lines: Confidence in line items

RESPONSE FORMAT:
Return ONLY valid JSON, no markdown or extra text:

{
  "document_type": "invoice" | "delivery_note" | "unknown",
  "confidence": {
    "overall": 0.0-1.0,
    "supplier": 0.0-1.0,
    "invoice_number": 0.0-1.0,
    "invoice_date": 0.0-1.0,
    "lines": 0.0-1.0
  },
  "extraction": {
    "vendor": {
      "name": "string or null",
      "tax_id": "string or null",
      "address": "string or null"
    },
    "invoice": {
      "number": "string or null",
      "date": "YYYY-MM-DD or null",
      "due_date": "YYYY-MM-DD or null"
    },
    "totals": {
      "subtotal": number or null,
      "tax": number or null,
      "tax_rate": number or null,
      "total": number or null,
      "currency": "EUR"
    },
    "lines": [
      {
        "sku": "string or null",
        "ean": "string or null",
        "supplier_code": "string or null",
        "description": "string (never null)",
        "quantity": number,
        "unit_price": number or null,
        "discount_percent": number or null,
        "discount_amount": number or null,
        "tax_rate": number or null,
        "line_subtotal": number or null,
        "line_tax": number or null,
        "line_total": number or null
      }
    ]
  },
  "warnings": ["warning1", "warning2"]
}`;
async function processDocument(req) {
  let documentId;
  let processingLeaseToken = null; // Persistent ownership token
  let claimedSuccessfully = false; // Track if THIS request successfully claimed the document
  try {
    const startTime = Date.now();
    // 1. Parse request
    const body = await req.json();
    documentId = body.documentId;
    let aiModelId = body.aiModelId || DEFAULT_AI_MODEL;
    if (!documentId) {
      return new Response(JSON.stringify({
        error: 'documentId is required'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    // Apply fallback for legacy model IDs
    if (aiModelId in MODEL_FALLBACK) {
      aiModelId = MODEL_FALLBACK[aiModelId];
    }
    // Validate AI model against whitelist
    if (!ALLOWED_AI_MODELS.includes(aiModelId)) {
      return new Response(JSON.stringify({
        error: `Invalid AI model: ${aiModelId}. Allowed: ${ALLOWED_AI_MODELS.join(', ')}`
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    // 2. Initialize Supabase client (with SERVICE_ROLE for admin access)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    // 3. Verify document exists and get metadata
    const { data: document, error: docError } = await supabase.from('documents').select('*').eq('id', documentId).is('deleted_at', null).single();
    if (docError || !document) {
      return new Response(JSON.stringify({
        error: 'Document not found'
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    // 3.5 Check if document already has a valid extraction (idempotence)
    const { data: existingExtractions, error: existingError } = await supabase.from('document_extractions').select('*').eq('document_id', documentId).eq('processing_state', 'extracted').order('created_at', {
      ascending: false
    }).limit(1);
    if (!existingError && existingExtractions && existingExtractions.length > 0) {
      // Document already has a valid extraction, return it without reprocessing
      const existingExtraction = existingExtractions[0];
      return new Response(JSON.stringify({
        success: true,
        extraction_id: existingExtraction.id,
        document_id: documentId,
        status: 'already_processed',
        message: 'Document already has a valid extraction',
        confidence: existingExtraction.confidence_score,
        vendor_name: existingExtraction.vendor_name,
        invoice_number: existingExtraction.invoice_number,
        lines_count: existingExtraction.lines_extracted ? Array.isArray(existingExtraction.lines_extracted) ? existingExtraction.lines_extracted.length : 0 : 0
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    // 4. Claim document with persistent lease token
    // RPC ensures only one worker owns this document at any time
    const { data: leaseToken, error: claimError } = await supabase.rpc('claim_document_for_processing', {
      p_document_id: documentId,
      p_lease_duration: '5 minutes'
    });
    if (claimError || !leaseToken) {
      // Document could not be claimed (another worker has it, or in non-retryable state)
      console.log(`[B8:concurrency] Doc ${documentId}: Could not claim document (409)`);
      return new Response(JSON.stringify({
        error: 'Document is already being processed or in non-retryable state',
        status: 'conflict'
      }), {
        status: 409,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    // Store lease token for this processing attempt (persistent ownership)
    processingLeaseToken = leaseToken;
    claimedSuccessfully = true;
    console.log(`[B8:concurrency] Doc ${documentId}: Claimed with token ${processingLeaseToken} (expires in 5 minutes)`);
    // 5. Download file from Storage (using signed URL)
    console.log(`[B8:storage] Doc ${documentId}: Creating signed URL for ${document.file_path}`);
    const { data: signedUrlData, error: signUrlError } = await supabase.storage.from('documents').createSignedUrl(document.file_path, 3600);
    if (signUrlError) {
      throw new Error(`Failed to create signed URL for doc ${documentId}: ${signUrlError.message}`);
    }
    if (!signedUrlData) {
      throw new Error(`Failed to create signed URL for doc ${documentId}: no data returned`);
    }
    console.log(`[B8:storage] Doc ${documentId}: Signed URL created successfully (expires in 3600 seconds)`);
    // 6. Download file content
    console.log(`[B8:download] Doc ${documentId}: Fetching file from signed URL`);
    let fileResponse;
    try {
      fileResponse = await fetch(signedUrlData.signedUrl);
    } catch (fetchError) {
      throw new Error(`Failed to fetch file for doc ${documentId}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
    }
    if (!fileResponse.ok) {
      throw new Error(`Failed to download file for doc ${documentId}: HTTP ${fileResponse.status} ${fileResponse.statusText}`);
    }
    console.log(`[B8:download] Doc ${documentId}: File downloaded successfully, status ${fileResponse.status}`);
    // 7. Determine MIME type and convert to base64
    const contentType = fileResponse.headers.get('content-type') || 'application/octet-stream';
    const contentLength = fileResponse.headers.get('content-length');
    console.log(`[B8:contenttype] Doc ${documentId}: MIME type: ${contentType}, Content-Length: ${contentLength}`);
    let arrayBuffer;
    try {
      arrayBuffer = await fileResponse.arrayBuffer();
    } catch (bufferError) {
      throw new Error(`Failed to read file buffer for doc ${documentId}: ${bufferError instanceof Error ? bufferError.message : String(bufferError)}`);
    }
    console.log(`[B8:buffer] Doc ${documentId}: ArrayBuffer size: ${arrayBuffer.byteLength} bytes`);
    let base64Data;
    try {
      console.log(`[B8:base64] Doc ${documentId}: Converting ${arrayBuffer.byteLength} bytes to Base64 (chunked method)...`);
      base64Data = arrayBufferToBase64Safe(arrayBuffer);
      console.log(`[B8:base64] Doc ${documentId}: Base64 conversion successful, result length: ${base64Data.length} characters`);
    } catch (conversionError) {
      throw new Error(`Failed to convert file to Base64 for doc ${documentId}: ${conversionError instanceof Error ? conversionError.message : String(conversionError)}`);
    }
    // Determine if it's a PDF or image
    const isPdf = contentType.includes('pdf');
    let mediaType = 'application/pdf';
    if (!isPdf) {
      if (contentType.includes('jpeg') || contentType.includes('jpg')) {
        mediaType = 'image/jpeg';
      } else if (contentType.includes('png')) {
        mediaType = 'image/png';
      } else if (contentType.includes('gif')) {
        mediaType = 'image/gif';
      } else if (contentType.includes('webp')) {
        mediaType = 'image/webp';
      }
    }
    // 8. Get user's API key if configured, fallback to server key
    let anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    // Try to get user credentials from request context
    // The user_id should be available from the JWT in the Authorization header
    try {
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        // Decode JWT to get user_id (without verification, since it's already verified by Supabase)
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          const userId = payload.sub;
          if (userId) {
            // Query user's AI credentials
            const { data: userCreds } = await supabase.from('user_ai_credentials').select('api_key_encrypted, model_id').eq('user_id', userId).eq('provider', 'anthropic').maybeSingle();
            if (userCreds && userCreds.api_key_encrypted) {
              try {
                anthropicApiKey = await decryptAPIKey(userCreds.api_key_encrypted);
                // Use user's model if they have a preference
                if (userCreds.model_id) {
                  aiModelId = userCreds.model_id;
                }
                console.log(`[process-document] Using user's API key and model: ${aiModelId}`);
              } catch (decryptError) {
                console.error('[process-document] Failed to decrypt user API key:', decryptError instanceof Error ? decryptError.message : String(decryptError));
              // Fall back to server key
              }
            }
          }
        }
      }
    } catch (userKeyError) {
      console.error('[process-document] Error retrieving user API key:', userKeyError);
    // Fall back to server key
    }
    // 8. Call Anthropic Claude Vision with appropriate API key
    const anthropic = new Anthropic({
      apiKey: anthropicApiKey
    });
    const extractionStartTime = Date.now();
    const contentBlocks = [];
    if (isPdf) {
      contentBlocks.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: base64Data
        }
      });
    } else {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: base64Data
        }
      });
    }
    contentBlocks.push({
      type: 'text',
      text: EXTRACTION_PROMPT
    });
    const response = await anthropic.messages.create({
      model: aiModelId,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        {
          role: 'user',
          content: contentBlocks
        }
      ]
    });
    // 9. Parse IA response with validation (handle thinking blocks)
    console.log(`[process-document] stop_reason=${response.stop_reason} output_tokens=${response.usage?.output_tokens ?? 'n/d'} max=${MAX_OUTPUT_TOKENS}`);
    if (response.stop_reason === 'max_tokens') {
      throw new Error(`IA truncada por max_tokens (${MAX_OUTPUT_TOKENS}): respuesta incompleta, no se acepta`);
    }
    if (!ACCEPTED_STOP_REASONS.includes(response.stop_reason)) {
      throw new Error(`IA terminó con stop_reason no esperado: ${response.stop_reason}`);
    }
    if (!response.content || response.content.length === 0) {
      throw new Error('Claude returned empty response (no content blocks)');
    }
    // Handle Claude's extended thinking: find the text block (skip thinking blocks)
    const textBlock = response.content.find((c)=>c.type === 'text');
    if (!textBlock) {
      const contentTypes = response.content.map((c)=>c.type).join(', ');
      throw new Error(`Claude returned no text block. Content types: ${contentTypes}. stop_reason=${response.stop_reason}. ` + `Response structure: ${JSON.stringify(response.content.map((c)=>({
          type: c.type
        })))}`);
    }
    const responseText = textBlock.text || '';
    if (!responseText || responseText.trim().length === 0) {
      throw new Error(`Claude returned empty text block. max_tokens=${MAX_OUTPUT_TOKENS}. ` + `Response stop_reason: ${response.stop_reason}`);
    }
    let extractedData;
    try {
      const parsed = extractJsonFromResponse(responseText);
      // Add server-calculated processing time before validation
      const enrichedParsed = {
        ...parsed,
        processing_time_ms: Date.now() - extractionStartTime
      };
      extractedData = validateExtraction(enrichedParsed);
    } catch (parseError) {
      throw new Error(`Failed to parse IA response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }
    // 10. Persist extraction with ownership validation (RPC ensures lease is valid)
    const { data: extractionId, error: persistError } = await supabase.rpc('persist_extraction_with_ownership', {
      p_document_id: documentId,
      p_lease_token: processingLeaseToken,
      p_extraction_data: {
        document_type_detected: extractedData.document_type,
        vendor_name: extractedData.extraction.vendor.name,
        vendor_tax_id: extractedData.extraction.vendor.tax_id,
        vendor_address: extractedData.extraction.vendor.address,
        invoice_number: extractedData.extraction.invoice.number,
        invoice_date: extractedData.extraction.invoice.date,
        due_date: extractedData.extraction.invoice.due_date,
        currency: extractedData.extraction.totals.currency,
        subtotal: extractedData.extraction.totals.subtotal,
        tax_total: extractedData.extraction.totals.tax,
        tax_rate: extractedData.extraction.totals.tax_rate,
        total: extractedData.extraction.totals.total,
        lines_extracted: extractedData.extraction.lines,
        raw_text_extracted: null,
        raw_response: extractedData,
        confidence_score: extractedData.confidence.overall,
        extracted_at: new Date().toISOString(),
        extraction_model: aiModelId
      },
      p_extraction_model: aiModelId
    });
    if (persistError || !extractionId) {
      throw new Error(`Failed to persist extraction with ownership check: ${persistError?.message || 'Unknown error'}`);
    }
    console.log(`[B8:extraction] Doc ${documentId}: Extraction persisted with ID ${extractionId} under lease ownership`);
    // 11. Finalize document as processed (RPC validates lease ownership)
    const { data: finalizeSuccess, error: finalizeError } = await supabase.rpc('finalize_document_as_processed', {
      p_document_id: documentId,
      p_lease_token: processingLeaseToken,
      p_document_date: extractedData.extraction.invoice.date || null
    });
    if (finalizeError || !finalizeSuccess) {
      throw new Error(`Failed to finalize document: lost lease ownership or DB error`);
    }
    console.log(`[B8:finalize] Doc ${documentId}: Finalized as processed under valid lease`);
    const processingTimeMs = Date.now() - startTime;
    // 12. Return success response
    return new Response(JSON.stringify({
      success: true,
      extraction_id: extractionId,
      document_id: documentId,
      status: 'processed',
      confidence: extractedData.confidence.overall,
      processing_time_ms: processingTimeMs,
      vendor_name: extractedData.extraction.vendor.name,
      invoice_number: extractedData.extraction.invoice.number,
      lines_count: extractedData.extraction.lines.length
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    // Update document with error status ONLY if THIS request successfully claimed it
    // Prevents non-owner requests from changing the state of a document claimed by another request
    if (documentId && claimedSuccessfully) {
      const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
      try {
        const { data: errorSuccess, error: errorUpdateError } = await supabase.rpc('mark_document_as_error', {
          p_document_id: documentId,
          p_lease_token: processingLeaseToken,
          p_error_message: error instanceof Error ? error.message : String(error)
        });
        if (errorUpdateError || !errorSuccess) {
          console.error(`[B8:error] Doc ${documentId}: Lost lease ownership before marking error`);
        } else {
          console.error(`[B8:error] Doc ${documentId}: Marked as error under valid lease`);
        }
      } catch (errorRpcError) {
        /* Silent fail on error update */ console.error(`[B8:error] Doc ${documentId}: Failed to mark document as error`, errorRpcError instanceof Error ? errorRpcError.message : String(errorRpcError));
      }
    } else if (documentId && !claimedSuccessfully) {
      console.error(`[B8:error] Doc ${documentId}: Error occurred before successful claim (${error instanceof Error ? error.message : String(error)})`);
    }
    console.error('Error processing document:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      success: false
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}
// CORS: el navegador exige cabeceras en el preflight y en todas las respuestas
const CORS_ALLOWED_ORIGINS = ['https://lymarket.es', 'https://www.lymarket.es', 'http://localhost:5173', 'http://localhost:3000'];
function corsHeadersFor(origin) {
  return {
    'Access-Control-Allow-Origin': CORS_ALLOWED_ORIGINS.includes(origin || '') ? origin : 'https://lymarket.es',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}
async function processDocumentWithCors(req) {
  const cors = corsHeadersFor(req.headers.get('origin'));
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed', success: false }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
  const res = await processDocument(req);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
// Handle POST requests and CORS preflight
Deno.serve(processDocumentWithCors);
