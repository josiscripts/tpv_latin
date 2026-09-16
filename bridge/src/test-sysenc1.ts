import { getDecryptedPassword } from './sysenc1-decrypt';

// Test cases
const testCases = [
  // Plaintext password (should pass through unchanged)
  { input: 'infusorio', expected: 'infusorio', name: 'Plaintext password' },
  // Empty password
  { input: '', expected: '', name: 'Empty password' },
  // Test with encrypted format (if available)
];

console.log('Testing SYSENC1 decryption module...\n');

testCases.forEach(test => {
  const result = getDecryptedPassword(test.input);
  const passed = result === test.expected;
  console.log(`${passed ? '✓' : '✗'} ${test.name}`);
  if (!passed) {
    console.log(`  Expected: ${test.expected}`);
    console.log(`  Got: ${result}`);
  }
});

console.log('\nNote: To test SYSENC1 encrypted passwords, provide a value starting with "SYSENC1:"');
