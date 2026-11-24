// 轻量 JSON Schema 校验：本机语法约束和云端 JSON 输出共用。
export function valid(value,schema){
  if(schema===false)return false;
  if(!schema)return true;
  if(schema.oneOf)return schema.oneOf.some(option=>valid(value,option));
  if(Object.hasOwn(schema,'const')&&!Object.is(value,schema.const))return false;
  if(schema.enum&&!schema.enum.includes(value))return false;
  if(schema.type==='object')return value&&typeof value==='object'&&!Array.isArray(value)&&
    (schema.required??[]).every(key=>Object.hasOwn(value,key))&&Object.entries(value).every(([key,item])=>
      (schema.additionalProperties!==false||Object.hasOwn(schema.properties??{},key))&&valid(item,schema.properties?.[key]));
  if(schema.type==='array')return Array.isArray(value)&&value.length>=(schema.minItems??0)&&
    value.length<=(schema.maxItems??Infinity)&&value.every((item,index)=>valid(item,schema.prefixItems?.[index]??schema.items));
  if(schema.type==='string'){
    if(typeof value!=='string')return false;
    const length=[...value].length;
    return (schema.minLength===undefined||length>=schema.minLength)&&(schema.maxLength===undefined||length<=schema.maxLength)&&
      (!schema.pattern||new RegExp(schema.pattern,'u').test(value));
  }
  if(schema.type==='integer'||schema.type==='number')return Number.isFinite(value)&&
    (schema.type!=='integer'||Number.isInteger(value))&&value>=(schema.minimum??-Infinity)&&value<=(schema.maximum??Infinity);
  if(schema.type==='boolean')return typeof value==='boolean';
  return true;
}
