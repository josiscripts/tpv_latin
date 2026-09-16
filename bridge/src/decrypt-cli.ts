#!/usr/bin/env node

import { getDecryptedPassword } from './sysenc1-decrypt';

const password = process.argv[2];

if (!password) {
  console.log('Usage: npx decrypt-cli "SYSENC1:..." or "plaintext"');
  console.log('\nExamples:');
  console.log('  npx decrypt-cli "infusorio"');
  console.log('  npx decrypt-cli "SYSENC1:abcd1234efgh5678..."');
  process.exit(1);
}

console.log('Input password format:', password.startsWith('SYSENC1:') ? 'SYSENC1 (encrypted)' : 'Plaintext');
const result = getDecryptedPassword(password);
console.log('Decrypted password:', result);

// Verify MySQL connection with the decrypted password
import mysql from 'mysql2/promise';

async function testConnection() {
  try {
    const pool = await mysql.createPool({
      host: '127.0.0.1',
      port: 4306,
      database: 'sysmehotel',
      user: 'root',
      password: result,
      waitForConnections: true,
      connectionLimit: 1,
    });

    const conn = await pool.getConnection();
    const [rows] = await conn.query('SELECT 1 as test');
    console.log('\n✓ MySQL connection test: SUCCESS');
    console.log('Query result:', rows);
    conn.release();
    await pool.end();
  } catch (error) {
    console.error('\n✗ MySQL connection test: FAILED');
    console.error('Error:', (error as Error).message);
  }
}

testConnection().catch(console.error);
