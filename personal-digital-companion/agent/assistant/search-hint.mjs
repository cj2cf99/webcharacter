export const searchInstruction = '\n仅当你无法理解公开名词或无法可靠回答且网上资料能解决时，才可额外返回 search_query。只提取提问文字中已有的简短公开关键词，以空格分隔，不得提取截图、私人信息、历史或登记内容。能回答时正常回答；不清楚指的是哪个东西时请用户补充。';
export function searchHint(question, keywords) {
  if (typeof keywords !== 'string' || keywords.length > 100 || /(?:不要|别|不用|禁止)(?:上网|联网|搜索|查网)/.test(question)) return {};
  const words=keywords.trim().split(/\s+/);
  return words.length<=8 && words.every(word=>word && question.includes(word))
    ? {search_query:words.join(' ')} : {};
}
