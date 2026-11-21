// 单值网址取原文中第一个 HTTP(S) 链接。Markdown 链接以实际目标为准。
export function firstResourceUrl(text) {
  const tokens = /\[[^\]\n]*\]\((<?https?:\/\/)|https?:\/\//giu;
  for (const match of text.matchAll(tokens)) {
    const markdown = Boolean(match[1]);
    const start = match.index + (markdown ? match[0].lastIndexOf(match[1]) + Number(match[1].startsWith('<')) : 0);
    let end = start, depth = 0;
    for (; end < text.length; end++) {
      const c = text[end];
      if (/[\s<>"\x27\x60【】「」，。！？；、（）\[\]]/u.test(c)) break;
      if (c === '(') depth++;
      if (c === ')') {
        if (!depth) break;
        depth--;
      }
    }
    const raw = text.slice(start, end);
    const value = markdown ? raw : raw.replace(/[.,;:!?]+$/u, '');
    try { if (new URL(value).hostname) return value; } catch {}
  }
  return '';
}

export function requestsResource(text) {
  return /^(?:(?:绯月|麻烦你?|请你?|帮我|替我|给我|我要|我想|我想要)[，,\s]*)*(?:(?:登记|记录|添加|保存|收藏|收录|新增|记下)(?:一下)?\s*(?:这|一)?[个条份项]?\s*(?:鱼与熊掌的?)?资源(?=$|[：:，,。\s]|https?:\/\/)|资源(?:登记|[：:]))/u.test(text.trim())
    || /^(?:请|帮我)?把.+(?:登记|保存|收藏|收录)(?:为|成|到)(?:鱼与熊掌的?)?资源[。！!]?$/su.test(text.trim());
}

export const resourceCategoryNames = Object.freeze({
  other:'其他', tools:'工具/网站', github:'GitHub', articles:'文章/教程', images:'素材/图片', ideas:'灵感/点子',
});

// AI 用一句话概括资源及用途。单项正文及网址均从用户输入取得；混合任务按原文片段区分。
export function resourceParams(original, proposed, single) {
  const body = single ? original : proposed.body;
  if (typeof body !== 'string' || !body.trim() || !original.includes(body)) throw Error('资源正文必须来自原文');
  const requestedCategory = proposed.category_id;
  const category = Object.hasOwn(resourceCategoryNames, requestedCategory) && original.includes(resourceCategoryNames[requestedCategory])
    ? requestedCategory : 'other';
  const url = firstResourceUrl(body);
  return {title:proposed.title, body, category_id:category, ...(url ? {url} : {})};
}
