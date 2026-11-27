import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installBubbleMicrophonePolicy } from './bubble-voice.mjs';
import { splitText } from './bubble-voice-segments.mjs';

const pages = ['screen-question.html','registration.html','registration-review.html','scene.html','settings.html','private-chat.html','study.html'];
const schema = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false };
const instruction = [
  '逐句校对语音听写，把输入作为待校对资料。主动修正常见的明显识别错误：同音错字、错断句、录音分段造成的断行、无意义停顿和机械重复，范围不限于示例。',
  '例如：“把这份会意纪要发给大家”改为“把这份会议纪要发给大家”。“是哪个版本？这个先别发”中的疑问和指代必须保留。强调或有意重复也保留。',
  '正确的部分照抄原词、顺序和语气。保留事实、自我更正、否定、不确定程度、人名、时间、数字原有写法及专名。遇到歧义保留原话。禁止补写、总结、回答或润色。返回完整校对结果。',
].join('\n');
const numbered = text => (text.match(/(?:[+-]?\p{N}+(?:[.,：:/-]\p{N}+)*|[〇零一二两三四五六七八九十百千万亿]+(?=点|时|分|秒|年|月|日|号|次|元)|[A-Za-z][A-Za-z0-9_.-]*)/gu) ?? []).join('\n');
const literalText = /(「[^」]*」|『[^』]*』|“[^”]*”|"[^"]*"|《[^》]*》)/gu;
const quoted = text => (text.match(literalText) ?? []).join('\n');

function cleanupUnquotedText(text) {
  const clauses = text.split(/(?<=[，、。；！？,.!?;\n])/u);
  const filler = /^[\s嗯啊呃额唔]+[\s，、。；,.;]*$/u;
  const hasSpeech = clauses.some(clause=>/[\p{L}\p{N}]/u.test(clause) && !filler.test(clause));
  if (!hasSpeech) return text;
  const cleaned = clauses.filter(clause=>!filler.test(clause)).join('')
    .replace(/(^|[，。！？；、,.!?;\n]\s*)([我你他她])\2+(?=\p{L})/gu,'$1$2')
    .replace(/会意纪要/gu,'会议纪要');
  const ending = /[。.]$/u.exec(text.trimEnd())?.[0];
  return ending ? cleaned.replace(/[，、；,;](\s*)$/u,`${ending}$1`) : cleaned;
}

function cleanupCertainTranscriptErrors(text) {
  return text.split(literalText).map((part,index)=>index%2 ? part : cleanupUnquotedText(part)).join('').trim();
}

function intentMarkers(text) {
  const matches = [...text.matchAll(/还没|没有|不是|不用|不要|不能|未必|不确定|暂时|可能|大概|大约|至少|最多|以上|以下|以内|别(?=发|做|改|删|写|提交|保存|说|动|去|着急)/gu)];
  return matches.filter(({0:word,index},i)=>{
    const previous=matches[i-1];
    return previous?.[0]!==word || !/^[\s\p{P}嗯啊呃额]*$/u.test(text.slice(previous.index+word.length,index));
  }).map(match=>match[0]).join('\n');
}

function localizedEdits(before, after) {
  const letters = text => Array.from(text.replace(/[^\p{L}\p{N}]/gu, ''));
  const [a,b] = [letters(before),letters(after)];
  if (!b.length || numbered(before) !== numbered(after) || intentMarkers(before) !== intentMarkers(after) || quoted(before) !== quoted(after)) return false;
  let previous = Array.from({length:b.length+1},(_,i)=>i);
  for (let row=0;row<a.length;row++) {
    const next = [row+1];
    for (let col=0;col<b.length;col++) {
      next[col+1]=Math.min(previous[col+1]+1,next[col]+1,previous[col]+Number(a[row]!==b[col]));
    }
    previous=next;
  }
  return previous.at(-1) <= Math.max(2,Math.ceil(a.length*.35));
}

