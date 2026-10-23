if (!process.env.DATABASE_URL) require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const production = process.env.NODE_ENV === 'production';
async function main() {
  if (production && [process.env.ADMIN_PASSWORD,process.env.VIEWER_PASSWORD].some(value=>!value||value.length<16||value==='Demo@123')) {
    throw new Error('Set distinct ADMIN_PASSWORD and VIEWER_PASSWORD values of at least 16 characters.');
  }
  if (production && process.env.ADMIN_PASSWORD===process.env.VIEWER_PASSWORD) throw new Error('Admin and viewer passwords must differ.');
  const client = await pool.connect();
  try {
    await client.query(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
    const { rows } = await client.query('SELECT count(*)::int AS n FROM branch');
    if (rows[0].n === 0) {
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(__dirname, '..', 'seed.sql'), 'utf8'));
        const users = production ? [] : [
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
    if (production) {
      await client.query('BEGIN');
      try {
        for (const [username,role,password,displayName] of [
          ['admin','Admin',process.env.ADMIN_PASSWORD,'System Admin'],
          ['viewer','Viewer',process.env.VIEWER_PASSWORD,'Read-only Viewer']
        ]) {
          await client.query(`INSERT INTO app_user (username,password_hash,role,person_id,display_name)
            VALUES ($1,$2,$3,NULL,$4)
            ON CONFLICT (username) DO UPDATE SET password_hash=EXCLUDED.password_hash,role=EXCLUDED.role,person_id=NULL,display_name=EXCLUDED.display_name`,
            [username,bcrypt.hashSync(password,10),role,displayName]);
        }
        const {rows:otherUsers}=await client.query("SELECT username,password_hash FROM app_user WHERE username IN ('employee','agent','underwriter','investigator','customer')");
        for (const user of otherUsers) {
          if (bcrypt.compareSync('Demo@123',user.password_hash)) await client.query('DELETE FROM app_user WHERE username=$1',[user.username]);
        }
        await client.query('COMMIT');
        console.log('Production login accounts are ready.');
      } catch(e) { await client.query('ROLLBACK'); throw e; }
    }
  } finally { client.release(); await pool.end(); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
