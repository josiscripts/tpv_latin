import mysql from 'mysql2/promise';
import crypto from 'crypto';

function detectImageFormat(buffer: Buffer): { format: string; mime: string } {
  const magicBytes = buffer.slice(0, 12);
  const hex = magicBytes.toString('hex').toUpperCase();

  if (hex.startsWith('FFD8FF')) return { format: 'jpg', mime: 'image/jpeg' };
  if (hex.startsWith('89504E47')) return { format: 'png', mime: 'image/png' };
  if (hex.startsWith('424D')) return { format: 'bmp', mime: 'image/bmp' };
  if (hex.includes('WEBP')) return { format: 'webp', mime: 'image/webp' };
  return { format: 'jpg', mime: 'image/jpeg' };
}

function calculateHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export async function syncProductImages(
  productMap: Map<string, string>,
  conn: any,
  supabase: any
): Promise<any> {
  const results: any = { synced: 0, skipped: 0, errors: [] };

  const [productsToSync] = await conn.query(`
    SELECT id_complementog, COALESCE(GROUP_CONCAT(imagen), '') as imagen_hex
    FROM complementogimg
    WHERE id_complementog IN (${Array.from(productMap.keys()).map(id => `'${id}'`).join(',')})
    GROUP BY id_complementog
  `);

  for (const { id_complementog, imagen_hex } of productsToSync) {
    try {
      const productId = productMap.get(id_complementog);
      if (!productId) continue;

      const [imageData] = await conn.query(
        'SELECT imagen FROM complementogimg WHERE id_complementog = ?',
        [id_complementog]
      );

      if (!imageData || imageData.length === 0 || !imageData[0].imagen) {
        results.skipped++;
        continue;
      }

      const buffer = imageData[0].imagen;
      const { format, mime } = detectImageFormat(buffer);
      const newHash = calculateHash(buffer);
      const storagePath = `products/${productId}/main-${newHash}.${format}`;

      const { data: existingProduct } = await supabase
        .from('products')
        .select('image')
        .eq('id', productId)
        .single();

      // Extract hash from existing path to detect content changes
      const existingPath = existingProduct?.image;
      const hashMatch = existingPath?.match(/main-([a-f0-9]{64})/);
      const previousHash = hashMatch ? hashMatch[1] : null;

      // Skip if hash hasn't changed
      if (previousHash === newHash) {
        results.skipped++;
        continue;
      }

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(storagePath, buffer, {
          contentType: mime,
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('products')
        .update({ image: storagePath })
        .eq('id', productId);

      if (updateError) throw updateError;

      results.synced++;
    } catch (error) {
      results.errors.push(`${id_complementog}: ${(error as Error).message}`);
    }
  }

  return results;
}
