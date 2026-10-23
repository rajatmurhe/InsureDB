if (!process.env.DATABASE_URL) require('dotenv').config();
const fs=require('fs');
const path=require('path');
const {Client,types}=require('pg');
types.setTypeParser(1082,value=>value);

const sourceUrl=new URL(process.env.DATABASE_URL);
const dbName=`insurance_verify_${process.pid}_${Date.now()}`;
const adminUrl=new URL(sourceUrl);adminUrl.pathname='/postgres';
const testUrl=new URL(sourceUrl);testUrl.pathname='/'+dbName;
const admin=new Client({connectionString:adminUrl.toString()});
let db;
let created=false;
let assertions=0;
function assert(condition,message){if(!condition)throw Error(message);assertions++;}
async function rejects(sql,params,message){
  try{await db.query(sql,params);throw Error(`Expected rejection: ${message}`);}
  catch(e){if(e.message.startsWith('Expected rejection:'))throw e;assertions++;}
}
async function main(){
  await admin.connect();
  try{
    await admin.query(`CREATE DATABASE "${dbName}"`);created=true;
    db=new Client({connectionString:testUrl.toString()});await db.connect();
    const root=path.join(__dirname,'..');
    await db.query(fs.readFileSync(path.join(root,'schema.sql'),'utf8'));
    await db.query('BEGIN');
    try{await db.query(fs.readFileSync(path.join(root,'seed.sql'),'utf8'));await db.query('COMMIT');}
    catch(e){await db.query('ROLLBACK');throw e;}
    const counts=await db.query('SELECT (SELECT count(*) FROM customer)::int customers,(SELECT count(*) FROM policy)::int policies,(SELECT count(*) FROM claim)::int claims');
    assert(counts.rows[0].customers===4&&counts.rows[0].policies===5&&counts.rows[0].claims===3,'Seed counts are wrong');
    await rejects('DELETE FROM individual_customer WHERE customer_id=1',[],'customer subtype deletion');
    await rejects('DELETE FROM life_insurance_policy WHERE policy_id=1',[],'policy subtype deletion');
    await rejects("UPDATE customer SET customer_type='Corporate' WHERE customer_id=1",[],'customer type mismatch');
    await rejects("UPDATE policy SET policy_type='Health' WHERE policy_id=1",[],'policy type mismatch');
    await rejects("INSERT INTO health_insurance_policy(policy_id,coverage_type) VALUES (1,'Test')",[],'wrong policy subtype');
    await rejects("INSERT INTO beneficiary(policy_id,name,share_percentage) VALUES (1,'Overflow',1)",[],'beneficiary shares above 100');
    await rejects("INSERT INTO claim(policy_id,claim_amount,description) VALUES (5,100,'Inactive policy')",[],'claim on pending policy');
    await rejects("INSERT INTO claim(policy_id,claim_amount,description,status) VALUES (2,100,'Missing settlement','Settled')",[],'settled claim with no amount');
    await rejects("UPDATE claim SET status='Approved' WHERE claim_id=3",[],'decision without investigation');
    await rejects("INSERT INTO policy_renewal(policy_id,renewal_date,old_premium,new_premium) VALUES (2,'2026-10-23',1,19000)",[],'incorrect old premium');
    await db.query("INSERT INTO policy_renewal(policy_id,renewal_date,old_premium,new_premium) VALUES (2,'2026-10-23',18000,19000)");
    const renewed=await db.query('SELECT premium_amount,end_date FROM policy WHERE policy_id=2');
    assert(Number(renewed.rows[0].premium_amount)===19000,'Renewal did not update the policy premium');
    assert(renewed.rows[0].end_date==='2028-02-09','Renewal did not extend the policy end date');
    const {rows}=await db.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_name NOT IN ('app_user','app_session','claim_document_file')");
    assert(rows[0].n===20,'Expected 20 insurance tables');
    console.log(`Database verification passed: ${assertions} checks.`);
  }finally{
    if(db)await db.end().catch(()=>{});
    if(created)await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`).catch(e=>console.error('Temporary test database cleanup failed:',e.message));
    await admin.end();
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
