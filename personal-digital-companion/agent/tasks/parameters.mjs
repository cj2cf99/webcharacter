const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// 只支持当前约定的少量字段，不执行数据库说明或构建JSON Schema平台。
export function validateParameters(spec, params) {
  if (!object(spec)) return { configuration: true };
  const patterns = new Map();
  for (const [name, rule] of Object.entries(spec)) {
    if (!object(rule) || !['string', 'number', 'boolean', 'string_array'].includes(rule.type)
      || Object.keys(rule).some(key => !['type', 'required', 'pattern', 'max_items', 'min', 'max'].includes(key))
      || ['min', 'max'].some(key => Object.hasOwn(rule, key) && (rule.type !== 'number' || !Number.isFinite(rule[key])))
      || (rule.min > rule.max)
      || (Object.hasOwn(rule, 'required') && typeof rule.required !== 'boolean')
      || (Object.hasOwn(rule, 'pattern') && (!['string', 'string_array'].includes(rule.type) || typeof rule.pattern !== 'string'))
      || (rule.type === 'string_array'
        ? (!Number.isSafeInteger(rule.max_items) || rule.max_items < 1)
        : Object.hasOwn(rule, 'max_items'))) {
      return { configuration: true };
    }
    if (Object.hasOwn(rule, 'pattern')) {
      try { patterns.set(name, new RegExp(rule.pattern)); } catch { return { configuration: true }; }
    }
  }
  if (!object(params) || Object.keys(params).some(key => !Object.hasOwn(spec, key))) return { valid: false };
  for (const [name, rule] of Object.entries(spec)) {
    if (!Object.hasOwn(params, name)) { if (rule.required) return { valid: false }; else continue; }
    const value = params[name];
    const pattern = patterns.get(name);
    if (rule.type === 'string_array') {
      if (!Array.isArray(value) || value.length > rule.max_items
          || value.some(item => typeof item !== 'string' || (pattern && !pattern.test(item)))) return { valid: false };
      continue;
    }
    if (typeof value !== rule.type || (rule.type === 'number' && (!Number.isFinite(value) || value < rule.min || value > rule.max))
      || (pattern && !pattern.test(value))) return { valid: false };
  }
  return { valid: true };
}
