import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createNewsBriefing} from '../../desktop/news-briefing.mjs';
import {conversationRoute} from '../../desktop/conversation-routing.mjs';

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
    assert.match(news.latest().text,/JST/);
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
