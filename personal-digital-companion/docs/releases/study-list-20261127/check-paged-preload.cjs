const {contextBridge}=require('electron');
const many=n=>Array.from({length:n},(_,i)=>i+1);
contextBridge.exposeInMainWorld('feiyueStudy',{synthesize:async()=>({skipped:true}),run:async(action,args={})=>{
  if(action==='overview')return {materials:many(12).map(i=>({id:'t'+i,title:'场景 · 话题'+i,kind:'language',sceneId:'s',topic:'话题'+i})),
    active:many(10).map(i=>({id:'a'+i,title:'练习'+i,mode:'practice',status:'running',started:0})),formal:'f'};
  if(action==='history')return {rows:many(args.offset?3:10).map(i=>({id:'h'+((args.offset||0)+i),title:'记录'+((args.offset||0)+i),mode:'practice',finished:0})),total:13};
  if(action==='view')return {id:args.id,title:'场次',mode:'practice',status:'completed',position:0,correct:0,
    items:[{question:{id:'q',type:'single',title:'题',stem:'题干',options:[{id:'a',text:'甲'}],media:[]},result:'wrong',answer:[],canComment:true,reflections:[]}]};
  if(action==='comments')return many(12).map(i=>({id:'c'+i,body:'评论'+i+'号',revision:1,time:i}));
  if(action==='comment')return args.remove?null:{id:args.ref??'new',body:args.value,revision:2,time:99};
  return null;
}});
