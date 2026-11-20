// 只读回显保留原始字符；不执行输入文字。
export const handlers = {'pc.echo':{
  risk:'L1',
  validate(params){if(typeof params.text!=='string'||Object.keys(params).length!==1)throw Error('需提供回显文字');},
  execute({text}){return {text};}
}};
