// 模型可以改变问候的标点、空格和外层引号，仍须完整回答请求的文字和时间。
export function matchesProbeReply(reply, expected) {
  if (typeof reply !== 'string' || reply.length > 256) return false;
  const normalize = text => text.normalize('NFKC').trim()
    .replace(/^["“「『]|["”」』]$/gu, '').replace(/\s+/gu, '')
    .replace(/^你好[!,。.]?/u, '你好').replace(/现在是:/u, '现在是').replace(/[。.!]$/u, '');
  return normalize(reply) === normalize(expected);
}
