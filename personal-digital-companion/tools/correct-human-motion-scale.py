from pathlib import Path
import json,subprocess,hashlib
import numpy as np
import cv2
from scipy.signal import savgol_filter
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parent.parent;out=root/'assets/attachment-human-20261118';ff=r'G:\DevTools\audio-venv\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v9.0.2.exe'
assert 'motion_correction' not in json.loads((out/'manifest.json').read_text(encoding='utf8')), '请先运行prepare-human-attachment.py重建基线，不可重复叠加补偿'
data=json.loads((out/'motion-scale.json').read_text());scales=np.maximum(1,savgol_filter(data['measured_scale'],15,2));count=len(scales)
def ease(t):t=np.clip(t,0,1);return t*t*(3-2*t)
fade=ease((np.arange(count)-7)/12)*ease((count-8-np.arange(count))/12);factors=1/(1+(scales-1)*fade)
source=out/'lie-to-sit.webm';target=out/'lie-to-sit.motion.webm'
dec=subprocess.Popen([ff,'-v','error','-c:v','libvpx-vp9','-i',str(source),'-f','rawvideo','-pix_fmt','rgba','-'],stdout=subprocess.PIPE)
enc=subprocess.Popen([ff,'-v','error','-y','-f','rawvideo','-pix_fmt','rgba','-s','854x768','-r','24','-i','-','-an','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-lossless','1','-b:v','0','-auto-alt-ref','0','-cpu-used','4',str(target)],stdin=subprocess.PIPE)
box=[854,768,0,0];samples=[]
for i,factor in enumerate(factors):
 raw=dec.stdout.read(854*768*4);assert len(raw)==854*768*4;a=np.frombuffer(raw,np.uint8).reshape(768,854,4)
 if factor==1:output=a
 else:
  pm=a.astype(np.float32)/255;pm[:,:,:3]*=pm[:,:,3:4];M=np.float32([[factor,0,427*(1-factor)],[0,factor,440*(1-factor)]]);pm=cv2.warpAffine(pm,M,(854,768),flags=cv2.INTER_LINEAR)
  rgb=np.divide(pm[:,:,:3],pm[:,:,3:4],out=np.zeros_like(pm[:,:,:3]),where=pm[:,:,3:4]>1e-5);output=np.uint8(np.clip(np.concatenate([rgb,pm[:,:,3:4]],2)*255+.5,0,255))
 if i%12==0:samples.append((i,output.copy()))
 ys,xs=np.where(output[:,:,3]>40);box=[min(box[0],int(xs.min())),min(box[1],int(ys.min())),max(box[2],int(xs.max())+1),max(box[3],int(ys.max())+1)]
 enc.stdin.write(output.tobytes())
enc.stdin.close();assert enc.wait()==0 and dec.wait()==0;target.replace(source)
m=json.loads((out/'manifest.json').read_text(encoding='utf8'));m['clips']['lie-to-sit']['sha256']=hashlib.sha256(source.read_bytes()).hexdigest();m['clips']['lie-to-sit']['occupancy_pixels']=box;m['motion_correction']={'clip':'lie-to-sit','pivot':[427,440],'factors':factors.tolist(),'max_original_relative_scale':max(data['measured_scale']),'min_correction_scale':float(factors.min()),'first_last_8_frames_unchanged':True};(out/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf8')
sheet=Image.new('RGB',(214*7,210*2),(35,35,42));draw=ImageDraw.Draw(sheet)
for j,(i,a) in enumerate(samples):
 bg=Image.new('RGBA',(854,768),(35,35,42,255));bg.alpha_composite(Image.fromarray(a));sheet.paste(bg.convert('RGB').resize((214,192)),(j%7*214,j//7*210));draw.text((j%7*214,j//7*210+193),str(i),fill='white')
sheet.save(root/'output/human-motion-corrected.png');print('Motion compensation',float(factors.min()),'max adjacent factor change',float(np.abs(np.diff(factors)).max()),flush=True)

# 更新缩放后空间范围；端点轮廓验证覆盖最终再编码资源。
profilePath=root/'desktop/attachment-human.mjs';profiles=json.loads(profilePath.read_text(encoding='utf8').split('export const HUMAN_PROFILES=',1)[1].strip().rstrip(';'));x,y,x2,y2=box;profiles['lie-to-sit']['occupancy']={'x':x/854,'y':y/768,'width':(x2-x)/854,'height':(y2-y)/768};profilePath.write_text('// 公共端点及过渡内部缩放已校准。\nexport const HUMAN_PROFILES='+json.dumps(profiles,ensure_ascii=False,indent=2)+';\n',encoding='utf8')
ends={}
for key,c in m['clips'].items():
 raw=subprocess.check_output([ff,'-v','error','-c:v','libvpx-vp9','-i',str(out/c['file']),'-vf',f"select='eq(n,0)+eq(n,{c['frames']-1})'",'-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgba','-']);ends[key]=np.frombuffer(raw,np.uint8).reshape(2,768,854,4)
pairs=[('lie-self',ends['lie'][1],ends['lie'][0]),('sit-self',ends['sit'][1],ends['sit'][0]),('lie-to-transition',ends['lie'][1],ends['lie-to-sit'][0]),('transition-to-sit',ends['lie-to-sit'][1],ends['sit'][0]),('sit-to-transition',ends['sit'][1],ends['sit-to-lie'][0]),('transition-to-lie',ends['sit-to-lie'][1],ends['lie'][0])]
for mode in ['lie','sit']:pairs.extend([(mode+'-idle-self',ends[mode+'-idle'][1],ends[mode+'-idle'][0]),(mode+'-idle-to-special',ends[mode+'-idle'][1],ends[mode][0]),(mode+'-special-to-idle',ends[mode][1],ends[mode+'-idle'][0])])
qa={}
for name,a,b in pairs:
 alpha=int(np.abs(a[:,:,3].astype(int)-b[:,:,3].astype(int)).max());same=bool(np.array_equal(a[:,:,3]>128,b[:,:,3]>128));assert same and alpha<=1;qa[name]={'max_alpha_difference':alpha,'opaque_geometry_identical':same}
(out/'seam-validation.json').write_text(json.dumps(qa,indent=2),encoding='utf8')
