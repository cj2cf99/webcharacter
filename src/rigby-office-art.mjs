export function officeBack(c,s){
 c.fillStyle='#dad8d2';c.fillRect(120,125,180,120);c.fillStyle='#eef2ec';c.fillRect(128,133,164,104);c.strokeStyle='#d2dcd3';c.beginPath();c.moveTo(210,133);c.lineTo(210,237);c.moveTo(128,185);c.lineTo(292,185);c.stroke();
 c.fillStyle='#b7b1a9';c.fillRect(365,155,96,4);c.font='12px system-ui';c.fillStyle='#77716a';c.fillText('KEEP CALM',375,145);c.fillText('AND DEBUG',375,178);
 const x=s.chair;c.fillStyle='#3f4c60';c.beginPath();c.roundRect(x-48,268,96,124,18);c.fill();c.fillStyle='#596b82';c.beginPath();c.roundRect(x-39,279,78,94,13);c.fill();c.fillStyle='#313d4e';c.beginPath();c.roundRect(x-54,389,108,15,7);c.fill();c.fillRect(x-5,401,10,60);c.strokeStyle='#4c5662';c.lineWidth=7;c.beginPath();c.moveTo(x-45,479);c.lineTo(x,456);c.lineTo(x+45,479);c.stroke();for(const dx of [-43,43,0]){c.fillStyle='#303745';c.beginPath();c.ellipse(x+dx,484,10,6,0,0,Math.PI*2);c.fill();}
}
export function officeFront(c,s){
 c.fillStyle='#8b7563';c.fillRect(570,397,12,93);c.fillRect(884,397,12,93);c.fillStyle='#c1a184';c.beginPath();c.roundRect(552,382,360,18,5);c.fill();c.fillStyle='#ddc2a4';c.fillRect(552,382,360,5);
 c.fillStyle='#aeb5bb';c.beginPath();c.roundRect(626,369,90,12,3);c.fill();c.strokeStyle='#79818c';c.lineWidth=1;for(let i=0;i<12;i++){c.beginPath();c.moveTo(630+i*7,372);c.lineTo(630+i*7,377);c.stroke();}
 c.fillStyle='#475267';c.fillRect(792,325,9,48);c.fillRect(768,373,60,7);c.beginPath();c.roundRect(724,228,162,108,8);c.fill();c.fillStyle='#202b3b';c.fillRect(732,236,146,88);
 const error=s.t>=14&&s.t<21||s.t>=25;c.font='11px monospace';c.fillStyle=error?'#ff9d9d':'#8dd2b4';c.fillText(error?'BUILD FAILED':s.t>=24?'BUILD PASSED':'hello, overtime',740,254);
 for(let i=0;i<5;i++){c.fillStyle=error?'#c77986':['#89aac6','#b1a0cb','#7ab8a8'][i%3];c.fillRect(741+(i%2)*9,266+i*10,30+(i*17+Math.floor(s.t*3))%80,3);}
 c.fillStyle='#f0e7d8';c.beginPath();c.roundRect(848,348,25,32,4);c.fill();c.strokeStyle='#e4d5c2';c.lineWidth=4;c.beginPath();c.arc(876,361,8,-Math.PI/2,Math.PI/2);c.stroke();
 c.font='14px system-ui';c.fillStyle='#716b75';c.textAlign='center';const lines=s.t<4?'只改一个小 bug，应该很快。':s.t<6.4?'先把椅子拉出来……':s.t<10?'好，开始今天的工作。':s.t<14?'哒哒哒哒哒……':s.t<16?'怎么从 1 个错误变成 37 个了？！':s.t<21?'我是谁……我为什么要写代码……':s.t<24?'再试最后一次。':s.t<25?'过了！终于过了！':'产品：顺便再加一个小功能。';c.fillText(lines,500,87);c.textAlign='left';
}
