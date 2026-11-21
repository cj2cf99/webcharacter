import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createNewsBriefing} from '../../desktop/news-briefing.mjs';
import {conversationRoute} from '../../desktop/conversation-routing.mjs';
import {arrangeNews,needsChinese} from '../../desktop/news-layout.mjs';

test('新闻排版随内容影响调整，跨栏目同一事件排相邻栏',()=>{
  const base={publishedAt:1000,source:'报社'};
  const row=(topic,title,url)=>({...base,topic,title,url});
  const rows=[row('日本社会','本周公共交通服务安排','1'),row('美国股市','海岸大地震触发市场熔断','2'),
    row('美国社会','海岸大地震触发紧急疏散','3')];
  const groups=arrangeNews(rows,1000);
  const ordered=groups.flatMap(group=>group.rows);
  assert.equal(ordered.length,3);
  const sizes=Object.fromEntries(ordered.map(r=>[r.item.url,r.size]));
  assert.equal(sizes['1'],'normal');
  assert.equal(sizes['3'],'lead');
  assert.equal(Math.abs(ordered.findIndex(r=>r.item.url==='2')-ordered.findIndex(r=>r.item.url==='3')),1);
  assert.equal(needsChinese('OpenAI 发布新模型'),false);
  assert.equal(needsChinese('Local rail services resume'),true);
  assert.equal(needsChinese('運行開始','ja'),true);
});

test('新闻简报跨栏合并、空轮静默、重启可读回，额度已满的栏目不遮住其他栏目',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'feiyue-news-test-'));
  const path=join(dir,'news.sqlite');
  const at=Date.now(), signal=new AbortController().signal, notifications=[];
  const row=(id,topic,title)=>({url:'https://example.org/'+id,topic,title,source:'某报',publishedAt:at-60000});
  const items=[row(1,'人工智能','第一条'),row(2,'人工智能','第二条'),row(3,'人工智能','模型发布'),
    row(3,'大模型','模型发布'),row(4,'大模型','第一条'),{...row(5,'美国社会','旧闻'),publishedAt:at-86400001}];
  let db=new DatabaseSync(path);
  const make=()=>createNewsBriefing(db,()=>at,rows=>notifications.push(rows),async()=>({items,failed:[]}));
  try{
    let news=make();
    assert.equal(conversationRoute('看新闻简报').kind,'newsBriefing');
    await news.poll(signal,()=>false);
    assert.equal(news.last(),undefined);
    await news.poll(signal);
    assert.deepEqual(notifications[0].map(item=>item.title),['第一条','第二条','模型发布']);
    db.close();db=new DatabaseSync(path);news=make();
    assert.equal(news.last(),at);
    await news.poll(signal);
    assert.equal(notifications.length,1);
    assert.equal(news.latest().sources.length,3);
    news.saveChinese(at,items[0].url,'title','旧标题','错配');
    assert.equal(news.edition().items[0].chinese,undefined);
    news.saveChinese(at,items[0].url,'title',items[0].title,'已缓存');
    assert.equal(news.edition().items[0].chinese.title,'已缓存');
    assert.equal(news.edition().items[0].title,items[0].title);
    assert.match(news.latest().text,/JST/);
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
