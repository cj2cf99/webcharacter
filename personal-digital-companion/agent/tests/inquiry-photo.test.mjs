import assert from 'node:assert/strict';
import test from 'node:test';
import {handleCompanion} from '../host/subscriptions.mjs';
import {mainSiteRecordPhoto} from '../host/record-photo.mjs';
import {uploadInquiryPhoto,missingRows} from '../../desktop/inquiry-input.mjs';

test('绯月上传 API 经授权固定调用随手记图库，原图、原名与服务端回执一致',async()=>{
  const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3]);
  const file={kind:'image',name:'附件.png',data:'data:image/jpeg;base64,/9g=',originalBytes:bytes};
  const url='https://fixture.test/photos/image.png',gallery=[];
  const env={COMPANION_DB:{},COMPANION_HOST:{uploadRecordPhoto:(...args)=>mainSiteRecordPhoto(async req=>{
    assert.equal(new URL(req.url).pathname,'/api/records/photos');
    assert.equal(req.headers.get('Content-Type'),'image/png');
    assert.equal(decodeURIComponent(req.headers.get('X-Photo-Name')),file.name);
    gallery.push(new Uint8Array(await req.arrayBuffer()));
    return Response.json({name:'保存名.png',url},{status:201});
  },{},...args)}};
  const request=(path,opts)=>handleCompanion(new Request('https://test.invalid/api/companion'+path.slice(4),opts),env,'owner',false);
  const cache=new Map();
  assert.equal(await uploadInquiryPhoto(file,request,cache),url);
  assert.equal(await uploadInquiryPhoto(file,request,cache),url);
  assert.deepEqual(gallery,[bytes]);
  const uri='https://test.invalid/api/companion/records/photos';
  assert.equal((await handleCompanion(new Request(uri,{method:'POST'}),env,null,false)).status,403);
  assert.equal((await handleCompanion(new Request(uri,{method:'POST',headers:{Origin:'https://other.test'}}),env,'owner',false)).status,403);
  assert.equal((await request('/api/records/photos',{method:'POST',body:'text'})).status,400);
  assert.equal((await request('/api/records/photos',{method:'POST',headers:{'Content-Type':'image/png','Content-Length':String(9*1024*1024)},body:bytes})).status,413);
});
test('同名字段按行保留任务归属，同时兼容旧版缺项回执',()=>{
  const rows=missingRows([{type:'reminders.create',task:'A',field:'deadline',question:'哪天？'},
    {type:'reminders.create',task:'B',question:'请填写日期'},{type:'records.create',question:'还缺什么信息？'}]);
  assert.deepEqual(rows.map(r=>[r.task,r.group]),[['A','deadline'],['B','deadline'],['随手记 3',null]]);
});
