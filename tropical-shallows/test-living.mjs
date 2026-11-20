import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from './site/vendor/three/three.module.min.js';
import {sceneTiming} from './site/scene-timing.mjs';
import {createLivingScene} from './site/living-scene.mjs';
// 涨水时不啄食，退水窗口才觅食；受惊中断活动，事件自然消退。
for(const t of [0,.5,1.2,1.65,5.5,6.3,12.1])assert.equal(sceneTiming(t).peck,0);
assert(sceneTiming(2.6).peck>.6);
assert(sceneTiming(20.6,{bird:20.4}).peck<sceneTiming(20.6).peck*.3);
assert.equal(sceneTiming(30,{bird:10,crab:10}).crabAlert,0);
for(let t=0;t<120;t+=.071){const s=sceneTiming(t);assert(Object.values(s).every(Number.isFinite));assert(s.peck>=0&&s.peck<=.76);assert.deepEqual(s,sceneTiming(t));}
// 屋顶与棕榈环纹共用材质，风标记必须只作用到植被；花瓣须随枝条同行。
const life=createLivingScene();
const rig=JSON.parse(fs.readFileSync(new URL('./site/assets/realtime/bird-rig.json',import.meta.url)));assert(Object.keys(rig.weights).length>1000);life.setAnatomy(rig);
function flags(name,points){const material=new THREE.MeshStandardMaterial();life.decorate(material,name,'log8',8);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));life.bindGeometry(geometry,material);const result=Array.from(geometry.attributes.lifeFlora.array);geometry.dispose();material.dispose();return result;}
assert.deepEqual(flags('茅草1',[[8,5,-12],[-2,5,4]]),[0,1]);
assert.deepEqual(flags('鸡蛋花乳白渐黄花瓣',[[1,3,11]]),[1]);
assert.deepEqual(flags('合理化_潮湿侵蚀岩基',[[0,2,-8]]),[0]);
assert.deepEqual(flags('island_tree_01_branches',[[1,4,-14]]),[1]);
const headPoint=Object.keys(rig.weights).find(k=>rig.weights[k]===1).split(',').map(Number).map(v=>v/10000);
const headMaterial=new THREE.MeshStandardMaterial();life.decorate(headMaterial,'涉禽褐色背羽','log8',8);const anatomyGeometry=new THREE.BufferGeometry();anatomyGeometry.setAttribute('position',new THREE.Float32BufferAttribute([...headPoint,-3.25,.09,4.7],3));life.bindGeometry(anatomyGeometry,headMaterial);assert.deepEqual(Array.from(anatomyGeometry.attributes.lifeHead.array),[255,0]);anatomyGeometry.dispose();headMaterial.dispose();
const camera=new THREE.PerspectiveCamera(42.32,1.5,.06,1000);camera.position.set(0,2.15,14);camera.lookAt(0,1.10,-10);camera.updateMatrixWorld();
life.update(2.6);const projected=new THREE.Vector3(1.43,.73,8.6).project(camera);
assert.equal(life.interact(new THREE.Vector2(projected.x,projected.y),camera),'crab');life.update(2.8);assert(life.metrics().crabAlert>.5);
life.update(12);assert.equal(life.metrics().crabAlert,0);
const leafPoint=new THREE.Vector3(1.296,2.126,11.504).project(camera);assert.equal(life.interact(new THREE.Vector2(leafPoint.x,leafPoint.y),camera),'foliage');assert.equal(life.metrics().leafTouch,true);
const sea=new THREE.Vector3(-5,.078,4).project(camera);assert.equal(life.interact(new THREE.Vector2(sea.x,sea.y),camera),'water');life.update(12.2);assert(life.metrics().ripples>0);
life.update(16);assert.equal(life.metrics().ripples,0);assert.equal(life.metrics().leafTouch,false);
for(let i=0;i<30;i++){life.update(17+i*.01);life.interact(new THREE.Vector2(sea.x,sea.y),camera);}assert.equal(life.ripples.length,6);assert(life.metrics().ripples<=6);life.dispose();
console.log('通过：潮汐觅食时序、受惊衰减、材质植被筛选、水面点击与涟漪寿命。');
