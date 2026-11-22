const {ipcRenderer}=require('electron');

window.addEventListener('DOMContentLoaded',()=>{
  const query=new URLSearchParams(location.search);
  document.getElementById('count').textContent=query.get('count')+' 条更新';
  document.getElementById('headline').textContent=query.get('headline');
  document.getElementById('close').addEventListener('click',event=>{
    event.stopPropagation();
    ipcRenderer.send('news-notice:choose','dismiss');
  });
  document.body.addEventListener('click',()=>ipcRenderer.send('news-notice:choose','open'));
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape')ipcRenderer.send('news-notice:choose','dismiss');
  });
});
