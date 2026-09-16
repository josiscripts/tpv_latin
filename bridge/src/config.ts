import dotenv from 'dotenv';
import { getDecryptedPassword } from './sysenc1-decrypt';

dotenv.config({ path: '.env.bridge' });
dotenv.config();

export const config = {
  sysme: {
    host: process.env.SYSME_HOST || '127.0.0.1',
    port: parseInt(process.env.SYSME_PORT || '4306'),
    database: process.env.SYSME_DATABASE || 'sysmehotel',
    user: process.env.SYSME_USER || 'root',
    password: getDecryptedPassword(process.env.SYSME_PASSWORD),
  },
  supabase: {
    url: process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
  },
  bridge: {
    pollingIntervalMs: parseInt(process.env.POLLING_INTERVAL_MS || '5000'),
    batchSize: parseInt(process.env.BATCH_SIZE || '10'),
    maxRetries: parseInt(process.env.MAX_RETRIES || '5'),
    logLevel: process.env.LOG_LEVEL || 'info',
  },
};

export function validateConfig(): string[] {
  const errors: string[] = [];

  if (!config.supabase.serviceKey) {
    errors.push('SUPABASE_SERVICE_KEY is required');
  }

  if (!config.sysme.password) {
    errors.push('SYSME_PASSWORD is required (read from C:\\SYSME\\SGC\\sysmetpv.ini or set SYSME_PASSWORD env var)');
  }

  return errors;
}
