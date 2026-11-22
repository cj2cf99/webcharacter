const {ipcRenderer}=require('electron');
ipcRenderer.on('desktop:thought',(_event,value)=>{
 const cloud=document.querySelector('#thought');
 if(!cloud)return;
 cloud.hidden=false;
 cloud.querySelector('strong').textContent=value.title;
 const finished=Number.isFinite(value.durationMs);
 cloud.toggleAttribute('data-summary',Boolean(value.goal)||finished);
 const counted=Number.isInteger(value.total)&&value.total>0&&Number.isInteger(value.done);
 cloud.querySelector('small').textContent=(value.goal??value.stage)+(counted?' · '+value.done+'/'+value.total:'');
 const time=cloud.querySelector('time');
 time.hidden=!finished;
 time.textContent=finished?'用时 '+(value.durationMs/1000).toFixed(1)+' 秒':'';
 const bar=cloud.querySelector('progress');
 bar.hidden=finished;
 if(counted){bar.max=value.total;bar.value=value.done;}else bar.removeAttribute('value');
});
