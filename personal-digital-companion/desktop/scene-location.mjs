// For an explicitly named colour, measure the connected pixels before asking the model to verify the crop.
export function colourBounds(image,target){
  const names=[...target.matchAll(/红|蓝|绿|黄|橙|紫|粉/g)].map(m=>m[0]);
  if(new Set(names).size!==1||!image.resize)return null;
  const small=image.resize({width:Math.min(240,image.getSize().width),quality:'good'});
  const {width,height}=small.getSize(),pixels=small.toBitmap();
  if(pixels.length!==4*width*height)return null;
  const wanted=names[0],mask=new Uint8Array(width*height);
  for(let i=0;i<mask.length;i++){
    const b=pixels[4*i],g=pixels[4*i+1],r=pixels[4*i+2],hi=Math.max(r,g,b),lo=Math.min(r,g,b),delta=hi-lo;
    if(delta<36||hi<62)continue;
    const h=(360+60*(hi===r?(g-b)/delta:hi===g?2+(b-r)/delta:4+(r-g)/delta))%360;
    const hue=h<15||h>=346?'红':h<42?'橙':h<72?'黄':h<172?'绿':h<256?'蓝':h<305?'紫':'粉';
    if(hue===wanted)mask[i]=1;
  }
  let found=null;
  const queue=new Int32Array(mask.length);
  for(let i=0;i<mask.length;i++){
    if(!mask[i])continue;
    let n=1,minX=width,minY=height,maxX=0,maxY=0;queue[0]=i;mask[i]=0;
    for(let k=0;k<n;k++){
      const p=queue[k],x=p%width,y=Math.floor(p/width);
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      for(const j of [x>0?p-1:-1,x+1<width?p+1:-1,p-width,p+width]){
        if(j>=0&&j<mask.length&&mask[j]){queue[n++]=j;mask[j]=0;}
      }
    }
    const w=maxX-minX+1,h=maxY-minY+1;
    if(w<4||h<4||n<24||n<w*h*.35||w*h>mask.length*.50)continue;
    if(found)return null;
    found=[Math.floor(1000*minX/width),Math.floor(1000*minY/height),
      Math.ceil(1000*w/width),Math.ceil(1000*h/height)];
  }
  return found;
}
