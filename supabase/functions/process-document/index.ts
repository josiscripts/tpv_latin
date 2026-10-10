import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.3';
import { Anthropic } from 'https://esm.sh/@anthropic-ai/sdk@0.27.3';

// Decryption function for user API keys
async function getEncryptionKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('ANTHROPIC_KEY_ENCRYPTION_SECRET');
  if (!secret) {
    throw new Error('ANTHROPIC_KEY_ENCRYPTION_SECRET not configured');
  }

  const keyBytes = new Uint8Array(
    secret.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
  );

  if (keyBytes.length !== 32) {
    throw new Error(`Invalid encryption key length: ${keyBytes.length * 8} bits`);
  }

  return await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
}

async function decryptAPIKey(encrypted: string): Promise<string> {
  if (!encrypted.startsWith('v1:')) {
    throw new Error('Invalid encryption format');
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

interface ProcessDocumentRequest {
  documentId: string;
  aiModelId?: string;
}

// Modelos permitidos (whitelist de servidor)
// Verificados contra documentación oficial de Anthropic (2025)
const ALLOWED_AI_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'] as const;
const DEFAULT_AI_MODEL = 'claude-haiku-5-5' as const;

// Mapeo para fallback de modelos antiguos (datos existentes de usuarios)
const MODEL_FALLBACK: Record<string, string> = {
  'claude-3-5-haiku-20241022': 'claude-haiku-5-5',
  'claude-3-5-sonnet-20241022': 'claude-sonnet-5-5',
  'claude-opus-4-1-20250805': 'claude-opus-5-5',
  'claude-haiku-4-5-20251001': 'claude-haiku-5-5',
  'claude-sonnet-5': 'claude-sonnet-5-5',
};

interface DocumentExtraction {
  document_type: 'invoice' | 'delivery_note' | 'unknown';
  confidence: {
    overall: number;
    supplier: number;
    invoice_number: number;
    invoice_date: number;
    lines: number;
  };
  extraction: {
    vendor: {
      name: string | null;
      tax_id: string | null;
      address: string | null;
    };
    invoice: {
      number: string | null;
      date: string | null;
      due_date: string | null;
    };
    totals: {
      subtotal: number | null;
      tax: number | null;
      tax_rate: number | null;
      total: number | null;
      currency: string;
    };
    lines: Array<{
      sku: string | null;
      ean: string | null;
      supplier_code: string | null;
      description: string;
      quantity: number;
      unit_price: number | null;
      discount_percent: number | null;
      discount_amount: number | null;
      tax_rate: number | null;
      line_subtotal: number | null;
      line_tax: number | null;
      line_total: number | null;
    }>;
  };
  warnings: string[];
  processing_time_ms: number;
}

// Extrae JSON válido de una respuesta que puede contener Markdown
function extractJsonFromResponse(responseText: string): any {
  const text = responseText.trim();

  // Caso 1: JSON válido sin Markdown
  if (text.startsWith('{')) {
    return JSON.parse(text);
  }

  // Caso 2: JSON dentro de un bloque ```json...```
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch && jsonMatch[1]) {
    const extracted = jsonMatch[1].trim();
    if (extracted.startsWith('{')) {
      return JSON.parse(extracted);
    }
  }

  // Caso 3: No se encontró JSON válido
  throw new Error('No valid JSON found in response (expected JSON or ```json...``` block)');
}

// Valida que el objeto parseado cumple el esquema DocumentExtraction
function validateExtraction(data: any): DocumentExtraction {
  if (!data || typeof data !== 'object') {
    throw new Error('Parsed JSON is not an object');
  }

  // Validar document_type
  if (!['invoice', 'delivery_note', 'unknown'].includes(data.document_type)) {
    throw new Error(`Invalid document_type: must be 'invoice', 'delivery_note', or 'unknown'`);
  }

  // Validar confidence
  if (!data.confidence || typeof data.confidence !== 'object') {
    throw new Error('Missing or invalid confidence object');
  }
  const requiredConfidenceFields = ['overall', 'supplier', 'invoice_number', 'invoice_date', 'lines'];
  for (const field of requiredConfidenceFields) {
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
  for (const field of ['name', 'tax_id', 'address']) {
    if (data.extraction.vendor[field] !== null && typeof data.extraction.vendor[field] !== 'string') {
      throw new Error(`extraction.vendor.${field} must be string or null`);
    }
  }

  // Validar invoice
  if (!data.extraction.invoice || typeof data.extraction.invoice !== 'object') {
    throw new Error('Missing or invalid extraction.invoice object');
  }
  for (const field of ['number', 'date', 'due_date']) {
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
  const numericTotalFields = ['subtotal', 'tax', 'tax_rate', 'total'];
  for (const field of numericTotalFields) {
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
  for (let i = 0; i < data.extraction.lines.length; i++) {
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
    const optionalStringFields = ['sku', 'ean', 'supplier_code'];
    for (const field of optionalStringFields) {
      if (line[field] !== null && typeof line[field] !== 'string') {
        throw new Error(`extraction.lines[${i}].${field} must be string or null`);
      }
    }
    const optionalNumericFields = ['unit_price', 'discount_percent', 'discount_amount', 'tax_rate', 'line_subtotal', 'line_tax', 'line_total'];
    for (const field of optionalNumericFields) {
      if (line[field] !== null && typeof line[field] !== 'number') {
        throw new Error(`extraction.lines[${i}].${field} must be number or null`);
      }
    }
  }

  // Validar warnings
  if (!Array.isArray(data.warnings)) {
    throw new Error('warnings must be an array');
  }
  for (const warn of data.warnings) {
    if (typeof warn !== 'string') {
      throw new Error('Each warning must be a string');
    }
  }

  // Validar processing_time_ms
  if (typeof data.processing_time_ms !== 'number') {
    throw new Error('processing_time_ms must be a number');
  }

  return data as DocumentExtraction;
}

// Convert ArrayBuffer to Base64 safely, processing in chunks to avoid stack overflow
// on Deno edge-runtime with limited resources
function arrayBufferToBase64Safe(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 8192; // Process 8KB at a time
  let binaryString = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
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

async function processDocument(req: Request): Promise<Response> {
  let documentId: string | undefined;

  let claimedSuccessfully = false; // Track if THIS request successfully claimed the document

  try {
    const startTime = Date.now();

    // 1. Parse request
    const body = (await req.json()) as ProcessDocumentRequest;
    documentId = body.documentId;
    let aiModelId = (body.aiModelId || DEFAULT_AI_MODEL) as string;

    if (!documentId) {
      return new Response(
        JSON.stringify({ error: 'documentId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Apply fallback for legacy model IDs
    if (aiModelId in MODEL_FALLBACK) {
      aiModelId = MODEL_FALLBACK[aiModelId];
    }

    // Validate AI model against whitelist
    if (!ALLOWED_AI_MODELS.includes(aiModelId as any)) {
      return new Response(
        JSON.stringify({ error: `Invalid AI model: ${aiModelId}. Allowed: ${ALLOWED_AI_MODELS.join(', ')}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Initialize Supabase client (with SERVICE_ROLE for admin access)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 3. Verify document exists and get metadata
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .is('deleted_at', null)
      .single();

    if (docError || !document) {
      return new Response(
        JSON.stringify({ error: 'Document not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3.5 Check if document already has a valid extraction (idempotence)
    const { data: existingExtractions, error: existingError } = await supabase
      .from('document_extractions')
      .select('*')
      .eq('document_id', documentId)
      .eq('processing_state', 'extracted')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!existingError && existingExtractions && existingExtractions.length > 0) {
      // Document already has a valid extraction, return it without reprocessing
      const existingExtraction = existingExtractions[0];
      return new Response(
        JSON.stringify({
          success: true,
          extraction_id: existingExtraction.id,
          document_id: documentId,
          status: 'already_processed',
          message: 'Document already has a valid extraction',
          confidence: existingExtraction.confidence_score,
          vendor_name: existingExtraction.vendor_name,
          invoice_number: existingExtraction.invoice_number,
          lines_count: existingExtraction.lines_extracted ?
            (Array.isArray(existingExtraction.lines_extracted) ?
              existingExtraction.lines_extracted.length : 0) : 0,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 4. Mark as processing (atomic: only if in uploadable state)
    // Prevent concurrent requests from processing the same document
    const { data: claimedDocument, error: claimError } = await supabase
      .from('documents')
      .update({
        processing_status: 'processing',
        processing_error: null,
      })
      .eq('id', documentId)
      .in('processing_status', ['uploaded', 'error'])  // Only from these states
      .select('id')
      .single();

    if (claimError || !claimedDocument) {
      // Document could not be claimed (another request has it, or in non-retryable state)
      console.log(`[B8:concurrency] Doc ${documentId}: Could not claim document. Status: ${document.processing_status}`);
      return new Response(
        JSON.stringify({
          error: `Document is already being processed or cannot be processed from current state (${document.processing_status})`,
          status: 'conflict',
          document_status: document.processing_status,
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Mark that THIS request successfully claimed the document
    claimedSuccessfully = true;
    console.log(`[B8:concurrency] Doc ${documentId}: Document claimed successfully by this request`);

    // 5. Download file from Storage (using signed URL)
    console.log(`[B8:storage] Doc ${documentId}: Creating signed URL for ${document.file_path}`);
    const { data: signedUrlData, error: signUrlError } = await supabase
      .storage
      .from('documents')
      .createSignedUrl(document.file_path, 3600);

    if (signUrlError) {
      throw new Error(`Failed to create signed URL for doc ${documentId}: ${signUrlError.message}`);
    }
    if (!signedUrlData) {
      throw new Error(`Failed to create signed URL for doc ${documentId}: no data returned`);
    }
    console.log(`[B8:storage] Doc ${documentId}: Signed URL created successfully (expires in 3600 seconds)`);

    // 6. Download file content
    console.log(`[B8:download] Doc ${documentId}: Fetching file from signed URL`);
    let fileResponse: Response;
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

    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await fileResponse.arrayBuffer();
    } catch (bufferError) {
      throw new Error(`Failed to read file buffer for doc ${documentId}: ${bufferError instanceof Error ? bufferError.message : String(bufferError)}`);
    }
    console.log(`[B8:buffer] Doc ${documentId}: ArrayBuffer size: ${arrayBuffer.byteLength} bytes`);

    let base64Data: string;
    try {
      console.log(`[B8:base64] Doc ${documentId}: Converting ${arrayBuffer.byteLength} bytes to Base64 (chunked method)...`);
      base64Data = arrayBufferToBase64Safe(arrayBuffer);
      console.log(`[B8:base64] Doc ${documentId}: Base64 conversion successful, result length: ${base64Data.length} characters`);
    } catch (conversionError) {
      throw new Error(`Failed to convert file to Base64 for doc ${documentId}: ${conversionError instanceof Error ? conversionError.message : String(conversionError)}`);
    }

    // Determine if it's a PDF or image
    const isPdf = contentType.includes('pdf');
    let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'application/pdf' = 'application/pdf';

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
            const { data: userCreds } = await supabase
              .from('user_ai_credentials')
              .select('api_key_encrypted, model_id')
              .eq('user_id', userId)
              .eq('provider', 'anthropic')
              .maybeSingle();

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
      apiKey: anthropicApiKey,
    });

    const extractionStartTime = Date.now();

    // Build content based on document type
    interface ContentBlock { type: string; source?: unknown; text?: string }
    const contentBlocks: ContentBlock[] = [];

    if (isPdf) {
      contentBlocks.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: base64Data,
        },
      } as unknown as ContentBlock);
    } else {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: base64Data,
        },
      } as unknown as ContentBlock);
    }

    contentBlocks.push({
      type: 'text',
      text: EXTRACTION_PROMPT,
    });

    const response = await anthropic.messages.create({
      model: aiModelId,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: contentBlocks as any,
        },
      ],
    });

    // 9. Parse IA response
    const responseText =
      response.content[0].type === 'text' ? response.content[0].text : '';

    let extractedData: DocumentExtraction;
    try {
      const parsed = extractJsonFromResponse(responseText);
      // Add server-calculated processing time before validation
      const enrichedParsed = {
        ...parsed,
        processing_time_ms: Date.now() - extractionStartTime,
      };
      extractedData = validateExtraction(enrichedParsed);
    } catch (parseError) {
      throw new Error(`Failed to parse IA response: ${parseError}`);
    }

    // 10. Determine next attempt number
    const { data: existingAttempts, error: attemptsError } = await supabase
      .from('document_extractions')
      .select('attempt_number')
      .eq('document_id', documentId)
      .order('attempt_number', { ascending: false })
      .limit(1);

    let nextAttemptNumber = 1;
    if (!attemptsError && existingAttempts && existingAttempts.length > 0) {
      nextAttemptNumber = (existingAttempts[0].attempt_number || 0) + 1;
    }

    // 11. Store extraction in database
    const { data: extraction, error: insertError } = await supabase
      .from('document_extractions')
      .insert({
        document_id: documentId,
        extraction_model: aiModelId,
        extracted_at: new Date().toISOString(),
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
        raw_text_extracted: null, // Could store OCR text if available
        raw_response: extractedData,
        confidence_score: extractedData.confidence.overall,
        confidence_supplier: extractedData.confidence.supplier,
        confidence_invoice: extractedData.confidence.invoice_number,
        confidence_lines: extractedData.confidence.lines,
        processing_state: 'extracted',
        attempt_number: nextAttemptNumber,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to store extraction: ${insertError.message}`);
    }

    // 12. Update document status to processed (verify still in processing to catch state changes)
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        processing_status: 'processed',
        processing_error: null,
        document_date: extractedData.extraction.invoice.date || null,
      })
      .eq('id', documentId)
      .eq('processing_status', 'processing');  // Only update if still in processing state (B.19)

    if (updateError) {
      throw new Error(`Failed to update document status: ${updateError.message}`);
    }

    const processingTimeMs = Date.now() - startTime;

    // 12. Return success response
    return new Response(
      JSON.stringify({
        success: true,
        extraction_id: extraction?.id,
        document_id: documentId,
        status: 'processed',
        confidence: extractedData.confidence.overall,
        processing_time_ms: processingTimeMs,
        vendor_name: extractedData.extraction.vendor.name,
        invoice_number: extractedData.extraction.invoice.number,
        lines_count: extractedData.extraction.lines.length,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    // Update document with error status ONLY if THIS request successfully claimed it
    // Prevents non-owner requests from changing the state of a document claimed by another request
    if (documentId && claimedSuccessfully) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      try {
        await supabase
          .from('documents')
          .update({
            processing_status: 'error',
            processing_error: error instanceof Error ? error.message : String(error),
          })
          .eq('id', documentId)
          .eq('processing_status', 'processing');  // Only update if still in processing (B.19)
        console.error(`[B8:error] Doc ${documentId}: Marked as error after processing failure`, error instanceof Error ? error.message : String(error));
      } catch {
        /* Silent fail on error update */
        console.error(`[B8:error] Doc ${documentId}: Failed to update error status`);
      }
    } else if (documentId && !claimedSuccessfully) {
      console.error(`[B8:error] Doc ${documentId}: Error occurred before successful claim (${error instanceof Error ? error.message : String(error)})`);
    }

    console.error('Error processing document:', error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        success: false,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// Handle POST requests
Deno.serve(processDocument);
