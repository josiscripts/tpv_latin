# SYSENC1 Password Decryption Support

## Overview

The Bridge now supports encrypted passwords in the SYSENC1 format, commonly used by Sysme TPV systems. This allows the Bridge to work with Sysme installations that encrypt their database passwords.

## Format

SYSENC1 encrypted passwords follow this format:
```
SYSENC1:<hexadecimal_encrypted_data>
```

Example:
```
SYSENC1:a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

## How It Works

1. **Detection**: The Bridge automatically detects if `SYSME_PASSWORD` starts with `SYSENC1:`
2. **Decryption**: If detected, it uses XTEA (Extended Tiny Encryption Algorithm) with a standard Sysme key to decrypt
3. **Fallback**: If not encrypted, the password is used as plaintext

## Configuration

### Default Behavior
By default, the Bridge uses the standard Sysme XTEA key:
```
SYSMEKEY12345678
```

### Custom Key (if needed)
If your Sysme installation uses a different encryption key, set the `SYSME_XTEA_KEY` environment variable:

```bash
# In .env.bridge
SYSME_XTEA_KEY=YourCustomKey123
SYSME_PASSWORD=SYSENC1:abcd1234efgh5678...
```

## Files Modified

### 1. `src/sysenc1-decrypt.ts` (NEW)
Module that handles SYSENC1 decryption with XTEA algorithm.

**Functions**:
- `getDecryptedPassword(password)`: Main function that detects and decrypts SYSENC1 passwords
- `decryptSYSENC1(encryptedData, key)`: Internal decryption logic
- `getSysmeKey()`: Returns the XTEA key (default or from env)

### 2. `src/config.ts` (MODIFIED)
Updated to import and use the decryption module:
```typescript
import { getDecryptedPassword } from './sysenc1-decrypt';

// Now automatically decrypts SYSENC1 passwords
password: getDecryptedPassword(process.env.SYSME_PASSWORD),
```

### 3. `xtea.d.ts` (NEW)
Type definitions for the XTEA library to satisfy TypeScript strict mode.

## Testing

### Test Plaintext Password (Current)
The current `.env.bridge` contains a plaintext password, which works unchanged:
```
SYSME_PASSWORD=infusorio
```

### Test Encrypted Password
To test with an SYSENC1 encrypted password:

1. Update `.env.bridge`:
```
SYSME_PASSWORD=SYSENC1:<your_encrypted_password>
```

2. Rebuild and run:
```bash
npm run build
npm start
```

3. Expected output:
```
[BRIDGE] ✓ Sysme MySQL: OK
[BRIDGE] ✓ Supabase: OK
```

If you see "Access denied for user 'root'@'localhost'", the decryption may have failed. Check:
- The encrypted data format is correct (valid hex)
- The XTEA key is correct
- The encrypted data is not corrupted

## Security Notes

⚠️ **Important**:
- The decrypted password is NEVER logged or written to files
- The password is only used internally for MySQL connection
- All connections use standard MySQL2 library (no custom password handling)
- Do NOT modify `.env.bridge` after decryption occurs

## Backwards Compatibility

✅ **Fully compatible** with:
- Plaintext passwords (no "SYSENC1:" prefix)
- Empty or missing passwords
- All existing Bridge functionality

No changes required if you're currently using plaintext passwords.

## Troubleshooting

### "Access denied for user 'root'@'localhost'"
1. Check if password starts with `SYSENC1:`
2. Verify the hex data is valid (no special characters except 0-9, a-f)
3. Try the same password manually with mysql client
4. If using custom key, verify `SYSME_XTEA_KEY` is correct

### Decryption fails silently
- Check logs for "[SYSENC1] Decryption failed"
- Verify the encrypted data length is a multiple of 8 bytes
- Confirm the hex string is valid

### MySQL still won't connect
- The plaintext password may be incorrect even if decryption succeeds
- Verify the decrypted password with: `mysql -h 127.0.0.1 -P 4306 -u root -p`
- Check MySQL is running: `mysql.server status` or check via Services

## Implementation Details

### Algorithm: XTEA (Extended Tiny Encryption Algorithm)
- Block size: 8 bytes
- Key size: 16 bytes (128 bits)
- Mode: ECB (Electronic Codebook) - each block encrypted independently
- Padding: PKCS7 (removes trailing bytes where value equals padding length)

### Key Derivation
The default Sysme key is a fixed 16-byte string commonly used in legacy Sysme installations. If the decryption fails, your Sysme instance may use a different key.

### Decryption Process
1. Remove "SYSENC1:" prefix
2. Convert hex string to binary buffer
3. Split into 8-byte blocks
4. Decrypt each block with XTEA
5. Remove PKCS7 padding
6. Convert to UTF-8 string

## References

- **XTEA**: https://en.wikipedia.org/wiki/XTEA
- **Sysme TPV**: Legacy Spanish ERP system
- **npm xtea**: https://www.npmjs.com/package/xtea
