import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {findAgyPath, checkAgyAvailable, runAgyPrompt, isAgyInstalled} from '../../desktop/agy-cli-client.mjs';
import {createAgyCliModel, testAgyCliPipeline} from '../../desktop/agy-local-model.mjs';

describe('AGY CLI 本地推理替代模块测试', () => {
  it('正确检测 AGY CLI 路径与安装状态', () => {
    const path = findAgyPath();
    assert.ok(typeof path === 'string' && path.length > 0, '应返回有效的可执行文件路径');
    const installed = isAgyInstalled();
    assert.ok(typeof installed === 'boolean', '应返回布尔值');
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
});
