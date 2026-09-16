import XTEA from 'xtea';

const SYSENC_PREFIX = 'SYSENC1:';

// Default Sysme XTEA key (commonly used in legacy Sysme installations)
// Can be overridden by SYSME_XTEA_KEY environment variable
function getSysmeKey(): Buffer {
  const envKey = process.env.SYSME_XTEA_KEY;
  if (envKey) {
    if (envKey.length >= 16) {
      return Buffer.from(envKey.substring(0, 16), 'utf-8');
    } else {
      const key = Buffer.alloc(16);
      Buffer.from(envKey, 'utf-8').copy(key);
      return key;
    }
  }
  // Default key commonly used in Sysme installations
  return Buffer.from('SYSMEKEY12345678', 'utf-8');
}

function decryptSYSENC1(encryptedData: string, key: Buffer): string {
  if (!encryptedData.startsWith(SYSENC_PREFIX)) {
    return encryptedData;
  }

  try {
    const hexData = encryptedData.substring(SYSENC_PREFIX.length);
    const encrypted = Buffer.from(hexData, 'hex');

    if (encrypted.length === 0 || encrypted.length % 8 !== 0) {
      console.error('[SYSENC1] Invalid encrypted data format');
      return encryptedData;
    }

    const xtea = new XTEA(key);
    const decrypted = Buffer.alloc(encrypted.length);

    // Decrypt in 8-byte blocks (XTEA block size)
    for (let i = 0; i < encrypted.length; i += 8) {
      const block = encrypted.slice(i, i + 8);
      const decryptedBlock = xtea.decipher(block);
      decryptedBlock.copy(decrypted, i);
    }

    // Remove PKCS7 padding
    const lastByte = decrypted[decrypted.length - 1];
    if (lastByte > 0 && lastByte <= 8) {
      return decrypted.slice(0, decrypted.length - lastByte).toString('utf-8');
    }

    return decrypted.toString('utf-8').trim();
  } catch (error) {
    console.error('[SYSENC1] Decryption failed:', (error as Error).message);
    return encryptedData;
  }
}

export function getDecryptedPassword(password: string | undefined): string {
  if (!password) {
    return '';
  }

  if (password.startsWith(SYSENC_PREFIX)) {
    const key = getSysmeKey();
    return decryptSYSENC1(password, key);
  }

  return password;
}
