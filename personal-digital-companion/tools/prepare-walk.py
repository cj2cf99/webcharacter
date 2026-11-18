import subprocess,json,hashlib,urllib.request
from pathlib import Path
import numpy as np
import soundfile as sf
root=Path(__file__).resolve().parent.parent;out=root/'assets/walk-20261118';out.mkdir(exist_ok=True);(out/'compact').mkdir(exist_ok=True)
source=out/'source.mp4';ff=r'G:\DevTools\audio-venv\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v9.0.2.exe'
manifest={'source':source.name,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'fps':24,'source_frames':145,'reference_language':'zh','output_language':'zh','source_copy':'source.mp4','clips':{},'voices':{}}
for id,start,end in [('walk-enter',7,27),('walk-loop',27,55),('walk-exit',83,99)]:
 for compact in [False,True]:
  target=out/('compact' if compact else '')/(id+'.webm')
  vf=f'trim=start_frame={start}:end_frame={end},setpts=PTS-STARTPTS,format=rgba,colorkey=0x00FF00:0.20:0.08,despill=green:mix=0.5,'+('scale=372:552,' if compact else '')+'format=yuva420p'
  subprocess.run([ff,'-v','error','-y','-i',str(source),'-map','0:v:0','-an','-map_metadata','-1','-vf',vf,'-c:v','libvpx-vp9','-crf','20','-b:v','0','-cpu-used','4','-auto-alt-ref','0',str(target)],check=True)
  w,h=(372,552) if compact else (464,688)
  raw=subprocess.check_output([ff,'-v','error','-c:v','libvpx-vp9','-i',str(target),'-f','rawvideo','-pix_fmt','rgba','-'])
  assert len(raw)//(w*h*4)==end-start
  a=np.frombuffer(raw,np.uint8).reshape(-1,h,w,4);assert (a[:,:,:,3]==0).any() and (a[:,:,:,3]>200).any()
 manifest['clips'][id]={'start_frame':start,'end_frame_exclusive':end,'frames':end-start,'seconds':round((end-start)/24,4),'file':id+'.webm','compact':'compact/'+id+'.webm'}
 print(id,end-start,flush=True)
for id,text in [('walk-enter','我要出发咯～！'),('walk-exit','到啦！')]:
 req=urllib.request.Request('http://127.0.0.1:9880/api/speak',data=json.dumps({'text':text,'language':'zh'},ensure_ascii=False).encode(),headers={'Content-Type':'application/json'})
 data=urllib.request.urlopen(req,timeout=180).read();p=out/(id+'.wav');p.write_bytes(data);a,sr=sf.read(p);assert np.isfinite(a).all() and np.max(np.abs(a))>.001
 manifest['voices'][id]={'text':text,'file':p.name,'seconds':round(len(a)/sr,3),'sample_rate':sr,'sha256':hashlib.sha256(data).hexdigest()};print(id,'voice',len(a)/sr,flush=True)
manifest['pairing']={'enter':{'video':'walk-enter','voice':'voice:walk-enter'},'loop':{'video':'walk-loop','voice':None},'exit':{'video':'walk-exit','voice':'voice:walk-exit'}}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
