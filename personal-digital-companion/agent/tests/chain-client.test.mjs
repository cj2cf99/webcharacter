import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createChainClient} from '../../desktop/chain-client.mjs';
import {chainDetail} from '../../desktop/chain-dialogs.mjs';
const device='pc-12345678-1234-4123-8123-123456789abc';
function setup(t){const profile=mkdtempSync(join(tmpdir(),'chain-client-'));t.after(()=>rmSync(profile,{recursive:true}));return profile;}
test('DC01：丢失领取回执后重开只重传原请求，准备本地记录后执行',async t=>{
  const profile=setup(t),bodies=[],order=[];let lost=true,runs=0;
  const options={profile,deviceId:device,canStart:()=>true,executor:{prepare(){order.push('prepare');}},
    request:async(_path,options)=>{const body=JSON.parse(options.body);bodies.push(body);if(lost){lost=false;throw new Error('offline');}
      return Response.json({claimed:true,claimReceipt:{request_id:body.request_id,task:{task_id:'one',target_device_id:device}}});},
    executeClaimed:async()=>{order.push('execute');runs++;return {acknowledged:true};}};
  let client=createChainClient(options);
  await assert.rejects(client.claim({task_id:'one'}),/offline/);assert.equal(runs,0);
  const id=client.pending()[0].request_id;
  client=createChainClient(options);await client.resume(id);
  assert.deepEqual(bodies[0],bodies[1]);assert.deepEqual(order,['prepare','execute']);assert.equal(runs,1);assert.equal(client.pending().length,0);
});
test('DC02：force丢失回执保留new_task_id，不得另造新轮；执行错误保留确认回执',async t=>{
  const profile=setup(t);let posts=0,receipt;
  const client=createChainClient({profile,deviceId:device,canStart:()=>true,executor:{prepare(){}},
    request:async(_url,options)=>{posts++;const body=JSON.parse(options.body);receipt={request_id:body.request_id,task:{task_id:body.new_task_id,target_device_id:device}};
      return Response.json({acknowledged:true,claimReceipt:receipt});},executeClaimed:async()=>{throw new Error('interrupted');}});
  const node={node_id:'node',current_task:{task_id:'old'}};
  await assert.rejects(client.decide('group',node,'force'),/interrupted/);
  assert.throws(()=>client.decide('group',node,'force'),/待确认/);
  await assert.rejects(client.resume(client.pending()[0].request_id),/interrupted/);
  assert.equal(posts,1);assert.equal(client.pending().length,1);
});
test('DC03：错误领取回执不执行，已满不发送新领取',async t=>{
  const profile=setup(t);let allowed=true,posts=0,runs=0;
  const client=createChainClient({profile,deviceId:device,canStart:()=>true,canAcquire:()=>allowed,executor:{prepare(){}},
    request:async()=>{posts++;return Response.json({claimed:true,claimReceipt:{request_id:'wrong',task:{task_id:'one',target_device_id:device}}});},executeClaimed:async()=>runs++});
  await assert.rejects(client.claim({task_id:'one'}),/回执不一致/);assert.equal(runs,0);
  allowed=false;await assert.rejects(client.claim({task_id:'two'}),/名额已满/);assert.equal(posts,1);
});
test('DC04：满额仍能停止或跳过，明确拒绝不遗留错误操作',async t=>{
  const profile=setup(t);let reject=false,posts=0;
  const client=createChainClient({profile,deviceId:device,canStart:()=>true,canAcquire:()=>false,executor:{prepare(){}},executeClaimed:async()=>{},
    request:async(_url,options)=>{posts++;return reject?Response.json({error:{message:'旧轮'}},{status:409}):Response.json({acknowledged:true,claimReceipt:null,operation:{request_id:JSON.parse(options.body).request_id}});}});
  await client.stop('group');await client.decide('group',{node_id:'node',current_task:{task_id:'one'}},'skip');
  reject=true;await assert.rejects(client.stop('group'),/旧轮/);assert.equal(posts,3);assert.equal(client.pending().length,0);
});
test('DC05：全链文字包含前置、终端、原因及JST切换备注',()=>{
  const detail=chainDetail({status:'ACTIVE',held_count:2,nodes:[{node_id:'a',key:'a',current_task:{type:'mock',status:'RUNNING',target_device_id:device},reasons:{claim:[{message:'两个名额已满'}]}}],
    history:[{action:'force',created_at:'2026-11-18T00:00:00Z',from_device_id:'homepc',to_device_id:'laptop'}]});
  for(const text of ['2/2','RUNNING','两个名额已满','homepc → laptop','JST'])assert.ok(detail.includes(text));
});
