import {createPrivateKey, createPublicKey, sign} from 'node:crypto';
import {execFile} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

export function weatherCredentialPath() {
  return join(process.env.LOCALAPPDATA, 'Feiyue', 'qweather-credential.bin');
}

export function qweatherAuth({host, developerId, projectId, credentialId, privatePem}, now = Date.now) {
  if (!/^[a-z0-9]+\.[a-z0-9]+\.qweatherapi\.com$/i.test(host)
    || !/^Q[A-Z0-9]{9}$/.test(developerId)
    || ![projectId, credentialId].every(value => /^[A-Z0-9]{10}$/.test(value))) {
    throw new Error('和风天气账户参数无效');
  }
  const key = createPrivateKey(privatePem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('和风天气需要 Ed25519 私钥');
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({alg: 'EdDSA', kid: credentialId});
  let bearer, expires = 0;
  return {
    origin: 'https://' + host,
    publicKey: createPublicKey(key),
    header() {
      const iat = Math.floor(now() / 1000) - 30;
      if (iat + 120 >= expires) {
        expires = iat + 600;
        const body = header + '.' + encode({iss: developerId, sub: projectId, iat, exp: expires});
        bearer = 'Bearer ' + body + '.' + sign(null, Buffer.from(body), key).toString('base64url');
      }
      return {Authorization: bearer};
    },
  };
}

// 凭据绑定当前 Windows 用户。密钥材料只经过子进程的私有管道。
export function protectWeatherBytes(bytes, encrypt) {
  if (process.platform !== 'win32') throw new Error('天气凭据仅支持 Windows');
  const method = encrypt ? 'Protect' : 'Unprotect';
  const script = [
    "$ErrorActionPreference='Stop'",
    'Add-Type -AssemblyName System.Security',
    '$inputBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd())',
    '$outputBytes=[Security.Cryptography.ProtectedData]::' + method +
      '($inputBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)',
    '[Console]::Write([Convert]::ToBase64String($outputBytes))',
  ].join('; ');
  const powershell = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise((resolve, reject) => {
    const child = execFile(powershell, ['-NoProfile', '-NonInteractive', '-Command', script],
      {windowsHide: true, timeout: 9000, maxBuffer: 16384}, (error, stdout) => {
        if (error || !stdout) reject(new Error('Windows 用户加密服务不可用'));
        else resolve(Buffer.from(stdout, 'base64'));
      });
    child.stdin.on('error', () => {});
    child.stdin.end(bytes.toString('base64'));
  });
}

export async function readWeatherCredential(filename = weatherCredentialPath()) {
  let encrypted;
  try { encrypted = await readFile(filename); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error('无法读取天气凭据');
  }
  let decrypted;
  try {
    decrypted = await protectWeatherBytes(encrypted, false);
    return JSON.parse(decrypted.toString('utf8'));
  }
  catch { throw new Error('天气凭据无法解密或格式无效'); }
  finally { decrypted?.fill(0); }
}

export async function loadWeatherAuth(filename) {
  const credential = await readWeatherCredential(filename);
  return credential ? qweatherAuth(credential) : null;
}

export function createHourlyWeatherRequest({loadAuth = loadWeatherAuth, fetcher = fetch} = {}) {
  let loading;
  return async (coordinates, signal) => {
    loading ??= loadAuth().then(auth => {
      if (!auth) throw new Error('尚无本机天气凭据');
      return auth;
    }).catch(() => {
      loading = undefined;
      throw Object.assign(new Error('本机天气凭据不可用'), {code: 'WEATHER_NOT_CONFIGURED'});
    });
    const auth = await loading;
    const response = await fetcher(auth.origin + '/weather/v1/hourly/' + coordinates + '?hours=7&lang=zh', {
      headers: auth.header(), redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(9000)]),
    });
    if (response.status === 401 || response.status === 403) loading = undefined;
    return response;
  };
}
