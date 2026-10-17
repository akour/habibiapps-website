import {test} from 'node:test';
import assert from 'node:assert/strict';

test('delivery freezes its payload, records empty digests, and skips a repeated daily run', async()=>{
 process.env.SUPABASE_URL='https://database.invalid';
 process.env.SUPABASE_SERVICE_ROLE_KEY='test';
 process.env.RESEND_API_KEY='test';
 const original=globalThis.fetch;
 let saved=null, sent=0;
 globalThis.fetch=async(url,options={})=>{
  const path=new URL(url).pathname;
  let result=[];
  if(path==='/emails') {sent++;assert.match(options.headers['Idempotency-Key'],/^digest\/user-1\//);return Response.json({id:'email-1'});}
  if(path.endsWith('/subscriptions'))result=[{user_id:'user-1'}];
  if(path.endsWith('/profiles'))result=[{user_id:'user-1',email:'test@example.invalid',roles:['Nonexistent test profession'],email_frequency:'daily'}];
  if(path.endsWith('/digest_runs')){
   if(options.method==='POST')saved={...JSON.parse(options.body),sent_at:null};
   if(options.method==='PATCH')Object.assign(saved,JSON.parse(options.body));
   result=saved?[saved]:[];
  }
  return Response.json(result);
 };
 try{
  await import('./send-subscriber-digests.mjs?first');
  assert.equal(sent,1);assert.ok(saved.sent_at);assert.deepEqual(saved.job_urls,[]);
  await import('./send-subscriber-digests.mjs?second');
  assert.equal(sent,1);
 }finally{globalThis.fetch=original;}
});
