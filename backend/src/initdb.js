const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('schema ready');
  await pool.end();
})().catch(err => {
  console.error('could not set up schema:', err.message);
  process.exit(1);
});
