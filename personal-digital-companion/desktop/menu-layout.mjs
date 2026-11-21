// 只允许引用主进程已有的动作；菜单文件仅描述文字和层次。
export function menuTemplate(items, actions) {
  if (!Array.isArray(items)) throw Error('菜单必须是数组');
  const result = [];
  for (const item of items) {
    if (item === '-') { result.push({type:'separator'}); continue; }
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error('菜单项无效');
    const {action, label, hidden, icon, tone} = item;
    if (icon !== undefined && (typeof icon !== 'string' || [...icon].length > 3)) throw Error('菜单图标必须是一个字符');
    if (tone !== undefined && !['hot','danger'].includes(tone)) throw Error('菜单 tone 只能是 hot 或 danger');
    if (action !== undefined && !Object.hasOwn(actions, action)) throw Error('菜单动作不存在：' + action);
    if (hidden !== undefined && typeof hidden !== 'boolean') throw Error('菜单 hidden 必须是布尔值');
    if (label !== undefined && (typeof label !== 'string' || !label.trim())) throw Error('菜单名称无效');
    if (!action && !item.items) throw Error('菜单项缺少动作或子菜单');
    const command = actions[action];
    const entry = {...command};
    if (label !== undefined) entry.label = label;
    // 自绘菜单读取 fyIcon / fyTone；原生菜单忽略这两个字段。
    if (icon) entry.fyIcon = icon;
    if (tone) entry.fyTone = tone;
    if (item.items !== undefined) {
      if (entry.click) throw Error('可点击动作不能同时作为分组');
      entry.submenu = menuTemplate(item.items, actions);
      if (!entry.submenu.length) continue;
    }
    if (hidden || (action && !command)) continue;
    if (!entry.label || (!entry.click && !entry.submenu)) throw Error('菜单项缺少名称或内容');
    result.push(entry);
  }
  return result;
}