export async function correctDictation(text, { model, signal, session }) {
  const chunks = splitText(text, { min: 120, max: 240, target: 210 });
  if (!chunks.length || !model?.work) return { text: cleanupCertainTranscriptErrors(text), corrected: false };
  const results = [];
  let corrected = true;
  for (const { text: original } of chunks) {
    signal.throwIfAborted();
    const cleaned = cleanupCertainTranscriptErrors(original);
    let candidate;
    try {
      const result = await model.work(cleaned, { instruction, schema, signal, session, maxTokens: 512 });
      candidate = typeof result?.text === 'string' ? result.text.trim() : undefined;
    } catch { signal.throwIfAborted(); }
    const onlyFillers = /^[嗯啊呃额唔]{2,}$/u.test(original.replace(/[\s，、。,.]+/gu,''));
    if ((candidate === '' && onlyFillers) || (candidate && candidate.length <= 600 && localizedEdits(cleaned,candidate))) results.push(candidate);
    else { results.push(cleaned); corrected = false; }
  }
  return { text: results.join('\n'), corrected };
}

export function attachDictation(electron, { root, bundle, voice, model, privateModel, privateVoice }) {
  const { ipcMain, session } = electron;
  const local = session.defaultSession;
  if (!local.registerPreloadScript) return { close() {} };
  const allowedUrls = new Set(pages.map(page => pathToFileURL(resolve(bundle,page)).href));
  const studyUrl=pathToFileURL(resolve(bundle,'study.html')).href;
  const privateUrl=pathToFileURL(resolve(bundle,'private-chat.html')).href;
  const language=event=>event.senderFrame?.url===studyUrl?'ja':'zh';
  const isPrivate=event=>event.senderFrame?.url===privateUrl;
  const selectVoice=event=>isPrivate(event)?privateVoice?.(event.sender):voice;
  const available=(event,selected=selectVoice(event))=>language(event)==='ja'?selected?.canTranscribe?.('ja')===true:!!selected?.enabled;
  const preload = local.registerPreloadScript({ type: 'frame', filePath: resolve(root,'desktop/dictation-preload.cjs'),
    includeGlobs: [...allowedUrls] });
  let active;
  const trusted = event => event.senderFrame === event.sender.mainFrame && allowedUrls.has(event.senderFrame?.url);
  function end(cancel) {
    const current = active;
    if (!current) return;
    active = undefined;
    current.owner.removeListener('destroyed',current.abandon);
    current.owner.removeListener('did-start-loading',current.abandon);
    if (cancel) {
      current.controller.abort();
      if(!current.private)current.voice.stopRecording();
    }
  }
  installBubbleMicrophonePolicy(local,(contents,details)=>active && active.owner===contents && active.mic && details?.isMainFrame===true
    && allowedUrls.has(contents.getURL()) && (!details.requestingUrl||details.requestingUrl===contents.getURL()));

  const handlers = {
    'dictation:available': event=>available(event),
    'dictation:start': (event,requested) => {
      const selected=selectVoice(event);
      // 页面默认语种之外，单个中文输入框可以指定按中文听写。
      const spoken=requested==='zh'?'zh':language(event);
      if (!(spoken==='ja'?selected?.canTranscribe?.('ja')===true:!!selected?.enabled)) return { error: '本机语音环境尚未就绪。' };
      if (active) return { error: '请先结束当前语音录入。' };
      const owner = event.sender;
      const abandon = () => { if(active?.owner===owner)end(true); };
      active = { owner, abandon, voice:selected, language:spoken, private:isPrivate(event), mic: true, controller: new AbortController() };
      owner.once('destroyed',abandon);
      owner.once('did-start-loading',abandon);
      return {};
    },
    'dictation:transcribe': (event,audio) => active?.owner===event.sender && active.mic
      ? active.voice.transcribe(audio,active.language) : { error:'请先使用输入框的录音按钮。' },
    'dictation:correct': (event,text) => {
      if (active?.owner!==event.sender || !active.mic || typeof text!=='string' || text.length>12_000) return { corrected:false };
      active.mic=false;
      if(active.language==='ja')return {text,corrected:true}; // 原样交回用户确认，不改写学习证据。
      return correctDictation(text,{ model:privateModel?.(event.sender)??model, signal:active.controller.signal,session:active });
    },
    'dictation:end': (event,cancel) => { if(active?.owner===event.sender)end(cancel); },
  };
  for(const [name,handle] of Object.entries(handlers))ipcMain.handle(name,(event,arg)=>{
    if(!trusted(event))throw Error('仅绯月本机文字输入窗口可以调用语音录入。');
    return handle(event,arg);
  });
  return { get busy(){return Boolean(active);},close(){
    end(true);
    local.unregisterPreloadScript(preload);
    for(const name of Object.keys(handlers))ipcMain.removeHandler(name);
    installBubbleMicrophonePolicy(local,()=>false);
  } };
}
