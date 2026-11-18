import assert from 'node:assert/strict';
import {screenPosture,postureHit} from '../desktop/screen-posture.mjs';
const area={x:0,width:1200},b=center=>({x:center-120,width:240});
let side='right';for(const [center,expected]of [[1100,'right'],[700,'right'],[401,'right'],[399,'left'],[400,'left'],[600,'left'],[799,'left'],[800,'right'],[500,'right']]){side=screenPosture(b(center),area,side);assert.equal(side,expected);}
assert.equal(screenPosture(b(-1100),{x:-1200,width:1200},'right'),'left');assert.equal(screenPosture(b(-100),{x:-1200,width:1200},'left'),'right');
let sample;const canvas={width:300,height:450,getBoundingClientRect:()=>({left:0,top:0,width:200,height:300})},context={getImageData(x,y){sample={x,y};return {data:[0,0,0,x<100?255:0]};}};
assert(postureHit(canvas,context,0,20,'right'));assert.equal(sample.x,0);assert(!postureHit(canvas,context,0,20,'left'));assert.equal(sample.x,299);assert(postureHit(canvas,context,199.9,20,'left'));assert.equal(sample.x,0);assert(!postureHit(canvas,context,200,20,'left'));assert(!postureHit(canvas,context,-1,20,'left'));
console.log('PASS：左右三分区、中间保持、精确边界、负坐标屏幕、镜像像素命中与透明边界。');
