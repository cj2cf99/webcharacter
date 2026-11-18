from pathlib import Path
import subprocess,json,hashlib,shutil
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parent.parent;out=root/'assets/attachment-human-20261118';out.mkdir(exist_ok=True);(out/'source').mkdir(exist_ok=True)
ff=r'G:\DevTools\audio-venv\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v9.0.2.exe'
items=[('lie','侧卧动作',854,480,0,240),('sit','坐姿动作',464,688,0,145),('lie-to-sit','真实比例过度',560,560,0,145),('sit-to-lie','真实比例过度2',560,560,0,145),('lie-idle','真人卧姿待机循环',752,416,0,145),('sit-idle','真人坐姿待机循环',464,688,0,145)]
(root/'output').mkdir(exist_ok=True)
manifest={'normalization':{'aspect': 'uniform scale only, never nonuniform stretch', 'support_y': 440, 'lie': {'scale': 1, 'source_support_y': 320}, 'sit': {'scale': 1, 'source_support_y': 455}, 'lie-to-sit': {'scale': '1.4 -> 1.25, smoothstep', 'source_support_y': '360 -> 375, smoothstep'}, 'sit-to-lie': {'scale': '1.25 -> 1.4, smoothstep', 'source_support_y': '380 -> 360, smoothstep'}, 'audio': 'removed; no new voices', 'inside_pose': 'not supplied'},'fps':24,'canvas':[854,768],'contact':[427,440],'clips':{}}
for key,name,w,h,start,end in items:
 source=out/'source'/(name+'.mp4')
 decoder=subprocess.Popen([ff,'-v','error','-i',str(source),'-map','0:v:0','-an','-vf',f'trim=start_frame={start}:end_frame={end},setpts=PTS-STARTPTS,format=yuva444p,chromakey=0x00FF00:0.20:0.06,despill=green:mix=0.5,format=rgba','-f','rawvideo','-pix_fmt','rgba','-'],stdout=subprocess.PIPE)
 target=out/(key+'.webm');encoder=subprocess.Popen([ff,'-v','error','-y','-f','rawvideo','-pix_fmt','rgba','-s','854x768','-r','24','-i','-','-an','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-crf','20','-b:v','0','-auto-alt-ref','0','-cpu-used','4',str(target)],stdin=subprocess.PIPE)
 box=[854,768,0,0]
 for i in range(end-start):
  raw=decoder.stdout.read(w*h*4);assert len(raw)==w*h*4,(key,i)
  frame=Image.frombytes('RGBA',(w,h),raw)
  t=i/max(1,end-start-1);u=t*t*(3-2*t)
  if key=='lie-idle':scale=1.04;floor=290
  elif key=='lie':scale=1;floor=320
  elif key in ['sit','sit-idle']:scale=1;floor=455
  elif key=='lie-to-sit':scale=1.4-.15*u;floor=360+15*u
  else:scale=1.25+.15*u;floor=380-20*u
  nw,nh=round(w*scale),round(h*scale);frame=frame.resize((nw,nh),Image.Resampling.LANCZOS)
  stage=Image.new('RGBA',(854,768));stage.paste(frame,((854-nw)//2,round(440-floor*scale)))
  a=np.asarray(stage)[:,:,3];ys,xs=np.where(a>40)
  assert len(xs)>100 and (a==0).any(),key
  box=[min(box[0],int(xs.min())),min(box[1],int(ys.min())),max(box[2],int(xs.max())+1),max(box[3],int(ys.max())+1)]
  if i in [0,(end-start)//2,end-start-1]:
   bg=Image.new('RGBA',stage.size,(45,46,55,255));bg.alpha_composite(stage);bg.convert('RGB').save((root/'output')/f'human-{key}-{i}.png')
  encoder.stdin.write(stage.tobytes())
 encoder.stdin.close();assert encoder.wait()==0;assert decoder.wait()==0
 check=subprocess.run([ff,'-v','error','-c:v','libvpx-vp9','-i',str(target),'-f','null','-'],capture_output=True);assert check.returncode==0
 manifest['clips'][key]={'source':source.name,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'start_frame':start,'end_frame_exclusive':end,'frames':end-start,'seconds':round((end-start)/24,4),'file':target.name,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'occupancy_pixels':box,'loop':key in ['lie-idle','sit-idle'],'role':'idle' if key.endswith('-idle') else 'special' if key in ['lie','sit'] else 'transition'}
 print(key,end-start,box,flush=True)
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')

# 统一端点、闭合自循环并生成接触范围，不能跳过此步骤。
import sys
subprocess.run([sys.executable,str(root/'tools/stabilize-human-seams.py')],check=True)

subprocess.run([sys.executable,str(root/'tools/correct-human-motion-scale.py')],check=True)
