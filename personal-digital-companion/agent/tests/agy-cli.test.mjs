import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  findAgyPath, checkAgyAvailable, runAgyPrompt, isAgyInstalled, standbyDir,
  RESOURCE_EXHAUSTED_COOLDOWN_MS, isAgyResourceExhausted, resetAgyResourceExhausted,
  setAgyResourceExhaustedCooldownMs, startAgyStandby, stopAgyStandby, createAgyConversation
} from '../../desktop/agy-cli-client.mjs';
import {createAgyCliModel, testAgyCliPipeline} from '../../desktop/agy-local-model.mjs';
import {agyVision} from '../../desktop/ai-gateway.mjs';

describe('AGY CLI 本地推理替代模块测试', () => {
  it('正确检测 AGY CLI 路径、WSL 隔离切换与安装状态', t => {
    const prevPath = process.env.FEIYUE_AGY_PATH;
    const prevDistro = process.env.FEIYUE_AGY_WSL_DISTRO;
    const prevBin = process.env.FEIYUE_AGY_WSL_BIN;
    t.after(() => {
      if (prevPath === undefined) delete process.env.FEIYUE_AGY_PATH; else process.env.FEIYUE_AGY_PATH = prevPath;
      if (prevDistro === undefined) delete process.env.FEIYUE_AGY_WSL_DISTRO; else process.env.FEIYUE_AGY_WSL_DISTRO = prevDistro;
      if (prevBin === undefined) delete process.env.FEIYUE_AGY_WSL_BIN; else process.env.FEIYUE_AGY_WSL_BIN = prevBin;
    });

    delete process.env.FEIYUE_AGY_PATH;
    process.env.FEIYUE_AGY_WSL_DISTRO = 'agy-wsl';
    process.env.FEIYUE_AGY_WSL_BIN = '/home/agy/.local/bin/agy';
    assert.equal(findAgyPath(), 'wsl://agy-wsl/home/agy/.local/bin/agy');
    assert.equal(isAgyInstalled(), true);

    process.env.FEIYUE_AGY_WSL_DISTRO = 'off';
    const localPath = findAgyPath();
    assert.ok(typeof localPath === 'string' && localPath.length > 0 && !localPath.startsWith('wsl://'), '关闭 WSL 后应返回本地路径');
    assert.ok(typeof isAgyInstalled() === 'boolean', '应返回布尔值');
    assert.ok(typeof standbyDir === 'string' && standbyDir.length > 0, '应导出有效工作目录');
  });

  it('createAgyCliModel 遵循本地模型接口规范', async () => {
    const logs = [];
    const model = createAgyCliModel({
      log: entry => logs.push(entry)
    });

    assert.equal(typeof model.start, 'function');
    assert.equal(typeof model.analyze, 'function');
    assert.equal(typeof model.work, 'function');
    assert.equal(typeof model.memory, 'function');
    assert.equal(typeof model.withWorkSession, 'function');
    assert.equal(typeof model.isBusy, 'function');
    assert.equal(typeof model.suspend, 'function');
    assert.equal(typeof model.resume, 'function');
    assert.equal(typeof model.close, 'function');
    assert.equal(typeof model.snapshot, 'function');
    assert.equal(model.reportsInference, true);
    assert.equal(model.canLoadTask(), true);

    const initialSnapshot = model.snapshot();
    assert.equal(initialSnapshot.state, 'idle');
    assert.equal(model.isBusy(), false);

    const preheat = await model.preheatConversation('chat');
    assert.equal(preheat.ready, true);
    assert.equal(preheat.size, 'cloud');

    assert.equal(await model.suspend(), true);
    model.resume();
    await model.close();
  });

  it('withWorkSession 正确调度任务', async () => {
    const model = createAgyCliModel();
    let executed = false;
    const result = await model.withWorkSession('session-1', null, async runner => {
      assert.equal(typeof runner, 'function');
      executed = true;
      return 'OK';
    });
    assert.equal(executed, true);
    assert.equal(result, 'OK');
  });

  it('报 RESOURCE_EXHAUSTED 后 20 分钟内直接跳过 AGY CLI、按失败对待且不记错误日志，期满恢复', async t => {
    assert.equal(RESOURCE_EXHAUSTED_COOLDOWN_MS, 20 * 60_000);
    const dir = mkdtempSync(join(tmpdir(), 'agy-exhausted-'));
    const countFile = join(dir, 'calls.txt');
    const modeFile = join(dir, 'mode.txt');
    const script = join(dir, 'exhausted-agy.mjs');
    writeFileSync(modeFile, 'exhausted', 'utf8');
    writeFileSync(script, `
import {appendFileSync, readFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
appendFileSync(${JSON.stringify(countFile)}, '1\\n');
const mode = readFileSync(${JSON.stringify(modeFile)}, 'utf8').trim();
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('test-1.0'); process.exit(0); }
if (args.includes('stream-json')) {
  console.log(JSON.stringify({event: 'init', conversation_id: 'c1'}));
  createInterface({input: process.stdin}).on('line', () => {
    const result = mode === 'exhausted'
      ? {status: 'ERROR', error: 'API Error: RESOURCE_EXHAUSTED'}
      : {status: 'SUCCESS', response: '恢复正常'};
    console.log(JSON.stringify({event: 'result', result}));
  });
} else {
  if (mode === 'exhausted') {
    console.log(JSON.stringify({status: 'ERROR', error: 'RESOURCE_EXHAUSTED'}));
  } else {
    console.log(JSON.stringify({status: 'SUCCESS', response: '恢复正常'}));
  }
}
`, 'utf8');

    const prevPath = process.env.FEIYUE_AGY_PATH;
    process.env.FEIYUE_AGY_PATH = script;
    setAgyResourceExhaustedCooldownMs(250);
    resetAgyResourceExhausted();
    t.after(() => {
      stopAgyStandby();
      resetAgyResourceExhausted();
      setAgyResourceExhaustedCooldownMs(RESOURCE_EXHAUSTED_COOLDOWN_MS);
      if (prevPath === undefined) delete process.env.FEIYUE_AGY_PATH; else process.env.FEIYUE_AGY_PATH = prevPath;
      rmSync(dir, {recursive: true, force: true});
    });

    const callCount = () => {
      try { return readFileSync(countFile, 'utf8').trim().split('\n').filter(Boolean).length; }
      catch { return 0; }
    };

    // 第 1 次真实调用触发 RESOURCE_EXHAUSTED
    const logs = [];
    const model = createAgyCliModel({log: entry => logs.push(entry)});
    t.after(() => model.close());

    const first = await model.analyze('你好', {hint: 'direct'});
    assert.equal(first.error, 'RESOURCE_EXHAUSTED');
    assert.equal(isAgyResourceExhausted(), true);
    const afterFirstCalls = callCount();
    assert.ok(afterFirstCalls >= 1);
    assert.equal(logs.length, 1, '首次真实触发 RESOURCE_EXHAUSTED 应保留该次错误日志');

    // 熔断期内：再次调用 analyze、work、runAgyPrompt、conversation.ask、startAgyStandby、agyVision 均不得访问 AGY CLI，也不新增错误日志
    startAgyStandby();
    const skippedAnalyze = await model.analyze('再来一句', {hint: 'direct'});
    assert.equal(skippedAnalyze.error, 'RESOURCE_EXHAUSTED');

    const skippedWork = await model.work('写点什么', {instruction: '测试'});
    assert.equal(skippedWork.error, 'RESOURCE_EXHAUSTED');

    const skippedPrompt = await runAgyPrompt({prompt: '直接测'});
    assert.equal(skippedPrompt.success, false);
    assert.equal(skippedPrompt.skipped, true);
    assert.equal(skippedPrompt.error, 'RESOURCE_EXHAUSTED');

    const conv = createAgyConversation();
    t.after(() => conv.close());
    const skippedConv = await conv.ask('会话测');
    assert.equal(skippedConv.result, null);
    assert.equal(skippedConv.skipped, true);

    let visionFbCalls = 0;
    const visionTempDir = join(dir, 'never-created');
    const vision = agyVision({
      tempDir: visionTempDir,
      fallback: async () => { visionFbCalls++; return {text: '云端视觉兜底'}; }
    });
    const skippedVision = await vision('图里是什么', {mime_type: 'image/png', data_base64: 'AAAA'});
    assert.deepEqual(skippedVision, {text: '云端视觉兜底'});
    assert.equal(visionFbCalls, 1);
    assert.deepEqual(await vision('图里是什么', []), {reason: 'AGY CLI 识图参数无效'});
    assert.equal(visionFbCalls, 1, '空图片参数在熔断期内也不应调用兜底视觉');
    assert.equal(existsSync(visionTempDir), false, '熔断期内识图不应创建临时目录或写图');

    assert.equal(callCount(), afterFirstCalls, '熔断期内不应再次启动或访问 AGY CLI');
    assert.equal(logs.length, 1, '熔断跳过时不应新增错误日志');

    // 熔断期内用户主动取消仍应按取消处理，不触发兜底
    const ac = new AbortController();
    ac.abort();
    const abortedAnalyze = await model.analyze('取消', {hint: 'direct', signal: ac.signal});
    assert.equal(abortedAnalyze.error, 'LOCAL_AI_STOPPED');
    await assert.rejects(() => model.work('取消工作', {instruction: '测试', signal: ac.signal}));
    await assert.rejects(() => vision('取消识图', {mime_type: 'image/png', data_base64: 'AAAA'}, ac.signal));

    // 熔断期内若有兜底，兜底失败时也绝不回退重试 AGY CLI，也不记 AGY 错误日志
    const fbLogs = [];
    let fbCalls = 0;
    const modelWithFb = createAgyCliModel({
      log: entry => fbLogs.push(entry),
      fallback: async () => { fbCalls++; return {success: false, error: 'DEEPSEEK_UNAVAILABLE'}; }
    });
    t.after(() => modelWithFb.close());
    const fbFail = await modelWithFb.work('带兜底', {instruction: '测试'});
    assert.equal(fbFail.error, 'RESOURCE_EXHAUSTED');
    assert.equal(fbCalls, 1);
    assert.equal(callCount(), afterFirstCalls, '兜底失败时同样不得在熔断期内重试 AGY CLI');
    assert.equal(fbLogs.length, 0, '熔断跳过时不记录 AGY 错误日志');

    // 等待熔断期满，切换脚本为正常响应后应恢复访问 AGY CLI
    writeFileSync(modeFile, 'ok', 'utf8');
    await new Promise(r => setTimeout(r, 300));
    assert.equal(isAgyResourceExhausted(), false);
    const recovered = await runAgyPrompt({prompt: '恢复测试'});
    assert.equal(recovered.success, true);
    assert.equal(recovered.response, '恢复正常');
    assert.ok(callCount() > afterFirstCalls);
  });
});
