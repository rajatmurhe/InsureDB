if (!process.env.DATABASE_URL) require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Pool, types } = require('pg');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
types.setTypeParser(1082, value => value);

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const documentUpload = multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024}}).single('file');
const production = process.env.NODE_ENV === 'production';
if (production && (!process.env.SESSION_SECRET || !process.env.ADMIN_PASSWORD || !process.env.VIEWER_PASSWORD)) {
  throw new Error('SESSION_SECRET, ADMIN_PASSWORD, and VIEWER_PASSWORD are required in production.');
}
class PgSessionStore extends session.Store {
  get(sid,callback) {
    pool.query('SELECT sess FROM app_session WHERE sid=$1 AND expires_at>now()',[sid])
      .then(({rows})=>callback(null,rows[0]?.sess||null)).catch(callback);
  }
  set(sid,value,callback) {
    const expiry=value.cookie?.expires||new Date(Date.now()+8*60*60*1000);
    pool.query(`INSERT INTO app_session(sid,sess,expires_at) VALUES ($1,$2,$3)
      ON CONFLICT (sid) DO UPDATE SET sess=EXCLUDED.sess,expires_at=EXCLUDED.expires_at`,[sid,value,expiry])
      .then(()=>callback()).catch(callback);
  }
  destroy(sid,callback) {
    pool.query('DELETE FROM app_session WHERE sid=$1',[sid]).then(()=>callback()).catch(callback);
  }
  touch(sid,value,callback) {
    const expiry=value.cookie?.expires||new Date(Date.now()+8*60*60*1000);
    pool.query('UPDATE app_session SET expires_at=$2 WHERE sid=$1',[sid,expiry]).then(()=>callback()).catch(callback);
  }
}
const tables = {
  customer: ['Customers','People'], individual_customer: ['Individuals','People'], corporate_customer: ['Corporates','People'],
  policy: ['Policies','Insurance'], life_insurance_policy: ['Life details','Insurance'], health_insurance_policy: ['Health details','Insurance'],
  vehicle_insurance_policy: ['Vehicle details','Insurance'], property_insurance_policy: ['Property details','Insurance'],
  beneficiary: ['Beneficiaries','Insurance'], policy_renewal: ['Renewals','Insurance'], payment: ['Payments','Finance'],
  claim: ['Claims','Claims'], claim_document: ['Claim documents','Claims'], investigation: ['Investigations','Claims'],
  branch: ['Branches','Team'], employee: ['Employees','Team'], agent: ['Agents','Team'],
  underwriter: ['Underwriters','Team'], investigator: ['Investigators','Team'], agent_assignment: ['Agent assignments','Team']
};
const roleAccess = {
  Admin: Object.keys(tables),
  Viewer: Object.keys(tables),
  Employee: Object.keys(tables),
  Agent: ['customer','individual_customer','corporate_customer','policy','life_insurance_policy','health_insurance_policy','vehicle_insurance_policy','property_insurance_policy','beneficiary','payment','agent_assignment','agent','branch'],
  Underwriter: ['customer','individual_customer','corporate_customer','policy','life_insurance_policy','health_insurance_policy','vehicle_insurance_policy','property_insurance_policy','claim','claim_document','investigation','underwriter'],
  Investigator: ['policy','claim','claim_document','investigation','investigator'],
  Customer: ['customer','individual_customer','corporate_customer','policy','life_insurance_policy','health_insurance_policy','vehicle_insurance_policy','property_insurance_policy','beneficiary','payment','policy_renewal','claim','claim_document','investigation']
};
const subtypeTables=new Set(['individual_customer','corporate_customer','life_insurance_policy','health_insurance_policy','vehicle_insurance_policy','property_insurance_policy']);
const q = name => '"' + name.replace(/"/g, '""') + '"';
const html = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pk = name => ({individual_customer:'customer_id',corporate_customer:'customer_id',life_insurance_policy:'policy_id',health_insurance_policy:'policy_id',vehicle_insurance_policy:'policy_id',property_insurance_policy:'policy_id',policy_renewal:'renewal_id',claim_document:'document_id',agent_assignment:'assignment_id'})[name] || name + '_id';
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);

