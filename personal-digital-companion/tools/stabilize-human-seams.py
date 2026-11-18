from pathlib import Path
import subprocess,json,hashlib
import numpy as np
import cv2
from PIL import Image
root=Path(__file__).resolve().parent.parent;out=root/'assets/attachment-human-20261118';manifest=json.loads((out/'manifest.json').read_text(encoding='utf8'))
ff=r'G:\DevTools\audio-venv\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v9.0.2.exe';W,H=854,768

def endpoints(path,count):
 raw=subprocess.check_output([ff,'-v','error','-c:v','libvpx-vp9','-i',str(path),'-vf',f"select='eq(n,0)+eq(n,{count-1})'",'-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgba','-'])
 return np.frombuffer(raw,np.uint8).reshape(2,H,W,4)
ends={k:endpoints(out/c['file'],c['frames']) for k,c in manifest['clips'].items()}
sift=cv2.SIFT_create(nfeatures=4000)
def fit(src,dst):
 def features(a):return sift.detectAndCompute(cv2.cvtColor(a[:,:,:3],cv2.COLOR_RGB2GRAY),np.uint8(a[:,:,3]>180)*255)
 ka,da=features(src);kb,db=features(dst);matches=[a for a,b in cv2.BFMatcher().knnMatch(da,db,k=2) if a.distance<.72*b.distance]
 p=np.float32([ka[m.queryIdx].pt for m in matches]);q=np.float32([kb[m.trainIdx].pt for m in matches]);M,mask=cv2.estimateAffinePartial2D(p,q,method=cv2.RANSAC,ransacReprojThreshold=4,maxIters=5000)
 assert M is not None and mask.sum()>30,'端点匹配不足，需人工检查'
 p=p[mask[:,0]>0];q=q[mask[:,0]>0];pc=p-p.mean(0);qc=q-q.mean(0);scale=float((pc*qc).sum()/(pc*pc).sum());tx,ty=(q-scale*p).mean(0)
 assert .9<scale<1.1,'不能用过度缩放掩盖素材不匹配'
 return np.array([scale,float(tx),float(ty)]),int(mask.sum())
def pm(a):
 a=a.astype(np.float32)/255;a[:,:,:3]*=a[:,:,3:4];return a
def rgba(a):
 rgb=np.divide(a[:,:,:3],a[:,:,3:4],out=np.zeros_like(a[:,:,:3]),where=a[:,:,3:4]>1e-5);return np.uint8(np.clip(np.concatenate([rgb,a[:,:,3:4]],2)*255+.5,0,255))
