import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchQueries } from './subscriber-profiles.mjs';
import { scoreJob, isRecommended } from './profile-scoring.mjs';

test('every profile and all twelve titles reach discovery, including beyond fifty queries',()=>{
 const profiles=Array.from({length:60},(_,i)=>({roles:Array.from({length:12},(_,j)=>`Profession ${i} title ${j}`),location:'Amman',work_modes:['On-site']}));
 assert.equal(buildSearchQueries(profiles).length,720);
});
test('searches keep each location and work preference, while deduplicating identical requests',()=>{
 const p={roles:['Nurse'],location:'Amman',work_modes:['On-site']};
 assert.equal(buildSearchQueries([p,p,{...p,location:'London'}]).length,2);
});
for(const role of ['Nurse','Accountant','Teacher','Software Engineer']) {
 test(`${role} receives a direct title match without needing marketing skills`,()=>{
  const profile={roles:[role],location:'Amman',work_modes:['On-site']};
  assert.equal(isRecommended(scoreJob({title:role,location:'Amman, Jordan',mode:'onsite'},profile)),true);
  assert.equal(isRecommended(scoreJob({title:'Growth Manager',location:'Amman',mode:'onsite'},profile)),false);
 });
}
test('remote geography, seniority and personal exclusions are respected',()=>{
 const profile={roles:['Engineer'],location:'Jordan',work_modes:['Remote'],seniority:['Entry']};
 assert.equal(isRecommended(scoreJob({title:'Engineer',location:'United States',mode:'remote'},profile)),false);
 assert.equal(isRecommended(scoreJob({title:'Senior Engineer',location:'Worldwide',mode:'remote'},profile)),false);
 assert.equal(isRecommended(scoreJob({title:'Junior Engineer',location:'Worldwide',mode:'remote'},profile)),true);
 const job={title:'Engineer',company:'Acme',location:'Worldwide',mode:'remote'};
 assert.equal(isRecommended(scoreJob(job,{...profile,excluded_companies:['Acme']})),false);
 assert.equal(isRecommended(scoreJob(job,profile)),true);
});
