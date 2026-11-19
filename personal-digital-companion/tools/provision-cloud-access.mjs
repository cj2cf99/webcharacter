import {mkdir, writeFile, rename} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {accessCredentials, credentialFilename} from '../desktop/cloud-connection.mjs';
import {protectWeatherBytes as protect} from '../desktop/weather-credentials.mjs';

try {
  const [profile] = process.argv.slice(2);
  if (!profile || process.argv.length !== 3) throw new Error('必须指定精灵 profile 路径');
  const payload = {client_id: process.env.FEIYUE_ACCESS_CLIENT_ID, client_secret: process.env.FEIYUE_ACCESS_CLIENT_SECRET};
  accessCredentials(payload);
  const clear = Buffer.from(JSON.stringify(payload));
  let encrypted;
  try { encrypted = await protect(clear, true); }
  finally { clear.fill(0); }
  const directory = resolve(profile);
  await mkdir(directory, {recursive: true});
  const target = join(directory, credentialFilename);
  const temporary = target + '.' + crypto.randomUUID() + '.tmp';
  await writeFile(temporary, encrypted, {flag: 'wx'});
  await rename(temporary, target);
  console.log('云端 Access 凭据已写入 Windows 用户加密存储。');
} catch {
  console.error('无法注入桌面 Access 凭据，请检查授权来源、Windows 用户和 profile 路径。');
  process.exitCode = 1;
}
