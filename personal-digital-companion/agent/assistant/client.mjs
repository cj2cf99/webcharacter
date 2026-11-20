import {copyJson,encodeJson} from '../execution/json.mjs';
import {isSubmissionId} from '../tasks/submissions.mjs';
// request由已登录宿主提供；不读取/注入API_TOKEN，模型消息不能调用confirm。
export function createAssistantClient(request,{prefix='/api'}={}) {
  if(typeof request!=='function')throw new TypeError('需要已认证请求函数');
  if(!/^\/api(?:\/[a-zA-Z0-9_-]+)*$/.test(prefix))throw new TypeError('接口前缀无效');
  let proposal=null,active=null,confirmed=null,submissionId=null,submissionUnknown=false;
  async function call(path,body) {
    const response=await request(prefix+path,{method:'POST',credentials:'same-origin',mode:'same-origin',cache:'no-store',
      headers:{Accept:'application/json','Content-Type':'application/json'},body:encodeJson(body)});
    let data;try{data=await response.json();}catch{throw new Error('响应无效，操作结果未确认');}
    if(!response.ok)throw Object.assign(new Error('请求失败，未确认提交成功'),{status:response.status,code:data.error?.code});
    return data;
  }
  function action(key,work) {
    if(active)return active.key===key?active.promise:Promise.reject(new Error('当前操作尚未结束'));
    const promise=Promise.resolve().then(work).finally(()=>{active=null;});active={key,promise};return promise;
  }
  return {
    message(input) {
      const snapshot=copyJson(input);
      return action('message:'+encodeJson(snapshot),async()=>{
        if(submissionUnknown)throw Object.assign(new Error('请先用原提交号重试此前的确认'),{code:'SUBMISSION_UNKNOWN'});
        proposal=null;confirmed=null;submissionId=null;
        const response=await call('/assistant/message',snapshot);
        if(typeof response.reply!=='string'||!Object.hasOwn(response,'proposal')
          ||(response.proposal!==null&&(typeof response.proposal!=='object'||Array.isArray(response.proposal))))throw new Error('AI接口响应无效');
        proposal=response.proposal===null?null:copyJson(response.proposal);
        return copyJson(response);
      });
    },
    confirm({accepted}={}) {
      if(accepted!==true)return Promise.reject(new Error('需要用户明确确认'));
      return action('confirm',async()=>{
        if(confirmed)return copyJson(confirmed);
        if(!proposal)throw new Error('没有待确认建议');
        if(!submissionId) {
          const issued=await call('/task-submissions',{});
          if(!isSubmissionId(issued?.submission_id))throw new Error('未收到有效提交号，任务未发送');
          submissionId=issued.submission_id;
        }
        try {
          const result=await call('/tasks',{...proposal,submission_id:submissionId});
          if(typeof result.task_id!=='string'||result.submission_id!==submissionId||result.type!==proposal.type||(result.dispatch_target??result.target_device_id)!==proposal.target_device_id
            ||encodeJson(result.params)!==encodeJson(proposal.params)||(result.deadline_at??null)!==(proposal.deadline_at??null))throw new Error('任务创建回执不一致，结果未确认');
          submissionUnknown=false;confirmed=copyJson(result);return copyJson(result);
        }catch(error){
          if(!(error.status>=400&&error.status<500)) {
            submissionUnknown=true;
            throw Object.assign(new Error('提交结果未知，再次确认时会用原提交号核对'),{code:'SUBMISSION_UNKNOWN'});
          }
          throw error;
        }
      });
    },
    getProposal(){return proposal===null?null:copyJson(proposal);},
  };
}
