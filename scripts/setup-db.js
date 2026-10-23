require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const client = await pool.connect();
  try {
    await client.query(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
    const { rows } = await client.query('SELECT count(*)::int AS n FROM branch');
    if (rows[0].n === 0) {
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(__dirname, '..', 'seed.sql'), 'utf8'));
        const users = [
          ['admin','Admin',null,'System Admin'],
          ['employee','Employee',1,'Sanjay Rao'],
          ['agent','Agent',1,'Riya Kapoor'],
          ['underwriter','Underwriter',1,'Ananya Iyer'],
          ['investigator','Investigator',1,'Dev Nair'],
          ['customer','Customer',1,'Aarav Sharma']
        ];
        for (const [username,role,personId,displayName] of users) {
          await client.query('INSERT INTO app_user (username,password_hash,role,person_id,display_name) VALUES ($1,$2,$3,$4,$5)',
            [username,bcrypt.hashSync('Demo@123',10),role,personId,displayName]);
        }
        await client.query('COMMIT');
        console.log('Created schema and sample data.');
      } catch (e) { await client.query('ROLLBACK'); throw e; }
    } else console.log('Schema ready; existing sample data preserved.');
  } finally { client.release(); await pool.end(); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
