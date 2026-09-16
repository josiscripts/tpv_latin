const mysql = require('mysql2/promise');

async function testReadOnly() {
  const pool = await mysql.createPool({
    host: '127.0.0.1',
    port: 4306,
    database: 'sysmehotel',
    user: 'root',
    password: 'infusorio',
    waitForConnections: true,
    connectionLimit: 5,
  });

  try {
    const conn = await pool.getConnection();

    console.log('✓ Connected to MySQL');
    console.log('');

    // Test basic query
    const [basicTest] = await conn.query('SELECT 1 as test');
    console.log('✓ Basic query successful:');
    console.log(JSON.stringify(basicTest, null, 2));
    console.log('');

    // Check database tables
    const [tables] = await conn.query(
      "SELECT COUNT(*) as total_tables FROM information_schema.TABLES WHERE TABLE_SCHEMA='sysmehotel'"
    );
    console.log('✓ Database tables:');
    console.log(`  Total: ${tables[0].total_tables}`);
    console.log('');

    // Check some data
    const [sales] = await conn.query(
      'SELECT COUNT(*) as total_sales FROM sysmehotel.ventadirecta'
    );
    console.log('✓ Sales records:');
    console.log(`  Total: ${sales[0].total_sales}`);
    console.log('');

    // List products
    const [products] = await conn.query(
      'SELECT id_complementog, complementog FROM sysmehotel.complementog LIMIT 3'
    );
    console.log('✓ Sample products:');
    products.forEach(p => {
      console.log(`  ${p.id_complementog}: ${p.complementog}`);
    });
    console.log('');

    console.log('✓ All tests passed - MySQL is accessible and read-only queries work');
    console.log('✓ No modifications were made to the database');

    conn.release();
  } catch (error) {
    console.error('✗ Error:', error.message);
  } finally {
    await pool.end();
  }
}

testReadOnly().catch(console.error);
