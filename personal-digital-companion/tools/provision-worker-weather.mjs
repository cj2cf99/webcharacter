import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {access,readFile} from 'node:fs/promises';
import {qweatherAuth, readWeatherCredential} from '../desktop/weather-credentials.mjs';

async function stage(config, cli) {
  const configText=await readFile(config,'utf8');
  if (!/"name"\s*:\s*"subscriptions-api"/.test(configText)) throw Error('目标 Worker 不符合要求');
  await access(cli);
  const value = await readWeatherCredential();
  if (!value) throw new Error('未找到授权的本机和风加密凭据');
  qweatherAuth(value);
  const variables = {
    QWEATHER_HOST: value.host, QWEATHER_DEVELOPER_ID: value.developerId, QWEATHER_PROJECT_ID: value.projectId,
    QWEATHER_CREDENTIAL_ID: value.credentialId, QWEATHER_PRIVATE_KEY: value.privatePem,
  };
  const child = spawn(process.execPath, [cli, 'versions', 'secret', 'bulk', '--config', config, '--name', 'subscriptions-api'],
    {stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true});
  child.stdin.on('error', () => {});
  child.stdin.end(JSON.stringify(variables));
  const code = await new Promise((done, reject) => {child.once('error', reject); child.once('exit', done);});
  if (code) throw new Error('Worker 版本的天气凭据写入失败');
}
try {
  const [mode, config, cli] = process.argv.slice(2);
  if (mode !== '--stage-approved-release' || !config || !cli || process.argv.length !== 5) {
    throw new Error('仅用于已明确批准的发布。需指定 subscriptions-api 的 Wrangler 配置。');
  }
  await stage(resolve(config), resolve(cli));
} catch (error) {
  console.error('天气凭据发布准备失败。请核实已授权的 Windows 账户、本机已配置凭据和 Wrangler。');
  process.exitCode = 1;
}
