// 从本地 PEM 导入，账户参数通过 FEIYUE_WEATHER_SETUP 传入。
import {createPublicKey, randomUUID} from 'node:crypto';
import {mkdir, readFile, rename, unlink, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {loadWeatherAuth, protectWeatherBytes, qweatherAuth, weatherCredentialPath} from '../desktop/weather-credentials.mjs';

let stage = '初始化 Windows 安全存储';
async function run() {
  if (process.platform !== 'win32') throw new Error('此导入器用于 Windows');
  if (process.argv.includes('--check')) {
    stage = '回读本机密文';
    if (!await loadWeatherAuth()) throw new Error('尚无本机天气凭据');
    console.log('本机天气凭据可解密，签名参数有效。');
    return;
  }
  stage = '读取并校验 Ed25519 密钥';
  const {host, developerId, projectId, credentialId, privatePath, publicPath} =
    JSON.parse(process.env.FEIYUE_WEATHER_SETUP ?? '{}');
  const privatePem = await readFile(privatePath, 'utf8');
  const config = {host, developerId, projectId, credentialId, privatePem};
  const {publicKey} = qweatherAuth(config);
  if (publicPath && !publicKey.equals(createPublicKey(await readFile(publicPath)))) throw new Error('公钥与私钥不匹配');
  stage = '系统加密';
  const plain = Buffer.from(JSON.stringify(config));
  const encrypted = await protectWeatherBytes(plain, true).finally(() => plain.fill(0));
  if (!Buffer.isBuffer(encrypted) || !encrypted.length) throw new Error('系统没有返回密文');
  stage = '写入本机密文';
  const filename = weatherCredentialPath();
  const temporary = filename + '.' + randomUUID() + '.tmp';
  await mkdir(dirname(filename), {recursive: true});
  try {
    await writeFile(temporary, encrypted, {flag: 'wx'});
    await rename(temporary, filename);
  } finally {
    await unlink(temporary).catch(() => {});
  }
  stage = '回读本机密文';
  if (!await loadWeatherAuth()) throw new Error('凭据写入后无法回读');
  console.log('本机天气凭据已加密保存并回读。');
}
run().catch(error => {
  const code = typeof error?.code === 'string' && /^[A-Z_0-9]+$/.test(error.code) ? ' (' + error.code + ')' : '';
  console.error('天气凭据步骤失败 · ' + stage + code);
  process.exitCode = 1;
});
