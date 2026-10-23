const base=process.env.APP_URL||'http://localhost:3000';
let checks=0;
function assert(ok,message){if(!ok)throw Error(message);checks++;}
async function request(path,{cookie,method='GET',body,form}={}){
  const response=await fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):form});
  const type=response.headers.get('content-type')||'';
  const value=type.includes('application/json')?await response.json():await response.text();
  return {status:response.status,value,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function login(username){const r=await request('/api/login',{method:'POST',body:{username,password:'Demo@123'}});assert(r.status===200,`${username} login failed`);return r.cookie;}
async function main(){
  const health=await request('/api/health');assert(health.status===200&&health.value.ok,'Database health failed');
  const noAuth=await request('/api/table/customer');assert(noAuth.status===401,'Unauthenticated access worked');
  const admin=await login('admin');
  const customer=await login('customer');
  const agent=await login('agent');
  const underwriter=await login('underwriter');
  const investigator=await login('investigator');
  let claimId,investigationId;
  try{
    const tables=await request('/api/tables',{cookie:admin});assert(tables.status===200&&tables.value.length===20,'Table list incorrect');
    for(const table of tables.value){
      const listing=await request('/api/table/'+table.key,{cookie:admin});
      assert(listing.status===200&&Array.isArray(listing.value),`Table ${table.key} failed to load`);
      const structure=await request('/api/schema/'+table.key,{cookie:admin});
      assert(structure.status===200&&structure.value.columns.length>0,`Schema ${table.key} failed to load`);
    }
    const schema=await request('/api/schema/policy',{cookie:admin});assert(schema.status===200&&schema.value.columns.some(x=>x.column_name==='customer_id'&&x.references_table==='customer'),'Foreign key missing in schema GUI');
    const scoped=await request('/api/table/policy',{cookie:customer});assert(scoped.status===200&&scoped.value.length===2&&scoped.value.every(x=>x.customer_id===1),'Customer policy isolation failed');
    const denied=await request('/api/table/claim',{cookie:customer,method:'POST',body:{policy_id:2,claim_amount:100,description:'Unauthorized test'}});assert(denied.status===403,'Customer filed claim on another policy');
    const agentRows=await request('/api/table/agent_assignment',{cookie:agent});assert(agentRows.status===200&&agentRows.value.every(x=>x.agent_id===1),'Agent assignments not scoped');
    const agentCustomer=await request('/api/table/customer',{cookie:agent});assert(agentCustomer.status===200&&agentCustomer.value.every(x=>[1,3].includes(x.customer_id)),'Agent customers not scoped');
    const underwriterDenied=await request('/api/table/policy/4',{cookie:underwriter,method:'PATCH',body:{status:'Rejected'}});assert(underwriterDenied.status===403,'Underwriter changed another underwriter policy');
    const investigatorRows=await request('/api/table/investigation',{cookie:investigator});assert(investigatorRows.status===200&&investigatorRows.value.every(x=>x.investigator_id===1),'Investigator records not scoped');
    const hiddenReport=await request('/api/reports',{cookie:customer});assert(hiddenReport.status===403,'Customer accessed global reports');
    const noAgentReport=await request('/api/reports',{cookie:agent});assert(noAgentReport.status===403,'Agent accessed global reports');
    const report=await request('/api/reports',{cookie:admin});assert(report.status===200&&report.value.types.length===4,'Reports failed');
    const receipt=await request('/api/receipts/1',{cookie:customer});assert(receipt.status===200&&receipt.value.includes('RCT-1001'),'Receipt failed');
    const wrongReceipt=await request('/api/receipts/2',{cookie:customer});assert(wrongReceipt.status===404,'Customer accessed another receipt');
    const claim=await request('/api/table/claim',{cookie:customer,method:'POST',body:{policy_id:3,claim_amount:1100,description:'Temporary API verification claim'}});
    assert(claim.status===201,'Customer claim creation failed: '+JSON.stringify(claim.value));claimId=claim.value.claim_id;
    const form=new FormData();form.set('document_type','Verification');form.set('file',new Blob(['%PDF-1.4\n%%EOF'],{type:'application/pdf'}),'verify.pdf');
    const upload=await request(`/api/claims/${claimId}/documents`,{cookie:customer,method:'POST',form});
    assert(upload.status===201&&upload.value.has_file,'Claim file upload failed: '+JSON.stringify(upload.value));
    const download=await request(`/api/documents/${upload.value.document_id}/download`,{cookie:customer});
    assert(download.status===200&&download.value.includes('%PDF-1.4'),'Claim file download failed');
    const otherFile=await request(`/api/documents/${upload.value.document_id}/download`,{cookie:investigator});
    assert(otherFile.status===404,'Unassigned investigator downloaded document');
    const premature=await request(`/api/table/claim/${claimId}`,{cookie:underwriter,method:'PATCH',body:{status:'Approved'}});
    assert(premature.status===400,'Underwriter approved a claim without investigation');
    const investigation=await request('/api/table/investigation',{cookie:admin,method:'POST',body:{claim_id:claimId,investigator_id:1,findings:'Verification claim checked',recommendation:'Approve'}});
    assert(investigation.status===201,'Investigator assignment failed');investigationId=investigation.value.investigation_id;
    const update=await request(`/api/table/investigation/${investigationId}`,{cookie:investigator,method:'PATCH',body:{findings:'Evidence confirmed'}});
    assert(update.status===200&&update.value.findings==='Evidence confirmed','Investigator update failed');
    const approval=await request(`/api/table/claim/${claimId}`,{cookie:underwriter,method:'PATCH',body:{status:'Approved'}});
    assert(approval.status===200&&approval.value.status==='Approved','Underwriter approval failed');
    const settlement=await request(`/api/table/claim/${claimId}`,{cookie:underwriter,method:'PATCH',body:{status:'Settled',settlement_amount:1000}});
    assert(settlement.status===200&&settlement.value.status==='Settled','Claim settlement failed');
  }finally{
    if(investigationId){const result=await request(`/api/table/investigation/${investigationId}`,{cookie:admin,method:'DELETE'});if(result.status!==200)console.error('Temporary investigation cleanup failed:',result);}
    if(claimId){const result=await request(`/api/table/claim/${claimId}`,{cookie:admin,method:'DELETE'});if(result.status!==200)console.error('Temporary claim cleanup failed:',result);}
  }
  console.log(`API verification passed: ${checks} checks.`);
}
main().catch(e=>{console.error(e);process.exit(1);});
