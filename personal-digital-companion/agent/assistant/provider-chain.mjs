import {CLOUDFLARE_MODEL} from './cloudflare.mjs';

const fiveHours=5*60*60*1000;
const paidProviders=new Set(['sakura','openai','deepseek']);
const probe={version:1,route:'text',maxOutputTokens:128,messages:[{role:'user',content:'请直接恢复你好，我在'}]};
const validCode=new Set(['NOT_CONFIGURED','TIMEOUT','RATE_LIMITED','INVALID_REQUEST','CANCELLED','INVALID_RESPONSE',
  'INVALID_AI_RESPONSE','EMPTY_RESPONSE','UPSTREAM_ERROR','PROVIDER_ERROR','CREDENTIAL_REJECTED','ACCOUNT_UNAVAILABLE',
  'PROVIDER_BUSY','QUOTA_EXHAUSTED','MODEL_UNAVAILABLE','CONFIG_ERROR','AI_UNAVAILABLE','PROBE_MISMATCH']);
const modelId=value=>typeof value==='string'&&/^[@a-z0-9_./:-]{1,96}$/i.test(value);
const fault=code=>Object.assign(Error(code),{code});

export async function runProviderChain({env,ownerId,signal,prompt,createAiClient,parse,heartbeat=false}){
  const pool=env.REGISTRATION_AI, db=env.DB;
  const ai={trace_id:crypto.randomUUID(),attempts:[]};
  const failure=code=>({code,ai});
  if(heartbeat&&!pool)return failure('NOT_CONFIGURED');
  let providers;
  let saved;
  try{
    const values=pool?await pool.providers():['cloudflare'];
    if(!Array.isArray(values)||!values.length||values.length>16||!values.every(p=>typeof p==='string'&&/^[a-z][a-z0-9-]{0,31}$/.test(p)))throw Error();
    providers=[...new Set(values)];
  }catch{return failure('NOT_CONFIGURED');}

  async function cooling(provider){
    return pool&&await db.prepare('SELECT until_ms FROM ai_route_cooldown WHERE owner_id=? AND provider=? AND until_ms>?')
      .bind(ownerId,provider,Date.now()).first();
  }
  async function attempt(provider,stage){
    if(signal.aborted||await cooling(provider)||signal.aborted)return null;
    const start=Date.now();
    let code='OK',value,model,upstream_status,provider_code;
    try{
      const result=pool?await pool.attempt(provider,stage==='probe'?probe:prompt):
        {value:await createAiClient(env).generate(prompt,{signal,enableThinking:false})};
      const reported=result?.value?.model??result?.model;
      if(modelId(reported))model=reported;
      if(Number.isInteger(result?.upstream_status)&&result.upstream_status>=300&&result.upstream_status<=599)upstream_status=result.upstream_status;
      if(Number.isInteger(result?.provider_code))provider_code=result.provider_code;
      if(result?.error)throw fault(result.error);
      const generated=result?.value;
      if(generated?.provider!==provider||!model||(!pool&&model!==CLOUDFLARE_MODEL))throw fault('INVALID_AI_RESPONSE');
      if(stage==='probe'){
        if(generated.finishReason==='length'||typeof generated.text!=='string'||generated.text.trim()!=='你好，我在')throw fault('PROBE_MISMATCH');
        value=provider;
      }else value=parse(generated);
    }catch(error){code=validCode.has(error?.code)?error.code:'AI_UNAVAILABLE';}
    // 网关探针独立于提问。即使用户已取消，已发出的探针仍可能返回明确的线路故障。
    const confirmedProbeFailure=stage==='probe'&&code!=='OK'&&code!=='CANCELLED';
    if(signal.aborted&&!confirmedProbeFailure)return null;
    const end=Date.now(),row={provider,stage,model,code,at:end,duration_ms:Math.max(0,end-start),upstream_status,provider_code};
    if(pool&&code!=='OK'){
      await db.prepare(`INSERT INTO ai_route_cooldown(owner_id,provider,until_ms) VALUES(?,?,?)
        ON CONFLICT(owner_id,provider) DO UPDATE SET until_ms=MAX(ai_route_cooldown.until_ms,excluded.until_ms)`)
        .bind(ownerId,provider,end+fiveHours).run();
    }else if(pool&&stage==='probe'){
      await db.prepare('DELETE FROM ai_route_cooldown WHERE owner_id=? AND provider=? AND until_ms<=?')
        .bind(ownerId,provider,start).run();
    }
    ai.attempts.push(row);
    if(pool)console.info({event:'companion_ai_attempt',trace_id:ai.trace_id,...row});
    return code==='OK'?value:null;
  }
  async function remember(provider,value){
    // 心跳只在候选仍可用且前台未改变选线时更新首选，两个条件和写入在同一条 SQL 内完成。
    if(heartbeat){
      const now=Date.now();
      const result=await db.prepare(`INSERT INTO registration_ai_preference(owner_id,provider,expires_at)
        SELECT ?,?,? WHERE NOT EXISTS (
          SELECT 1 FROM ai_route_cooldown WHERE owner_id=? AND provider=? AND until_ms>?)
        ON CONFLICT(owner_id) DO UPDATE SET provider=excluded.provider,expires_at=CASE
          WHEN registration_ai_preference.provider=excluded.provider AND registration_ai_preference.expires_at>?
          THEN registration_ai_preference.expires_at ELSE excluded.expires_at END
        WHERE registration_ai_preference.provider=? AND registration_ai_preference.expires_at=?`)
        .bind(ownerId,provider,now+3600000,ownerId,provider,now,now,saved?.provider??null,saved?.expires_at??null).run();
      if(result.meta.changes)return {value,ai};
      if(await cooling(provider))return null;
      return {value:{status:'superseded'},ai};
    }
    if(pool)try{
      const now=Date.now();
      await db.prepare(`INSERT INTO registration_ai_preference(owner_id,provider,expires_at) VALUES(?,?,?)
        ON CONFLICT(owner_id) DO UPDATE SET provider=excluded.provider,expires_at=excluded.expires_at
        WHERE registration_ai_preference.provider<>excluded.provider OR registration_ai_preference.expires_at<=?`)
        .bind(ownerId,provider,now+3600000,now).run();
    }catch{ai.preference_saved=false;}
    return {value,ai};
  }
  try{
    const cooldowns=new Map();
    if(pool){
      const [preference,blocked]=await Promise.all([
        db.prepare('SELECT provider,expires_at FROM registration_ai_preference WHERE owner_id=?').bind(ownerId).first(),
        db.prepare('SELECT provider,until_ms FROM ai_route_cooldown WHERE owner_id=?').bind(ownerId).all(),
      ]);
      for(const row of blocked.results)cooldowns.set(row.provider,row.until_ms);
      saved=preference;
      // 后台看上次实际选中的线路。收费首选即使已过期，也等真实提问重新选线。
      if(saved&&providers.includes(saved.provider)&&(heartbeat||saved.expires_at>Date.now())){
        ai.preferred_provider=saved.provider;
        providers=[saved.provider,...providers.filter(p=>p!==saved.provider)];
      }
    }
    const first=providers[0];
    if(heartbeat&&paidProviders.has(first))return {value:{status:'skipped_paid',provider:first},ai};
    if(heartbeat||!cooldowns.has(first)){
      providers.shift();
      const initial=await attempt(first,heartbeat?'probe':'request');
      if(initial){
        const selected=await remember(first,heartbeat?{status:'healthy',provider:first}:initial);
        if(selected)return selected;
      }
    }
    // 后台仅在免费候选耗尽后探测收费候选，两组内保留原链顺序。
    if(heartbeat)providers.sort((a,b)=>Number(paidProviders.has(a))-Number(paidProviders.has(b)));
    while(providers.length&&!signal.aborted){
      const batch=[];
      while(batch.length<3&&providers.length){
        if(heartbeat&&batch.length&&!paidProviders.has(batch[0])&&paidProviders.has(providers[0]))break;
        const p=providers.shift();
        if(!(cooldowns.get(p)>Date.now()))batch.push(p);
      }
      if(heartbeat&&paidProviders.has(batch[0])){
        const current=await db.prepare('SELECT provider,expires_at FROM registration_ai_preference WHERE owner_id=?').bind(ownerId).first();
        if(current?.provider!==saved?.provider||current?.expires_at!==saved?.expires_at)return {value:{status:'superseded'},ai};
      }
      // 各路仅收到固定探针。先返回正确问候的线路立即处理正文，其余探针并行收尾。
      const pending=new Map(batch.map(p=>[p,attempt(p,'probe').then(ready=>({p,ready}))]));
      const drained=Promise.allSettled(pending.values());
      try{
        while(pending.size&&!signal.aborted){
          const {p,ready}=await Promise.race(pending.values());
          pending.delete(p);
          if(!ready)continue;
          if(heartbeat){
            if(signal.aborted)break;
            const selected=await remember(p,{status:'switched',provider:p});
            if(selected)return selected;
            continue;
          }
          const value=await attempt(p,'request');
          if(value)return await remember(p,value);
        }
      }finally{
        const outcomes=await drained;
        if(outcomes.some(item=>item.status==='rejected'))throw Error('探测状态保存失败');
      }
    }
    if(signal.aborted)return failure('CANCELLED');
    if(!ai.attempts.length||(heartbeat&&ai.attempts.every(row=>row.code==='OK')))return failure('AI_COOLDOWN');
    return failure(ai.attempts.findLast(row=>!['OK','NOT_CONFIGURED'].includes(row.code))?.code??'NOT_CONFIGURED');
  }catch{return failure(signal.aborted?'CANCELLED':'AI_ROUTING_UNAVAILABLE');}
}