app.use(express.json({limit:'1mb'}));
if (production) app.set('trust proxy', 1);
app.use(session({
  store: production ? new PgSessionStore() : undefined,
  secret:process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave:false,saveUninitialized:false,
  cookie:{httpOnly:true,sameSite:'lax',secure:production,maxAge:1000*60*60*8}
}));
app.use(express.static(path.join(__dirname,'public')));
app.get('/api/config',(req,res)=>res.json({demo:!production}));

function requireUser(req,res,next) { if (!req.session.user) return res.status(401).json({error:'Please sign in.'}); next(); }
function permitted(req,table) {
  return !!tables[table] && roleAccess[req.session.user.role].includes(table);
}
function abilities(req,table) {
  const role=req.session.user.role;
  if(!permitted(req,table)) return {canCreate:false,canUpdate:false,canDelete:false};
  if(role==='Admin'||role==='Employee') return {
    canCreate:!subtypeTables.has(table),
    canUpdate:!['policy_renewal','payment','claim_document'].includes(table),
    canDelete:!subtypeTables.has(table)&&!['policy_renewal','payment'].includes(table)
  };
  if(role==='Agent') return {canCreate:table==='beneficiary',canUpdate:table==='beneficiary',canDelete:false};
  if(role==='Underwriter') return {canCreate:false,canUpdate:['policy','claim'].includes(table),canDelete:false};
  if(role==='Investigator') return {canCreate:false,canUpdate:table==='investigation',canDelete:false};
  if(role==='Customer') return {canCreate:['claim','claim_document'].includes(table),canUpdate:['customer','individual_customer','corporate_customer'].includes(table),canDelete:false};
  return {canCreate:false,canUpdate:false,canDelete:false};
}
function scope(req,table) {
  if (req.session.user.role === 'Agent') {
    const id=req.session.user.person_id;
    if(table==='agent') return {sql:' WHERE agent_id=$1',params:[id]};
    if(table==='branch') return {sql:' WHERE branch_id IN (SELECT branch_id FROM agent WHERE agent_id=$1)',params:[id]};
    if(table==='agent_assignment') return {sql:' WHERE agent_id=$1',params:[id]};
    if(['customer','individual_customer','corporate_customer'].includes(table))
      return {sql:' WHERE customer_id IN (SELECT p.customer_id FROM policy p JOIN agent_assignment aa ON aa.policy_id=p.policy_id WHERE aa.agent_id=$1)',params:[id]};
    if(table==='policy') return {sql:' WHERE policy_id IN (SELECT policy_id FROM agent_assignment WHERE agent_id=$1)',params:[id]};
    if(['life_insurance_policy','health_insurance_policy','vehicle_insurance_policy','property_insurance_policy','beneficiary','payment'].includes(table))
      return {sql:' WHERE policy_id IN (SELECT policy_id FROM agent_assignment WHERE agent_id=$1)',params:[id]};
    return {sql:' WHERE false',params:[]};
  }
  if (req.session.user.role === 'Investigator') {
    const id=req.session.user.person_id;
    if(table==='investigator') return {sql:' WHERE investigator_id=$1',params:[id]};
    if(table==='investigation') return {sql:' WHERE investigator_id=$1',params:[id]};
    if(table==='claim'||table==='claim_document') return {sql:` WHERE claim_id IN (SELECT claim_id FROM investigation WHERE investigator_id=$1)`,params:[id]};
    if(table==='policy') return {sql:` WHERE policy_id IN (SELECT c.policy_id FROM claim c JOIN investigation i ON i.claim_id=c.claim_id WHERE i.investigator_id=$1)`,params:[id]};
    return {sql:' WHERE false',params:[]};
  }
  if (req.session.user.role !== 'Customer') return {sql:'',params:[]};
  const id=req.session.user.person_id;
  if (['customer','individual_customer','corporate_customer'].includes(table)) return {sql:' WHERE customer_id=$1',params:[id]};
  if (table==='policy') return {sql:' WHERE customer_id=$1',params:[id]};
  if (['life_insurance_policy','health_insurance_policy','vehicle_insurance_policy','property_insurance_policy','beneficiary','payment','policy_renewal','claim'].includes(table))
    return {sql:' WHERE policy_id IN (SELECT policy_id FROM policy WHERE customer_id=$1)',params:[id]};
  if (table==='claim_document'||table==='investigation') return {sql:' WHERE claim_id IN (SELECT c.claim_id FROM claim c JOIN policy p ON p.policy_id=c.policy_id WHERE p.customer_id=$1)',params:[id]};
  return {sql:' WHERE false',params:[]};
}
async function columns(table) {
  const {rows}=await pool.query(`SELECT column_name,data_type,is_nullable,column_default,is_identity,
    (SELECT ccu.table_name FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema
      WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name=cols.table_name AND kcu.column_name=cols.column_name LIMIT 1) AS references_table
    FROM information_schema.columns cols WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,[table]);
  return rows;
}
app.post('/api/login',asyncRoute(async(req,res)=>{
  const {username,password}=req.body;
  const {rows}=await pool.query('SELECT * FROM app_user WHERE username=$1',[username]);
  if (!rows[0] || !bcrypt.compareSync(password || '',rows[0].password_hash)) return res.status(401).json({error:'Invalid username or password.'});
  req.session.regenerate(err=>{
    if(err) return res.status(500).json({error:'Could not start session.'});
    const {username,role,person_id,display_name}=rows[0];
    req.session.user={username,role,person_id,display_name}; res.json(req.session.user);
  });
}));
app.post('/api/logout',requireUser,(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/me',requireUser,(req,res)=>res.json(req.session.user));
app.get('/api/tables',requireUser,asyncRoute(async(req,res)=>{
  const accessible=Object.entries(tables).filter(([key])=>permitted(req,key));
  const result=[];
  for(const [key,[label,group]] of accessible) {
    const sc=scope(req,key);
    const {rows}=await pool.query(`SELECT count(*)::int AS count FROM ${q(key)}${sc.sql}`,sc.params);
    result.push({key,label,group,count:rows[0].count,...abilities(req,key)});
  }
  res.json(result);
}));
app.get('/api/schema/:table',requireUser,asyncRoute(async(req,res)=>{
  const table=req.params.table;
  if(!permitted(req,table)) return res.status(403).json({error:'Table unavailable for this role.'});
  res.json({name:table,primaryKey:pk(table),columns:await columns(table),...abilities(req,table)});
}));
app.get('/api/table/:table',requireUser,asyncRoute(async(req,res)=>{
  const table=req.params.table;
  if(!permitted(req,table)) return res.status(403).json({error:'Table unavailable for this role.'});
  const sc=scope(req,table);
  const selection=table==='claim_document'?'document_id,claim_id,document_type,file_name,upload_date,storage_key,mime_type,EXISTS (SELECT 1 FROM claim_document_file f WHERE f.document_id=claim_document.document_id) AS has_file':'*';
  const {rows}=await pool.query(`SELECT ${selection} FROM ${q(table)}${sc.sql} ORDER BY ${q(pk(table))} DESC LIMIT 250`,sc.params);
  res.json(rows);
}));
app.get('/api/options/:table',requireUser,asyncRoute(async(req,res)=>{
  const table=req.params.table;
  if(!permitted(req,table) || table==='app_user') return res.status(403).json({error:'Unavailable.'});
  const sc=scope(req,table);
  if(req.session.user.role==='Underwriter'&&table==='underwriter') {
    const {rows}=await pool.query('SELECT underwriter_id AS value,name AS label FROM underwriter WHERE underwriter_id=$1',[req.session.user.person_id]);
    return res.json(rows);
  }
  if(req.session.user.role==='Agent'&&table==='agent') {
    const {rows}=await pool.query('SELECT agent_id AS value,name AS label FROM agent WHERE agent_id=$1',[req.session.user.person_id]);
    return res.json(rows);
  }
  if(table==='customer') {
    const {rows}=await pool.query(`SELECT c.customer_id AS value,COALESCE(ic.name,cc.company_name,c.email) AS label
      FROM customer c LEFT JOIN individual_customer ic ON ic.customer_id=c.customer_id
      LEFT JOIN corporate_customer cc ON cc.customer_id=c.customer_id${sc.sql.replace('customer_id','c.customer_id')}
      ORDER BY c.customer_id DESC LIMIT 200`,sc.params);
    return res.json(rows);
  }
  const {rows}=await pool.query(`SELECT * FROM ${q(table)}${sc.sql} ORDER BY ${q(pk(table))} DESC LIMIT 200`,sc.params);
  res.json(rows.map(row=>({value:row[pk(table)],label:row.name||row.company_name||row.branch_name||row.policy_number||row.username||`${table} #${row[pk(table)]}`})));
}));
app.post('/api/table/:table',requireUser,asyncRoute(async(req,res)=>{
  const table=req.params.table;
  if(!abilities(req,table).canCreate) return res.status(403).json({error:'Creating records is unavailable for this role.'});
  if(table==='customer'||table==='policy') return res.status(400).json({error:'Use the guided creation form for customers and policies.'});
  if(table==='claim_document') return res.status(400).json({error:'Use the document upload form.'});
  const cols=await columns(table);
  const allowed=cols.filter(c=>c.is_identity!=='YES' && Object.prototype.hasOwnProperty.call(req.body,c.column_name));
  if(!allowed.length) return res.status(400).json({error:'Enter at least one field.'});
  const data=Object.fromEntries(allowed.map(c=>[c.column_name,req.body[c.column_name] === '' ? null : req.body[c.column_name]]));
  if(req.session.user.role==='Customer') {
    if(table==='customer') return res.status(403).json({error:'Use Edit to update your profile.'});
    if(table==='claim') {
      const {rows}=await pool.query("SELECT 1 FROM policy WHERE policy_id=$1 AND customer_id=$2 AND status='Active'",[data.policy_id,req.session.user.person_id]);
      if(!rows.length) return res.status(403).json({error:'Claims require your active policy.'});
    }
    if(table==='claim_document') {
      const {rows}=await pool.query('SELECT 1 FROM claim c JOIN policy p ON p.policy_id=c.policy_id WHERE c.claim_id=$1 AND p.customer_id=$2',[data.claim_id,req.session.user.person_id]);
      if(!rows.length) return res.status(403).json({error:'That claim is not yours.'});
    }
  }
  if(req.session.user.role==='Agent') {
    if(table==='agent_assignment' && Number(data.agent_id)!==req.session.user.person_id) return res.status(403).json({error:'You can assign only yourself.'});
    if(table==='beneficiary') {
      const {rows}=await pool.query('SELECT 1 FROM agent_assignment WHERE policy_id=$1 AND agent_id=$2',[data.policy_id,req.session.user.person_id]);
      if(!rows.length) return res.status(403).json({error:'This policy is not assigned to you.'});
    }
  }
  if(req.session.user.role==='Investigator' && Number(data.investigator_id)!==req.session.user.person_id)
    return res.status(403).json({error:'You can record only your own investigations.'});
  const keys=Object.keys(data);
  const {rows}=await pool.query(`INSERT INTO ${q(table)} (${keys.map(q).join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,Object.values(data));
  res.status(201).json(rows[0]);
}));
app.post('/api/claims/:id/documents',requireUser,(req,res,next)=>{
  if(!abilities(req,'claim_document').canCreate) return res.status(403).json({error:'Uploading documents is unavailable for this role.'});
  documentUpload(req,res,err=>err?next(err):next());
},asyncRoute(async(req,res)=>{
  const claimId=Number(req.params.id);
  if(!Number.isSafeInteger(claimId)||claimId<1) return res.status(400).json({error:'Invalid claim ID.'});
  if(!req.file||!req.body.document_type) return res.status(400).json({error:'Choose a file and document type.'});
  const ext=path.extname(req.file.originalname).toLowerCase();
  if(!['.pdf','.png','.jpg','.jpeg'].includes(ext)) return res.status(400).json({error:'Upload a PDF, PNG or JPEG file.'});
  const {rows:claims}=await pool.query('SELECT p.customer_id FROM claim c JOIN policy p ON p.policy_id=c.policy_id WHERE c.claim_id=$1',[claimId]);
  if(!claims.length) return res.status(404).json({error:'Claim not found.'});
  if(req.session.user.role==='Customer'&&claims[0].customer_id!==req.session.user.person_id) return res.status(403).json({error:'That claim is not yours.'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const {rows}=await client.query('INSERT INTO claim_document(claim_id,document_type,file_name,mime_type) VALUES ($1,$2,$3,$4) RETURNING *',[claimId,req.body.document_type,req.file.originalname,req.file.mimetype]);
    await client.query('INSERT INTO claim_document_file(document_id,content) VALUES ($1,$2)',[rows[0].document_id,req.file.buffer]);
    await client.query('COMMIT');
    res.status(201).json({...rows[0],has_file:true});
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.get('/api/documents/:id/download',requireUser,asyncRoute(async(req,res)=>{
  if(!permitted(req,'claim_document')) return res.status(403).json({error:'Unavailable.'});
  const {rows}=await pool.query('SELECT d.*,f.content,p.customer_id FROM claim_document d LEFT JOIN claim_document_file f ON f.document_id=d.document_id JOIN claim c ON c.claim_id=d.claim_id JOIN policy p ON p.policy_id=c.policy_id WHERE d.document_id=$1',[req.params.id]);
  const doc=rows[0];
  if(!doc||req.session.user.role==='Customer'&&doc.customer_id!==req.session.user.person_id) return res.status(404).json({error:'Document not found.'});
  if(req.session.user.role==='Investigator') {
    const assigned=await pool.query('SELECT 1 FROM investigation WHERE claim_id=$1 AND investigator_id=$2',[doc.claim_id,req.session.user.person_id]);
    if(!assigned.rows.length) return res.status(404).json({error:'Document not found.'});
  }
  if(!doc.content) return res.status(404).json({error:'This sample document has no stored file.'});
  res.type(doc.mime_type||'application/octet-stream');
  res.attachment(doc.file_name);
  res.send(doc.content);
}));
app.get('/api/receipts/:id',requireUser,asyncRoute(async(req,res)=>{
  if(!permitted(req,'payment')) return res.status(403).send('Unavailable.');
  const {rows}=await pool.query(`SELECT py.*,p.policy_number,p.customer_id,COALESCE(ic.name,cc.company_name,c.email) customer_name
    FROM payment py JOIN policy p ON p.policy_id=py.policy_id JOIN customer c ON c.customer_id=p.customer_id
    LEFT JOIN individual_customer ic ON ic.customer_id=c.customer_id
    LEFT JOIN corporate_customer cc ON cc.customer_id=c.customer_id WHERE py.payment_id=$1`,[req.params.id]);
  const receipt=rows[0];
  if(!receipt||req.session.user.role==='Customer'&&receipt.customer_id!==req.session.user.person_id) return res.status(404).send('Receipt not found.');
  if(req.session.user.role==='Agent') {
    const assigned=await pool.query('SELECT 1 FROM agent_assignment WHERE policy_id=$1 AND agent_id=$2',[receipt.policy_id,req.session.user.person_id]);
    if(!assigned.rows.length) return res.status(404).send('Receipt not found.');
  }
  const amount=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(receipt.amount);
  res.set('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'");
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${html(receipt.receipt_number)}</title>
  <style>body{font:15px Arial,sans-serif;color:#203047;max-width:620px;margin:55px auto;padding:20px}h1{margin-bottom:4px}small{color:#8090a0}table{border-collapse:collapse;width:100%;margin-top:35px}td{padding:13px;border-bottom:1px solid #e6ebf0}td:last-child{text-align:right;font-weight:bold}.total{font-size:22px;color:#3166d4}@media print{body{margin:0}}</style></head><body>
  <h1>InsureDB</h1><small>Premium payment receipt</small><table>
  <tr><td>Receipt number</td><td>${html(receipt.receipt_number)}</td></tr>
  <tr><td>Payment date</td><td>${html(receipt.payment_date)}</td></tr>
  <tr><td>Customer</td><td>${html(receipt.customer_name)}</td></tr>
  <tr><td>Policy</td><td>${html(receipt.policy_number)}</td></tr>
  <tr><td>Payment mode</td><td>${html(receipt.payment_mode)}</td></tr>
  <tr><td>Amount paid</td><td class="total">${html(amount)}</td></tr></table></body></html>`);
}));
app.post('/api/create-customer',requireUser,asyncRoute(async(req,res)=>{
  if(!abilities(req,'customer').canCreate) return res.status(403).json({error:'Unavailable.'});
  const {customer_type,address,phone,email,details={}}=req.body;
  if(!['Individual','Corporate'].includes(customer_type)||!address||!email) return res.status(400).json({error:'Customer type, address and email are required.'});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows}=await client.query('INSERT INTO customer(customer_type,address,phone,email) VALUES ($1,$2,$3,$4) RETURNING *',[customer_type,address,phone||null,email]);
    const id=rows[0].customer_id;
    if(customer_type==='Individual') {
      if(!details.name) throw Error('Individual name is required.');
      await client.query('INSERT INTO individual_customer(customer_id,name,dob,gender,occupation) VALUES ($1,$2,$3,$4,$5)',[id,details.name,details.dob||null,details.gender||null,details.occupation||null]);
    } else {
      if(!details.company_name||!details.registration_number) throw Error('Company name and registration number are required.');
      await client.query('INSERT INTO corporate_customer(customer_id,company_name,registration_number,contact_person,industry_type) VALUES ($1,$2,$3,$4,$5)',[id,details.company_name,details.registration_number,details.contact_person||null,details.industry_type||null]);
    }
    await client.query('COMMIT');res.status(201).json(rows[0]);
  } catch(e){await client.query('ROLLBACK');throw e;} finally{client.release();}
}));
app.post('/api/create-policy',requireUser,asyncRoute(async(req,res)=>{
  if(!abilities(req,'policy').canCreate) return res.status(403).json({error:'Unavailable.'});
  const {customer_id,underwriter_id,policy_type,start_date,end_date,premium_amount,status,details={}}=req.body;
  const specs={Life:['life_insurance_policy',['beneficiary_name','sum_assured','term_years']],Health:['health_insurance_policy',['coverage_type','hospital_network']],Vehicle:['vehicle_insurance_policy',['vehicle_number','vehicle_model','idv_value']],Property:['property_insurance_policy',['property_address','property_value']]};
  if(!specs[policy_type]) return res.status(400).json({error:'Select a policy type.'});
  if(!customer_id||!start_date||!end_date||!premium_amount) return res.status(400).json({error:'Customer, dates and premium are required.'});
  const [subtype,fields]=specs[policy_type];
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const {rows}=await client.query('INSERT INTO policy(customer_id,underwriter_id,policy_type,start_date,end_date,premium_amount,status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',[customer_id,underwriter_id||null,policy_type,start_date,end_date,premium_amount,status||'Pending']);
    const vals=fields.map(f=>details[f]||null);
    await client.query(`INSERT INTO ${q(subtype)} (policy_id,${fields.map(q).join(',')}) VALUES (${fields.map((_,i)=>'$'+(i+2)).join(',').replace(/^/,'$1,')})`,[rows[0].policy_id,...vals]);
    await client.query('COMMIT');res.status(201).json(rows[0]);
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.patch('/api/table/:table/:id',requireUser,asyncRoute(async(req,res)=>{
  const table=req.params.table;
  if(!abilities(req,table).canUpdate) return res.status(403).json({error:'Editing unavailable for this role.'});
  if(req.session.user.role==='Customer' && (!['customer','individual_customer','corporate_customer'].includes(table)||Number(req.params.id)!==req.session.user.person_id)) return res.status(403).json({error:'You can edit only your profile.'});
  const cols=await columns(table);
  const keys=cols.filter(c=>c.column_name!==pk(table) && c.is_identity!=='YES' && Object.prototype.hasOwnProperty.call(req.body,c.column_name)).map(c=>c.column_name);
  if(!keys.length) return res.status(400).json({error:'No editable fields supplied.'});
  if(table==='claim_document'&&keys.some(x=>['storage_key','mime_type','claim_id'].includes(x))) return res.status(403).json({error:'Stored files and claim links cannot be changed here.'});
  if(req.session.user.role==='Customer' && table==='customer' && keys.some(x=>!['address','phone','email'].includes(x))) return res.status(403).json({error:'Only contact details may be edited here.'});
  if(req.session.user.role==='Underwriter') {
    if(keys.some(x=>!(table==='policy'?['status','underwriter_id']:['status','settlement_amount']).includes(x))) return res.status(403).json({error:'Underwriters can change only decisions and settlement details.'});
    if(table==='policy') {
      const {rows}=await pool.query('SELECT underwriter_id FROM policy WHERE policy_id=$1',[req.params.id]);
      if(!rows.length||rows[0].underwriter_id&&rows[0].underwriter_id!==req.session.user.person_id) return res.status(403).json({error:'This policy is assigned to another underwriter.'});
      if(keys.includes('underwriter_id')&&Number(req.body.underwriter_id)!==req.session.user.person_id) return res.status(403).json({error:'You can assign only yourself.'});
    } else {
      const {rows}=await pool.query('SELECT p.underwriter_id FROM claim c JOIN policy p ON p.policy_id=c.policy_id WHERE c.claim_id=$1',[req.params.id]);
      if(!rows.length||rows[0].underwriter_id!==req.session.user.person_id) return res.status(403).json({error:'This claim belongs to another underwriter.'});
      if(keys.includes('status')&&['Approved','Rejected','Settled'].includes(req.body.status)) {
        const check=await pool.query('SELECT 1 FROM investigation WHERE claim_id=$1',[req.params.id]);
        if(!check.rows.length) return res.status(400).json({error:'Record an investigation before making a claim decision.'});
      }
    }
  }
  if(req.session.user.role==='Investigator') {
    const {rows}=await pool.query('SELECT investigator_id FROM investigation WHERE investigation_id=$1',[req.params.id]);
    if(!rows.length||rows[0].investigator_id!==req.session.user.person_id) return res.status(403).json({error:'You can edit only your investigations.'});
    if(keys.some(x=>['investigator_id','claim_id'].includes(x))) return res.status(403).json({error:'Investigation assignment cannot be changed here.'});
  }
  if(req.session.user.role==='Agent') {
    const idColumn=table==='agent_assignment'?'assignment_id':'beneficiary_id';
    const {rows}=await pool.query(`SELECT p.policy_id FROM ${q(table)} x JOIN agent_assignment aa ON aa.policy_id=x.policy_id AND aa.agent_id=$1 JOIN policy p ON p.policy_id=x.policy_id WHERE x.${q(idColumn)}=$2`,[req.session.user.person_id,req.params.id]);
    if(!rows.length) return res.status(403).json({error:'This policy is not assigned to you.'});
    if(table==='agent_assignment'&&keys.includes('agent_id')&&Number(req.body.agent_id)!==req.session.user.person_id) return res.status(403).json({error:'You can assign only yourself.'});
    if(keys.includes('policy_id')) return res.status(403).json({error:'Policy links cannot be changed here.'});
  }
  const vals=keys.map(k=>req.body[k] === '' ? null : req.body[k]);
  const {rows}=await pool.query(`UPDATE ${q(table)} SET ${keys.map((k,i)=>`${q(k)}=$${i+1}`).join(',')} WHERE ${q(pk(table))}=$${keys.length+1} RETURNING *`,[...vals,req.params.id]);
  if(!rows.length) return res.status(404).json({error:'Record not found.'});
  res.json(rows[0]);
}));
app.delete('/api/table/:table/:id',requireUser,asyncRoute(async(req,res)=>{
  const table=req.params.table;
  if(!abilities(req,table).canDelete) return res.status(403).json({error:'Deleting records is unavailable for this role.'});
  const {rowCount}=await pool.query(`DELETE FROM ${q(table)} WHERE ${q(pk(table))}=$1`,[req.params.id]);
  if(!rowCount) return res.status(404).json({error:'Record not found.'});
  res.json({ok:true});
}));
app.get('/api/dashboard',requireUser,asyncRoute(async(req,res)=>{
  if(req.session.user.role==='Customer') {
    const id=req.session.user.person_id;
    const [policies,claims,payments]=await Promise.all([
      pool.query('SELECT count(*)::int n FROM policy WHERE customer_id=$1',[id]),
      pool.query('SELECT count(*)::int n FROM claim c JOIN policy p ON p.policy_id=c.policy_id WHERE p.customer_id=$1',[id]),
      pool.query('SELECT COALESCE(sum(amount),0)::numeric n FROM payment py JOIN policy p ON p.policy_id=py.policy_id WHERE p.customer_id=$1',[id])
    ]);
    const recent=await pool.query(`SELECT p.policy_number,p.policy_type,p.status,p.premium_amount,
      COALESCE(ic.name,cc.company_name) customer_name FROM policy p
      LEFT JOIN individual_customer ic ON ic.customer_id=p.customer_id
      LEFT JOIN corporate_customer cc ON cc.customer_id=p.customer_id
      WHERE p.customer_id=$1 ORDER BY p.policy_id DESC LIMIT 5`,[id]);
    return res.json({policies:policies.rows[0].n,claims:claims.rows[0].n,revenue:payments.rows[0].n,customers:1,recent:recent.rows});
  }
  if(req.session.user.role==='Investigator') {
    const id=req.session.user.person_id;
    const {rows}=await pool.query(`SELECT count(DISTINCT c.policy_id)::int policies,count(DISTINCT c.claim_id)::int claims
      FROM claim c JOIN investigation i ON i.claim_id=c.claim_id WHERE i.investigator_id=$1`,[id]);
    return res.json({customers:0,policies:rows[0].policies,claims:rows[0].claims,revenue:0,recent:[]});
  }
  if(req.session.user.role==='Agent') {
    const id=req.session.user.person_id;
    const {rows}=await pool.query(`SELECT count(DISTINCT p.customer_id)::int customers,count(DISTINCT p.policy_id)::int policies,
      COALESCE(sum(py.amount),0)::numeric revenue FROM policy p
      JOIN agent_assignment aa ON aa.policy_id=p.policy_id AND aa.agent_id=$1
      LEFT JOIN payment py ON py.policy_id=p.policy_id`,[id]);
    const claims=await pool.query('SELECT count(*)::int claims FROM claim c JOIN agent_assignment aa ON aa.policy_id=c.policy_id WHERE aa.agent_id=$1',[id]);
    const recent=await pool.query(`SELECT p.policy_number,p.policy_type,p.status,p.premium_amount,
      COALESCE(ic.name,cc.company_name) customer_name FROM policy p
      JOIN agent_assignment aa ON aa.policy_id=p.policy_id AND aa.agent_id=$1
      LEFT JOIN individual_customer ic ON ic.customer_id=p.customer_id
      LEFT JOIN corporate_customer cc ON cc.customer_id=p.customer_id ORDER BY p.policy_id DESC LIMIT 5`,[id]);
    return res.json({...rows[0],claims:claims.rows[0].claims,recent:recent.rows});
  }
  const {rows}=await pool.query(`SELECT
    (SELECT count(*) FROM customer)::int customers,
    (SELECT count(*) FROM policy)::int policies,
    (SELECT count(*) FROM claim)::int claims,
    (SELECT COALESCE(sum(amount),0) FROM payment)::numeric revenue`);
  const recent=await pool.query(`SELECT p.policy_number,p.policy_type,p.status,p.premium_amount,
    COALESCE(ic.name,cc.company_name) customer_name FROM policy p
    LEFT JOIN individual_customer ic ON ic.customer_id=p.customer_id
    LEFT JOIN corporate_customer cc ON cc.customer_id=p.customer_id ORDER BY p.policy_id DESC LIMIT 5`);
  res.json({...rows[0],recent:recent.rows});
}));
app.get('/api/reports',requireUser,asyncRoute(async(req,res)=>{
  if(!['Admin','Employee','Viewer'].includes(req.session.user.role)) return res.status(403).json({error:'Reports are unavailable for this role.'});
  const [types,status,claims,commissions]=await Promise.all([
    pool.query('SELECT policy_type AS label,count(*)::int AS count FROM policy GROUP BY policy_type ORDER BY policy_type'),
    pool.query('SELECT status AS label,count(*)::int AS count FROM policy GROUP BY status ORDER BY status'),
    pool.query('SELECT status AS label,count(*)::int AS count,COALESCE(sum(settlement_amount),0)::numeric AS settled_amount FROM claim GROUP BY status ORDER BY status'),
    pool.query(`SELECT a.name,count(aa.assignment_id)::int policies,
      COALESCE(sum(p.premium_amount*a.commission_rate/100),0)::numeric(12,2) commission
      FROM agent a LEFT JOIN agent_assignment aa ON aa.agent_id=a.agent_id
      LEFT JOIN policy p ON p.policy_id=aa.policy_id GROUP BY a.agent_id ORDER BY a.name`)
  ]);
  res.json({types:types.rows,status:status.rows,claims:claims.rows,commissions:commissions.rows});
}));
app.get('/api/health',asyncRoute(async(req,res)=>{await pool.query('SELECT 1');res.json({ok:true});}));
app.use((err,req,res,next)=>{
  console.error(err);
  if(err.code==='LIMIT_FILE_SIZE') return res.status(413).json({error:'Document must be 5 MB or smaller.'});
  if(err.code==='23503') return res.status(400).json({error:'This record is linked to another table. Check the foreign key or remove dependent records first.'});
  if(err.code==='23505') return res.status(400).json({error:'This value must be unique and already exists.'});
  if(err.code==='23514'||err.code==='P0001'||err.code==='22P02') return res.status(400).json({error:err.message});
  res.status(500).json({error:'Database request failed.'});
});
const port=Number(process.env.PORT||3000);
app.listen(port,()=>console.log(`Insurance Management System running at http://localhost:${port}`));