def ease(t):return t*t*(3-2*t)
canonical={k:pm(ends[k][0]) for k in ['lie','sit']};records={}
for key,c in manifest['clips'].items():
 main=key in canonical or key.endswith('-idle');startKey=key.split('-')[0] if main else ('lie' if key=='lie-to-sit' else 'sit');endKey=key.split('-')[0] if main else ('sit' if key=='lie-to-sit' else 'lie')
 first,last=canonical[startKey],canonical[endKey];a,na=fit(ends[key][0],ends[startKey][0]);b,nb=fit(ends[key][1],ends[endKey][0]);count=c['frames'];blend=8
 records[key]={'start_transform':a.tolist(),'end_transform':b.tolist(),'start_inliers':na,'end_inliers':nb,'blend_frames':blend}
 decoder=subprocess.Popen([ff,'-v','error','-c:v','libvpx-vp9','-i',str(out/c['file']),'-f','rawvideo','-pix_fmt','rgba','-'],stdout=subprocess.PIPE)
 target=out/(key+'.seam.webm');encoder=subprocess.Popen([ff,'-v','error','-y','-f','rawvideo','-pix_fmt','rgba','-s',f'{W}x{H}','-r','24','-i','-','-an','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-lossless','1','-b:v','0','-auto-alt-ref','0','-cpu-used','4',str(target)],stdin=subprocess.PIPE)
 box=[W,H,0,0]
 for i in range(count):
  raw=decoder.stdout.read(W*H*4);assert len(raw)==W*H*4
  frame=pm(np.frombuffer(raw,np.uint8).reshape(H,W,4))
  u=ease(i/(count-1))
  transform=a*(1-u)+b*u
  scale,x,y=transform;frame=cv2.warpAffine(frame,np.float32([[scale,0,x],[0,scale,y]]),(W,H),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
  if key not in canonical and i<blend:
   t=ease(i/(blend-1));frame=first*(1-t)+frame*t
  if i>=count-blend:
   t=ease((i-count+blend)/(blend-1));frame=frame*(1-t)+last*t
  if i==0:frame=first
  if i==count-1:frame=last
  output=rgba(frame);ys,xs=np.where(output[:,:,3]>40);box=[min(box[0],int(xs.min())),min(box[1],int(ys.min())),max(box[2],int(xs.max())+1),max(box[3],int(ys.max())+1)]
  encoder.stdin.write(output.tobytes())
 encoder.stdin.close();assert encoder.wait()==0 and decoder.wait()==0;target.replace(out/c['file']);c['sha256']=hashlib.sha256((out/c['file']).read_bytes()).hexdigest();c['occupancy_pixels']=box
 print(key,'matched',na,nb,'scale',round(a[0],5),round(b[0],5),flush=True)
manifest['seams']={'method':'SIFT/RANSAC uniform scale+translation; premultiplied alpha endpoint blending; shared canonical endpoints','encoding':'lossless VP9 with alpha','clips':records}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
# 相同公共端点应在编码解码后仍完全一致，而不只是画布尺寸相同。
final={k:endpoints(out/c['file'],c['frames']) for k,c in manifest['clips'].items()}
pairs=[('lie-self',final['lie'][1],final['lie'][0]),('sit-self',final['sit'][1],final['sit'][0]),('lie-to-transition',final['lie'][1],final['lie-to-sit'][0]),('transition-to-sit',final['lie-to-sit'][1],final['sit'][0]),('sit-to-transition',final['sit'][1],final['sit-to-lie'][0]),('transition-to-lie',final['sit-to-lie'][1],final['lie'][0])]
for mode in ['lie','sit']:
 pairs.extend([(mode+'-idle-self',final[mode+'-idle'][1],final[mode+'-idle'][0]),(mode+'-idle-to-special',final[mode+'-idle'][1],final[mode][0]),(mode+'-special-to-idle',final[mode][1],final[mode+'-idle'][0])])
qa={}
for name,a,b in pairs:
 diff=np.abs(pm(a)-pm(b));qa[name]={'max_premultiplied_difference':float(diff.max()),'mean_difference':float(diff.mean())};assert diff.max()<.012,(name,qa[name]);print(name,qa[name],flush=True)
(root/'output/human-seam-validation.json').write_text(json.dumps(qa,indent=2),encoding='utf8')
(out/'seam-validation.json').write_text(json.dumps(qa,indent=2),encoding='utf8')
profiles={}
for k,c in manifest['clips'].items():
 x,y,x2,y2=c['occupancy_pixels'];profiles[k]={'label':{'lie':'侧卧','sit':'坐姿','lie-to-sit':'侧卧 → 坐姿','sit-to-lie':'坐姿 → 侧卧','lie-idle':'侧卧','sit-idle':'坐姿'}[k],'asset':'attachment-'+k,'width':480,'height':432,'anchor':{'x':.5,'y':440/768},'occupancy':{'x':x/854,'y':y/768,'width':(x2-x)/854,'height':(y2-y)/768},'placeholder':False}
(root/'desktop/attachment-human.mjs').write_text('// 公共端点对齐的正式主动作与双向过渡。\nexport const HUMAN_PROFILES='+json.dumps(profiles,ensure_ascii=False,indent=2)+';\n',encoding='utf8')
