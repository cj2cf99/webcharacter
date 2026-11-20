"""继续优化：扫描礁岸、透光浅水、真实叶面与有机前景。复用初版建筑和椰树。"""
import argparse,sys,os,runpy,json,math,random
from mathutils import Vector, Matrix, Euler
from math import sin,cos,pi,exp,sqrt
import bpy,numpy as np

parser=argparse.ArgumentParser()
parser.add_argument('--iteration',type=int,default=1)
parser.add_argument('--final',action='store_true')
V2=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.argv=['build.py','--','--round','3','--prepare-only']
globals().update(runpy.run_path(os.path.join(ROOT,'tropical-shallows','build.py')))
from mathutils import Vector,Matrix,Euler
import numpy as np
random.seed(20261116)
OUT=os.path.join(ROOT,'work','tropical-shallows')
MODEL=os.path.join(ROOT,'tropical-shallows','assets','models')
sc=bpy.context.scene
print('V2_BASE_READY',flush=True)

def remove_matching(prefixes):
    for ob in list(sc.objects):
        if ob.name.startswith(tuple(prefixes)): bpy.data.objects.remove(ob,do_unlink=True)

# 仅保留既有木屋与椰树；独立替换本轮需要修正的自然环境和小物。
remove_matching(['湿干沙滩','前景细分沙面','浅海真实','弯曲碎浪','后方珊瑚','水线散礁','远海礁石','灌木与前景','鸡蛋花叶脉','灌木木质','近景鸡蛋花','五瓣鸡蛋花','前景独立沙砾','碎珊瑚','前景空螺壳','五腕颗粒海星','寄居蟹','蟹','分节蟹腿','滨鹬','褐色翼背','鸟眼','涉禽细腿'])
for block in list(bpy.data.meshes):
    if block.users==0: bpy.data.meshes.remove(block)

# 画面参考：水面天际线保持约 44%，降低观察高度，明亮环境填充保留暖侧光。
sc.camera.location.z=2.15
sc.camera.rotation_euler=(Vector((0,10,1.10))-sc.camera.location).to_track_quat('-Z','Y').to_euler()
sc.camera.data.dof.focus_distance=16
sc.camera.data.dof.aperture_fstop=4.5
sc.view_settings.exposure=.15
sc.view_settings.look='AgX - Medium High Contrast'
sun.data.energy=3.5; sun.data.color=(1,.78,.51); sun.data.angle=math.radians(.65)
sun.rotation_euler=Vector((.80,.45,-.38)).to_track_quat('-Z','Y').to_euler()
glints=bpy.data.objects.new('海面反光艺术补光',bpy.data.lights.new('海面反光艺术补光','SUN')); sc.collection.objects.link(glints)
glints.rotation_euler=Vector((.44,-.86,-.32)).to_track_quat('-Z','Y').to_euler(); glints.data.energy=.25; glints.data.angle=math.radians(.53)
glints.data.diffuse_factor=0; glints.data.specular_factor=1.0; glints.data.volume_factor=0
for n in world.node_tree.nodes:
    if n.type=='BACKGROUND': n.inputs['Strength'].default_value=.70 if n==bg else 1.4
# 避免名称变量被建模循环覆盖，按光线混合节点的连接找背景。
wm=next(n for n in world.node_tree.nodes if n.type=='MIX_SHADER')
wm.inputs[1].links[0].from_node.inputs['Strength'].default_value=.58
wm.inputs[2].links[0].from_node.inputs['Strength'].default_value=2.0
for nd in world.node_tree.nodes:
    if nd.type=='TEX_ENVIRONMENT': nd.image=bpy.data.images.load(os.path.join(ROOT,'tropical-shallows/assets/kloofendal_48d_partly_cloudy_puresky_8k.hdr'),check_existing=True)

def coast2(y):
    # 由参考中的左前浪线、涉禽脚点与中段礁石三处投影校准浅湾弧线。
    if y<=3: return 1.127+.447*y-.1396*y*y
    return 1.212+.55*(y-3)
def bed2(x,y):
    d=x-coast2(y)
    # 更平缓的水下沙坡；湿沙带有光滑连续的坡度，不放可见的垂直水壁。
    z=.025+.069*min(7,max(d,0))+.092*min(d,0)
    return z+.006*noise.noise_vector(Vector((x*4,y*4,0)))[0]
def wet2(x,y):
    d=x-coast2(y)
    return .9*exp(-((d-.58)/.72)**2)
wave_rng=random.Random(774)
waves=[]
for wavelength in (.32,.43,.57,.73,.93,1.2,1.6,2.1,2.8,3.7):
    direction=wave_rng.uniform(-.8,.85); amp=.0045*wavelength**.65
    waves.append((2*pi*cos(direction)/wavelength,2*pi*sin(direction)/wavelength,amp,wave_rng.random()*2*pi))
def sea_z(x,y):
    d=max(0,coast2(y)+.8-x)
    a=min(d*1.6,1)
    return .078+a*sum(2.2*amplitude*sin(kx*x+ky*y+phase) for kx,ky,amplitude,phase in waves)

# 材质重新接线，湿度同时控制沙子的颜色和表面粗糙度。
smat=mat('浅奶油色珊瑚砂',(.65,.51,.34),.85)
pbr_images(smat,'coast_sand_01',1.8)
bs=smat.node_tree.nodes.get('Principled BSDF'); old=bs.inputs['Base Color'].links[0].from_socket
hs=node(smat,'ShaderNodeHueSaturation',Saturation=.98,Value=1.25); smat.node_tree.links.new(old,hs.inputs['Color'])
attr2=node(smat,'ShaderNodeAttribute'); attr2.attribute_name='wetness'
mx=node(smat,'ShaderNodeMixRGB'); mx.blend_type='MULTIPLY'; mx.inputs[2].default_value=(.43,.47,.47,1)
link(smat,attr2,'Fac',mx,0); link(smat,hs,'Color',mx,1); link(smat,mx,0,bs,'Base Color')
rough=node(smat,'ShaderNodeMapRange'); rough.inputs['To Min'].default_value=.88; rough.inputs['To Max'].default_value=.19
link(smat,attr2,'Fac',rough,'Value'); link(smat,rough,'Result',bs,'Roughness')
micro=node(smat,'ShaderNodeTexNoise',Scale=650.0,Detail=2.0)
tc=node(smat,'ShaderNodeTexCoord'); link(smat,tc,'Object',micro,'Vector')
bu=node(smat,'ShaderNodeBump',Strength=.30,Distance=.0016)
oldnormal=bs.inputs['Normal'].links[0].from_socket; smat.node_tree.links.new(oldnormal,bu.inputs['Normal']); link(smat,micro,'Fac',bu,'Height'); link(smat,bu,'Normal',bs,'Normal')
v=[];f=[];weights=[]
NX,NY=360,420
for j in range(NY+1):
    t=j/NY; y=-20+120*t*t
    for i in range(NX+1):
        t=i/NX; x=-40+80*t
        z=bed2(x,y)+.003*noise.fractal(Vector((x*13,y*13,.17)),1,2,3)
        v.append((x,y,z)); weights.append(wet2(x,y))
for j in range(NY):
    for i in range(NX):
        k=j*(NX+1)+i; f.append((k,k+1,k+NX+2,k+NX+1))
ob=mesh('连续浅海沙床与湿干沙滩',v,f,[smat],smooth=True)
at=ob.data.attributes.new('wetness','FLOAT','POINT')
for i,w in enumerate(weights): at.data[i].value=w

# 近处沙面有真实亚厘米起伏和不均匀颗粒，不靠平面颜色充当沙床。
heightimg=bpy.data.images.load(os.path.join(ROOT,'tropical-shallows/assets/coast_sand_01_disp_2k.jpg'),check_existing=True)
hp=np.empty(len(heightimg.pixels),dtype=np.float32); heightimg.pixels.foreach_get(hp); hp=hp.reshape(heightimg.size[1],heightimg.size[0],4)
v=[];f=[];weights=[];NX,NY=340,380
for j in range(NY+1):
    y=-12.5+14*j/NY
    for i in range(NX+1):
        x=-6+15*i/NX; wet=wet2(x,y)
        hh=float(hp[int((y/1.8%1)*(heightimg.size[1]-1)),int((x/1.8%1)*(heightimg.size[0]-1)),0])
        rel=.002+.023*hh*(1-.6*wet)+.006*(1+noise.noise(Vector((x*7,y*7,1))))
        v.append((x,y,bed2(x,y)+rel)); weights.append(wet)
for j in range(NY):
    for i in range(NX):
        k=j*(NX+1)+i; f.append((k,k+1,k+NX+2,k+NX+1))
ob=mesh('前景砂砾真实高度面',v,f,[smat],smooth=True); at=ob.data.attributes.new('wetness','FLOAT','POINT')
for i,w in enumerate(weights): at.data[i].value=w

wmat=mat('清水物理界面',(.018,.30,.36),.045)
bs=wmat.node_tree.nodes.get('Principled BSDF'); bs.inputs['IOR'].default_value=1.333
depth_attr=node(wmat,'ShaderNodeAttribute'); depth_attr.attribute_name='depth_fraction'
depth_map=node(wmat,'ShaderNodeMapRange'); depth_map.inputs['To Min'].default_value=.98; depth_map.inputs['To Max'].default_value=.40
link(wmat,depth_attr,'Fac',depth_map,'Value'); link(wmat,depth_map,'Result',bs,'Transmission Weight')
depth_color=node(wmat,'ShaderNodeMixRGB'); depth_color.inputs[1].default_value=(.70,.85,.82,1); depth_color.inputs[2].default_value=(.012,.25,.27,1)
link(wmat,depth_attr,'Fac',depth_color,0); link(wmat,depth_color,0,bs,'Base Color')
bs.inputs['Specular IOR Level'].default_value=.25
tc=node(wmat,'ShaderNodeTexCoord'); mp=node(wmat,'ShaderNodeVectorMath'); mp.operation='MULTIPLY'; mp.inputs[1].default_value=(1,1.8,1); link(wmat,tc,'Object',mp,0)
ns=node(wmat,'ShaderNodeTexNoise',Scale=6.2,Detail=3.4,Roughness=.68); link(wmat,mp,'Vector',ns,'Vector')
bu=node(wmat,'ShaderNodeBump',Strength=.32,Distance=.027); link(wmat,ns,'Fac',bu,'Height'); link(wmat,bu,'Normal',bs,'Normal')
fine=node(wmat,'ShaderNodeTexNoise',Scale=35.0,Detail=2.0); link(wmat,tc,'Object',fine,'Vector')
fb=node(wmat,'ShaderNodeBump',Strength=.32,Distance=.013); link(wmat,bu,'Normal',fb,'Normal'); link(wmat,fine,'Fac',fb,'Height'); link(wmat,fb,'Normal',bs,'Normal')
v=[];f=[];water_depth=[];NX,NY=960,1000
for j in range(NY+1):
    t=j/NY
    y=-26+95*t if t<.82 else 51.9+(t-.82)*22000
    for i in range(NX+1):
        d=(85+max(0,y-60)*2.0)*(i/NX); x=coast2(y)+1.10-d
        v.append((x,y,sea_z(x,y))); water_depth.append(max(0,min(1,(d-.7)/14.0)))
for j in range(NY):
    for i in range(NX):
        k=j*(NX+1)+i; f.append((k,k+NX+1,k+NX+2,k+1))
# 明确的平底封闭体避免沿波浪法线挤出厚水体造成的自交和重叠介质。
top_count=len(v); v.extend([(x,y,-18) for x,y,z in v.copy()])
top_faces=f.copy(); f.extend([tuple(k+top_count for k in reversed(face)) for face in top_faces])
boundary=list(range(NX+1))+[j*(NX+1)+NX for j in range(1,NY+1)]+[NY*(NX+1)+i for i in range(NX-1,-1,-1)]+[j*(NX+1) for j in range(NY-1,0,-1)]
for i,a in enumerate(boundary):
    b=boundary[(i+1)%len(boundary)]; f.append((a,b,b+top_count,a+top_count))
ob=mesh('透光浅水与细波',v,f,[wmat],smooth=True)
at=ob.data.attributes.new('depth_fraction','FLOAT','POINT')
for i,w in enumerate(water_depth): at.data[i].value=w

# 浪沫带与细泡共同形成不规则的薄层；不画两条连续的白线。
fmat=mat('薄海沫乳白',(.89,.91,.84),.45)
bs=fmat.node_tree.nodes.get('Principled BSDF'); tc=node(fmat,'ShaderNodeTexCoord')
ns=node(fmat,'ShaderNodeTexNoise',Scale=29.0,Detail=4.0,Roughness=.75); link(fmat,tc,'Object',ns,'Vector')
vor=node(fmat,'ShaderNodeTexVoronoi',Scale=65.0); vor.feature='DISTANCE_TO_EDGE'; link(fmat,tc,'Object',vor,'Vector')
ra=node(fmat,'ShaderNodeValToRGB'); ra.color_ramp.elements[0].position=.012; ra.color_ramp.elements[0].color=(1,1,1,1); ra.color_ramp.elements[1].position=.055; ra.color_ramp.elements[1].color=(0,0,0,1); link(fmat,vor,'Distance',ra,'Fac')
fac=node(fmat,'ShaderNodeMath'); fac.operation='MULTIPLY'; link(fmat,ns,'Fac',fac,0); link(fmat,ra,'Color',fac,1)
tr=node(fmat,'ShaderNodeBsdfTransparent'); mx=node(fmat,'ShaderNodeMixShader'); link(fmat,fac,0,mx,0); link(fmat,tr,0,mx,1); link(fmat,bs,0,mx,2); link(fmat,mx,0,fmat.node_tree.nodes.get('Material Output'),'Surface')
boost=node(fmat,'ShaderNodeMath'); boost.operation='MULTIPLY'; boost.inputs[1].default_value=2.8; link(fmat,fac,0,boost,0); link(fmat,boost,0,mx,0)
v=[];f=[]
for j in range(1600):
    y=-20+j*40/1599; center=coast2(y)+.72+.06*sin(y*2.7)+.025*sin(y*9)
    width=.45+.20*sin(y*4)**2
    k=len(v)
    for i in range(5):
        x=center-width*i/4; v.append((x,y,sea_z(x,y)+.008))
    if j:
        for i in range(4): f.append((k-5+i,k-4+i,k+1+i,k+i))
mesh('蕾丝状近岸浪沫',v,f,[fmat])
bubbles=Batch(); bubblemat=mat('破碎白色泡缘',(.83,.87,.81),.55)
rng=random.Random(432)
for i in range(5800):
    y=rng.uniform(-15,9); center=coast2(y)+.65+.06*sin(y*2.7)+.025*sin(y*9)
    x=center-abs(rng.gauss(.25,.22)); rad=rng.uniform(.004,.022)
    for j in range(8):
        a=j*2*pi/8; b=(j+1)*2*pi/8
        bubbles.face([(x+rr*cos(t),y+rr*sin(t),sea_z(x,y)+.011) for rr,t in ((rad*.72,a),(rad,a),(rad,b),(rad*.72,b))])
bubbles.finish('独立海沫泡缘', [bubblemat],False)

# 保留木屋，但稍向后移并降低基台，露出前廊和不规则礁岸。
house_prefix=('基座','甲板条','屋柱','后墙','落地玻璃','门窗','帘褶','侧廊','前廊','栏杆','茅顶','三万束','前檐','斜撑','躺椅','椅腿','扶手','软坐垫','靠垫','小茶几','桌腿')
for ob in sc.objects:
    if ob.name.startswith(house_prefix): ob.location+=Vector((.2,1.2,-.05))
    if ob.name.startswith(('茅顶底层','三万束')):
        for vert in ob.data.vertices: vert.co.z+=max(0,vert.co.z-4.6)*.55
for material in thatch:
    for nd in material.node_tree.nodes:
        if nd.type=='VALTORGB':
            for el in nd.color_ramp.elements: el.color=(el.color[0]*.45,el.color[1]*.39,el.color[2]*.33,1)
foundation=bpy.data.objects.get('基座')
foundation.scale.x=2.4/7.8
foundation.location+=foundation.rotation_euler.to_matrix()@Vector((-2.6,0,0))
for dx,dy in ((.4,-3.1),(3.3,-3.1),(.4,1.8),(3.3,1.8)):
    p=foundation.location+foundation.rotation_euler.to_matrix()@Vector((dx+2.6,dy,0))
    ob=cube('开放木廊承重柱',p,(.20,.20,1.5),wood,.015); ob.rotation_euler=foundation.rotation_euler
glassbs=glass.node_tree.nodes.get('Principled BSDF'); glassbs.inputs['Base Color'].default_value=(.90,.84,.72,1); glassbs.inputs['Transmission Weight'].default_value=.98; glassbs.inputs['Specular IOR Level'].default_value=.25
for nd in bark.node_tree.nodes:
    if nd.type=='VALTORGB':
        for el in nd.color_ramp.elements: el.color=tuple(c*.62 for c in el.color[:3])+(1,)

# 木廊家具使用弯曲藤框、细条交织与局部靠垫，避免两把方盒椅。
remove_matching(['躺椅','椅腿','扶手','软坐垫','靠垫','小茶几','桌腿'])
house_rot=Matrix.Rotation(math.radians(-18),3,'Z')
def hp(dx,dy,z): return Vector((8.8,12.6,1.05))+house_rot@Vector((dx,dy,z))
rattan=textured('细编藤条',(.07,.026,.008),(.25,.12,.038),28,.58,.002)
rf=Batch(); weave=Batch()
for ci,dx in enumerate((-.3,1.95)):
    dy=-2.55
    for side in (-1,1):
        x=dx+side*.64
        rf.tube([hp(x,dy-.64,1.70),hp(x,dy-.58,2.02),hp(x,dy+.43,2.04),hp(x,dy+.73,2.86)],[.026,.031,.032,.025],sides=9)
        rf.tube([hp(x,dy+.52,1.70),hp(x,dy+.45,2.05)],[.027,.027],sides=9)
        rf.tube([hp(x,dy-.57,2.06),hp(x,dy-.47,2.35),hp(x,dy+.27,2.36),hp(x,dy+.59,2.50)],[.027,.030,.030,.027],sides=9)
    for zz,yy in ((2.04,dy-.58),(2.04,dy+.43),(2.86,dy+.73)):
        rf.tube([hp(dx-.64,yy,zz),hp(dx+.64,yy,zz)],[.024,.024],sides=9)
    for j in range(42):
        t=j/41; xx=dx-.60+1.2*t
        weave.tube([hp(xx,dy+.42+.30*k/8,2.07+.76*k/8+.004*sin(k*pi+j)) for k in range(9)],[.0038]*9,sides=4)
    for j in range(29):
        t=j/28; yy=dy+.42+.3*t; zz=2.07+.76*t
        weave.tube([hp(dx-.60+1.2*k/10,yy+.004*sin(k*pi+j),zz) for k in range(11)],[.004]*11,sides=4)
    for j in range(48):
        yy=dy-.56+j*.020
        weave.tube([hp(dx-.6,yy,2.07),hp(dx+.6,yy,2.07)],[.004,.004],sides=4)
    for j in range(45):
        xx=dx-.6+j*.027
        weave.tube([hp(xx,dy-.55,2.072),hp(xx,dy+.42,2.072)],[.004,.004],sides=4)
    cloth=cushion if ci==1 else curtain
    seat=cube('藤椅软坐垫',hp(dx,dy-.04,2.15),(1.16,1.10,.15),cloth,.065); seat.rotation_euler.z=math.radians(-18)
    if ci==1:
        pillow=cube('蓝绿倚靠枕',hp(dx+.08,dy+.54,2.46),(.96,.22,.64),cushion,.075)
        pillow.rotation_euler=(house_rot@Euler((-.30,0,.04)).to_matrix()).to_euler()
rf.finish('弯曲藤编椅框',[rattan]); weave.finish('藤椅细密交织',[rattan])
table=Batch()
table.tube([hp(-1.75,-2.7,1.70),hp(-1.75,-2.7,2.09)],[.045,.045],sides=10)
table.tube([hp(-2.03,-2.7,1.70),hp(-1.47,-2.7,1.70)],[.02,.02],sides=8)
table.finish('茶几藤支架',[rattan]); ob=cube('柚木小茶几',hp(-1.75,-2.7,2.10),(.72,.62,.065),plank,.025); ob.rotation_euler.z=math.radians(-18)

# 四坡茅草顶：左端斜坡把低檐连向后退的短屋脊，消除正面山墙的盒状轮廓。
remove_matching(['茅顶底层','三万束'])
roof_vertices=[hp(-4.9,-4.1,4.6),hp(4.9,-4.1,4.6),hp(4.9,3.2,4.6),hp(-4.9,3.2,4.6),hp(-1.5,0,7.7),hp(1.5,0,7.7)]
mesh('四坡茅顶暗底',roof_vertices,[(0,1,5,4),(1,2,5),(2,3,4,5),(3,0,4)],[thatch[0]])
roof_fibers=Batch()
def roof_point(side,u,t):
    if side==0: return hp((-1.5+3*u)*(1-t)+(-4.9+9.8*u)*t,-4.1*t,7.7-3.1*t)
    if side==1: return hp((-1.5+3*u)*(1-t)+(-4.9+9.8*u)*t,3.2*t,7.7-3.1*t)
    sign=-1 if side==2 else 1
    return hp(sign*(1.5+3.4*t),(-4.1+7.3*u)*t,7.7-3.1*t)
roof_rng=random.Random(381)
for side,count in ((0,18000),(1,14000),(2,8000),(3,8000)):
    for i in range(count):
        u=roof_rng.random(); t=roof_rng.random(); span=roof_rng.uniform(.045,.17); du=roof_rng.uniform(.0004,.0013)
        pts=[]
        for offset in (0,.5,1):
            tt=t+span*offset
            drop= max(0,tt-1)*roof_rng.uniform(.25,.9)
            for s in (-1,1): pts.append(roof_point(side,u+s*du,tt)+Vector((0,0,.025+.012*sin(pi*offset)-drop)))
        mi=roof_rng.randrange(5); roof_fibers.face([pts[0],pts[1],pts[3],pts[2]],mi); roof_fibers.face([pts[2],pts[3],pts[5],pts[4]],mi)
roof_fibers.finish('四坡弯曲茅草细束',thatch,False)

def import_scan(asset):
    before=set(sc.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODEL,asset,asset+'_2k.gltf'))
    result=[o for o in set(sc.objects)-before if o.type=='MESH']
    for o in result:
        # 把导入坐标烘进网格，实例只用一个清晰的世界变换。
        o.data.transform(o.matrix_world); o.matrix_world=Matrix.Identity(4)
        o.name='扫描原型_'+asset+'_'+o.name
    return result

def instance(proto,name,location,scale=(1,1,1),yaw=0):
    ob=bpy.data.objects.new(name,proto.data); sc.collection.objects.link(ob)
    ob.location=location; ob.scale=scale; ob.rotation_euler.z=yaw
    return ob

coast_proto=import_scan('coast_land_rocks_03')[0]
cached_normals=[ve.normal.copy() for ve in coast_proto.data.vertices]
for ve,normal in zip(coast_proto.data.vertices,cached_normals):
    t=max(0,min(1,(ve.co.x+4)/8)); ve.co.z*=1+.58*t
    distance=noise.voronoi(ve.co*29)[0][0]
    pore=.023*(max(0,.29-distance)/.29)**2
    ve.co+=normal*(.005*noise.noise(ve.co*75)-pore)
coast_proto.data.update()
rockbs=coast_proto.data.materials[0].node_tree.nodes.get('Principled BSDF')
rm=coast_proto.data.materials[0]; old=rockbs.inputs['Base Color'].links[0].from_socket
hs=node(rm,'ShaderNodeHueSaturation',Saturation=.30,Value=.80); rm.node_tree.links.new(old,hs.inputs['Color'])
rock_tint=node(rm,'ShaderNodeMixRGB'); rock_tint.blend_type='MULTIPLY'; rock_tint.inputs[0].default_value=1; rock_tint.inputs[2].default_value=(.92,.82,.72,1); link(rm,hs,'Color',rock_tint,1); link(rm,rock_tint,0,rockbs,'Base Color')
tc=node(rm,'ShaderNodeTexCoord'); pores=node(rm,'ShaderNodeTexVoronoi',Scale=80.0); link(rm,tc,'Object',pores,'Vector')
pr=node(rm,'ShaderNodeValToRGB'); pr.color_ramp.elements[0].position=.18; pr.color_ramp.elements[1].position=.40; link(rm,pores,'Distance',pr,'Fac')
pb=node(rm,'ShaderNodeBump',Strength=.65,Distance=.022); oldnormal=rockbs.inputs['Normal'].links[0].from_socket; rm.node_tree.links.new(oldnormal,pb.inputs['Normal']); link(rm,pr,'Color',pb,'Height'); link(rm,pb,'Normal',rockbs,'Normal')
for i,(loc,scale,yaw) in enumerate([((-3.1,9.0,.05),(1.05,1.0,1.65),.20),((3.2,11,.05),(.8,.9,1.35),-1.6)]):
    instance(coast_proto,'真实侵蚀礁岸_%02d'%i,loc,scale,yaw)
boulder_proto=import_scan('boulder_01')[0]
bm=boulder_proto.data.materials[0]; bbs=bm.node_tree.nodes.get('Principled BSDF'); old=bbs.inputs['Base Color'].links[0].from_socket
bh=node(bm,'ShaderNodeHueSaturation',Saturation=.60,Value=1.20); bm.node_tree.links.new(old,bh.inputs['Color']); link(bm,bh,'Color',bbs,'Base Color')
for i,(x,y,s) in enumerate([(-4.3,8.5,1.0),(-1,8,1.4),(1.1,6.1,1.1),(2,4.8,.95),(3.5,5.3,.7),(5.3,5.8,.95),(6,8.7,1.1),(7.2,6.2,.8),(7.8,8,1.2)]):
    instance(boulder_proto,'散落潮间礁石_%02d'%i,(x,y,bed2(x,y)-.12),(s,s,s*.85),i*1.7)
for i,(x,y,s,rx,ry) in enumerate([(-2,8.3,1.8,.3,.4),(-.2,8.4,1.7,.4,-.5),(1.1,8.8,1.9,.2,.7),(1.5,4.6,1.3,.2,.65),(2.9,4.6,1.1,-.3,-.4)]):
    obj=instance(boulder_proto,'潮礁基底与前缘块石_%02d'%i,(x,y,0),(s,s,s),i*1.8)
    obj.rotation_euler.x=rx; obj.rotation_euler.y=ry; bpy.context.view_layer.update()
    low=min((obj.matrix_world@Vector(c)).z for c in obj.bound_box)
    obj.location.z+=max(-.16,bed2(x,y))-.05-low
for i in range(8):
    instance(boulder_proto,'远海低礁_%02d'%i,(-30+i*3.4,55+i*2,-.3),(.8,.8,.5),i*2)
tree_proto=import_scan('island_tree_01')[0]
# 部分埋干，树冠本身构成层次不齐的热带灌丛，而不是均匀球状树篱。
for i,(x,y,s,z) in enumerate([(-2.4,13,1.0,-.10),(1,13.8,1.1,-.15),(3.3,15.7,1.25,-.2),(7,20,1.3,0),(11.4,16.4,1.35,.2),(15.6,17,1.2,0),(-.3,19.5,1.3,0),(5.5,23,1.3,0),(17,24,1.4,.2),(6.5,7.7,.46,.2)]):
    instance(tree_proto,'扫描热带树冠_%02d'%i,(x,y,z),(s,s,s),i*2.399)
plant_protos=import_scan('anthurium_botany_01')
for i in range(30):
    x=rng.uniform(0,11); y=rng.uniform(7,14); s=rng.uniform(1.0,1.8)
    instance(plant_protos[i%len(plant_protos)],'岩缝阔叶草_%02d'%i,(x,y,max(.3,bed2(x,y))),(s,s,s),i*2.1)
for p in [coast_proto,boulder_proto,tree_proto,*plant_protos]: bpy.data.objects.remove(p,do_unlink=True)

# 近景鸡蛋花：真实叶面 atlas 的轮廓采样，弯曲细分网格，柔和透射。
atlaspath=os.path.join(MODEL,'island_tree_01/textures/island_tree_01_leaves_diff_2k.jpg')
atlas=bpy.data.images.load(atlaspath,check_existing=True)
pix=np.empty(len(atlas.pixels),dtype=np.float32); atlas.pixels.foreach_get(pix); pix=pix.reshape((atlas.size[1],atlas.size[0],4))
leafmat=mat('近景照片叶面',(.12,.26,.025),.32)
bs=leafmat.node_tree.nodes.get('Principled BSDF'); bs.inputs['Subsurface Weight'].default_value=.08; bs.inputs['Subsurface Radius'].default_value=(.2,1,.1); bs.inputs['Coat Weight'].default_value=.15
tex=node(leafmat,'ShaderNodeTexImage'); tex.image=atlas
lh=node(leafmat,'ShaderNodeHueSaturation',Hue=.535,Saturation=1.15,Value=.95); link(leafmat,tex,'Color',lh,'Color'); link(leafmat,lh,'Color',bs,'Base Color')
normaltex=node(leafmat,'ShaderNodeTexImage'); normaltex.image=bpy.data.images.load(os.path.join(MODEL,'island_tree_01/textures/island_tree_01_leaves_nor_gl_2k.jpg'),check_existing=True); normaltex.image.colorspace_settings.name='Non-Color'
nm=node(leafmat,'ShaderNodeNormalMap',Strength=.65); link(leafmat,normaltex,'Color',nm,'Color'); link(leafmat,nm,'Normal',bs,'Normal')
trans=node(leafmat,'ShaderNodeBsdfTranslucent'); link(leafmat,lh,'Color',trans,'Color')
mx=node(leafmat,'ShaderNodeMixShader'); mx.inputs[0].default_value=.18; link(leafmat,bs,0,mx,1); link(leafmat,trans,0,mx,2); link(leafmat,mx,0,leafmat.node_tree.nodes.get('Material Output'),'Surface')
lv=[];lf=[];luv=[]; branch=Batch()
def photo_leaf(base,direction,L,W,roll,which):
    base=Vector(base); d=Vector(direction).normalized(); n=Vector((.1,-1,.22)); u=d.cross(n).normalized(); n=u.cross(d).normalized()
    u2=u*cos(roll)+n*sin(roll); n2=n*cos(roll)-u*sin(roll)
    nr,nc=(34,8) if base.y<0 else (12,4); start=len(lv)
    umin,umax=(.17,.333) if which%2==0 else (.50,.66)
    for j in range(nr+1):
        t=j/nr; vv=.612+t*.368; row=min(atlas.size[1]-1,int(vv*atlas.size[1]))
        lo,hi=int(umin*atlas.size[0]),int(umax*atlas.size[0]); candidates=np.where(np.max(pix[row,lo:hi,:3],axis=1)>.032)[0]
        if len(candidates): ul=(lo+int(candidates[0])+1)/atlas.size[0]; ur=(lo+int(candidates[-1])-1)/atlas.size[0]
        else: ul=ur=(umin+umax)*.5
        half=max(.001,(ur-ul)/(umax-umin)); drift=((ul+ur)*.5-(umin+umax)*.5)/(umax-umin)
        for k in range(nc+1):
            s=k/nc*2-1; cu=ul+(ur-ul)*k/nc
            p=base+d*L*t+u2*W*(s*half+drift)+n2*(L*.10*sin(pi*t)-L*.16*t*t-W*.14*s*s*sin(pi*t))
            lv.append(p); luv.append((cu,vv))
    for j in range(nr):
        for k in range(nc):
            a=start+j*(nc+1)+k; lf.append((a,a+1,a+nc+2,a+nc+1))
    branch.tube([base,base+d*L*.15],[.006,.002],sides=5)

clusters=[((2.1,-9.7,1.1),.56),((2.7,-8.8,2.1),.65),((2.2,-8.0,3.2),.63),((3.3,-6.8,4.3),.7),((2.0,-6.8,3.8),.55)]
for ci,(c,size) in enumerate(clusters):
    c=Vector(c)
    for i in range(9):
        a=i*2.399+ci; d=Vector((cos(a),rng.uniform(-.4,.4),sin(a)*.8))
        photo_leaf(c,d,size*rng.uniform(.8,1.2),size*.25,rng.uniform(-.45,.45),i)
near_bark=textured('鸡蛋花褐色枝皮',(.075,.045,.020),(.22,.15,.075),16,.77,.004)
branch.finish('细分鸡蛋花叶柄',[near_bark])
near_leaf_count=len(lv)
# 大叶灌丛补足参考图中的浓密绿色上层，扫描树提供真实枝干与内层细叶。
for ci,(center,rx,rz,count) in enumerate([((-2.0,12.5,3.9),2.3,1.8,420),((.7,14.3,5.0),2.7,2.0,500),((3.0,16.0,5.5),2.7,2.2,450),((8.2,20,5),3.0,2.1,500),((12.0,13.5,4.0),2.8,2.2,400),((5.7,8.0,2.0),1.3,1.0,180)]):
    center=Vector(center)
    for i in range(int(count*2.4)):
        a=rng.uniform(0,2*pi); z=rng.uniform(-1,1); r=rng.random()**.35
        p=center+Vector((cos(a)*rx*r,sin(a)*rx*r,z*rz*r))
        d=Vector((cos(a),sin(a)*.7,rng.uniform(-.5,1)))
        L=rng.uniform(.34,.68)
        photo_leaf(p,d,L,L*.25,rng.uniform(-1.2,1.2),i)
ob=mesh('照片纹理弯曲鸡蛋花叶',lv,lf,[leafmat],smooth=True); uv=ob.data.uv_layers.new(name='LeafAtlas')
for poly in ob.data.polygons:
    for li in poly.loop_indices: uv.data[li].uv=luv[ob.data.loops[li].vertex_index]
trunks=Batch(); trunks.tube([(4,-10.3,.2),(4,-9.4,1.6),(4,-8.3,3.5),(4.4,-6.8,4.6)],[.035,.03,.025,.012],sides=10)
for c,size in clusters:
    p=Vector(c); trunks.tube([p+Vector((1.0,.1,.2)),p+Vector((.4,.05,.13)),p],[.018,.012,.005],sides=8)
trunks.finish('鸡蛋花分叉木枝',[near_bark])
petalmat=mat('鸡蛋花乳白渐黄花瓣',(.92,.89,.76),.36)
bs=petalmat.node_tree.nodes.get('Principled BSDF'); bs.inputs['Subsurface Weight'].default_value=.18; bs.inputs['Subsurface Radius'].default_value=(1,.7,.3)
tc=node(petalmat,'ShaderNodeTexCoord'); sep=node(petalmat,'ShaderNodeSeparateXYZ'); link(petalmat,tc,'UV',sep,0)
ra=node(petalmat,'ShaderNodeValToRGB'); ra.color_ramp.elements[0].color=(.92,.48,.006,1); ra.color_ramp.elements[1].color=(.96,.94,.83,1); ra.color_ramp.elements[1].position=.57
link(petalmat,sep,'Y',ra,'Fac'); link(petalmat,ra,'Color',bs,'Base Color')
pv=[];pf=[];pu=[]
def plumeria(p,rad,roll):
    p=Vector(p); n=Vector((.1,-1,.32)).normalized(); u=Vector((1,0,-.1)).normalized(); vv=n.cross(u).normalized()
    center=uvball('鸡蛋花黄蕊',p+n*.008,(rad*.18,rad*.07,rad*.18),yellow,24,12)
    for pet in range(5):
        angle=pet*2*pi/5+roll; a=u*cos(angle)+vv*sin(angle); side=n.cross(a); base=len(pv)
        for j in range(15):
            t=j/14
            for k in range(9):
                s=k/8*2-1; width=rad*.49*max(0,sin(pi*t))**.62
                pt=p+a*(rad*t)+side*(width*s+rad*.14*sin(pi*t))+n*(rad*.23*sin(pi*t)-rad*.05*s*s)
                pv.append(pt); pu.append((k/8,t))
        for j in range(14):
            for k in range(8):
                a=base+j*9+k; pf.append((a,a+1,a+10,a+9))
for ci in (1,2,3,4):
    p=Vector(clusters[ci][0])
    for j in range(4): plumeria(p+Vector((rng.uniform(-.17,.17),-.05,rng.uniform(-.1,.16))),rng.uniform(.12,.20),rng.random()*pi)
ob=mesh('弯曲五瓣鸡蛋花',pv,pf,[petalmat],smooth=True); uv=ob.data.uv_layers.new(name='Petals')
for p in ob.data.polygons:
    for li in p.loop_indices: uv.data[li].uv=pu[ob.data.loops[li].vertex_index]
# 近景枝叶实物移至镜头前 2–4 米并同比缩小，投影构图不变，获得真实景深。
camera_pos=sc.camera.location.copy(); near_scale=.48
leaf_ob=bpy.data.objects.get('照片纹理弯曲鸡蛋花叶')
for ve in list(leaf_ob.data.vertices)[:near_leaf_count]: ve.co=camera_pos+(ve.co-camera_pos)*near_scale
for name in ('细分鸡蛋花叶柄','鸡蛋花分叉木枝','弯曲五瓣鸡蛋花'):
    obj=bpy.data.objects.get(name)
    for ve in obj.data.vertices: ve.co=camera_pos+(ve.co-camera_pos)*near_scale
for obj in sc.objects:
    if obj.name.startswith('鸡蛋花黄蕊'):
        obj.location=camera_pos+(obj.location-camera_pos)*near_scale; obj.scale*=near_scale

# 星状海星曲面：连通中央盘、圆润五腕和细小石灰质颗粒。
star2=textured('海星砂色细皮',(.32,.19,.075),(.66,.48,.25),70,.83,.003)
sx,sy=-.95,-9.2; sz=bed2(sx,sy)+.018
sv=[];sf=[];NT,NR=220,22
def star_surface(t,r):
    outline=.155+.44*((1+cos(5*t+.35))*.5)**2.6
    rr=outline*r
    return Vector((sx+rr*cos(t),sy+rr*sin(t),sz+.055*(1-r*r)**.65+.012*sin(3*t)*r*r))
for i in range(NR+1):
    r=i/NR
    for j in range(NT): sv.append(star_surface(j*2*pi/NT,r))
for i in range(NR):
    for j in range(NT):
        a=i*NT+j; b=i*NT+(j+1)%NT; sf.append((a,b,b+NT,a+NT))
mesh('连通圆腕海星',sv,sf,[star2],smooth=True)
warts=Batch()
for i in range(1700):
    t=rng.random()*2*pi; r=sqrt(rng.random())*.98; p=star_surface(t,r); size=rng.uniform(.003,.008)
    warts.tube([p,p+Vector((0,0,size))],[size,size*.45],sides=5)
warts.finish('海星表面细颗粒',[star2])

shell2=textured('螺壳奶油浅褐细纹',(.26,.16,.075),(.79,.67,.47),90,.45,.0015)
sb= shell2.node_tree.nodes.get('Principled BSDF')
shell_noise_color=sb.inputs['Base Color'].links[0].from_socket
stc=node(shell2,'ShaderNodeTexCoord'); wav=node(shell2,'ShaderNodeTexWave',Scale=18.0,Distortion=3.0,Detail=3.0); wav.bands_direction='X'; link(shell2,stc,'UV',wav,'Vector')
sr=node(shell2,'ShaderNodeValToRGB'); sr.color_ramp.elements[0].position=.30; sr.color_ramp.elements[0].color=(.34,.24,.14,1); sr.color_ramp.elements[1].position=.62; sr.color_ramp.elements[1].color=(.64,.53,.36,1)
link(shell2,wav,'Fac',sr,'Fac'); shell_mix=node(shell2,'ShaderNodeMixRGB'); shell_mix.inputs[0].default_value=.45; shell2.node_tree.links.new(shell_noise_color,shell_mix.inputs[1]); link(shell2,sr,'Color',shell_mix,2); link(shell2,shell_mix,0,sb,'Base Color'); sb.inputs['Roughness'].default_value=.55
def turban(name,center,size,rot):
    vv=[];ff=[];uvs=[]; e=Euler(rot).to_matrix()
    for i in range(430):
        t=i/429; a=7.0*pi*t; major=.065*exp(2.05*t); tube=major*.72
        for j in range(48):
            b=j*2*pi/48; rib=1+.018*sin(a*28)+.008*sin(a*72)
            p=Vector(((major+tube*cos(b))*cos(a),(major+tube*cos(b))*sin(a),.89*(1-t)**1.30+tube*sin(b)))
            p*=rib*size; vv.append(Vector(center)+e@p); uvs.append((t,j/48))
    for i in range(429):
        for j in range(48):
            a=i*48+j; ff.append((a,i*48+(j+1)%48,(i+1)*48+(j+1)%48,a+48))
    ob=mesh(name,vv,ff,[shell2],smooth=True)
    uv=ob.data.uv_layers.new(name='ShellGrowth')
    for poly in ob.data.polygons:
        for li in poly.loop_indices: uv.data[li].uv=uvs[ob.data.loops[li].vertex_index]
    sol=ob.modifiers.new('螺壳薄壁','SOLIDIFY'); sol.thickness=.006*size
    return ob

xx,yy=1.45,-8.6; zz=bed2(xx,yy)
turban('写实寄居蟹螺壳',(xx+.09,yy+.08,zz+.16),.36,(.25,.85,.20))
turban('写实前景空螺壳',(.63,-9.9,bed2(.63,-9.9)+.03),.27,(.3,.95,1.5))
cr=textured('朱红寄居蟹甲壳',(.11,.018,.004),(.44,.10,.024),110,.52,.0012); cb=Batch()
uvball('写实蟹头',(xx-.15,yy-.12,zz+.17),(.073,.065,.052),cr,32,16)
for s in (-1,1):
    for i in range(3):
        root=Vector((xx+i*.035-.03,yy+s*.065,zz+.20)); knee=root+Vector((-.08+i*.015,s*(.14+i*.03),.06)); tip=knee+Vector((-.04,s*.09,-.24))
        cb.tube([root,root.lerp(knee,.5),knee,tip],[.013,.013,.009,.0025],sides=9)
    root=Vector((xx-.17,yy+s*.08,zz+.17)); p=root+Vector((-.055,s*.045,-.085))
    cb.tube([root,p],[.014,.018],sides=10); uvball('蟹掌钳',p,(.033,.023,.028) if s==1 else (.022,.017,.02),cr,20,12)
    cb.tube([p,p+Vector((-.04,.012,.018))],[.017,.002],sides=8)
    eye=Vector((xx-.20,yy+s*.045,zz+.26)); cb.tube([root,eye],[.005,.003],sides=6); uvball('蟹细眼',eye,(.006,.006,.007),black,16,8)
    ant=Vector((xx-.20,yy+s*.045,zz+.22)); cb.tube([ant,ant+Vector((-.08,s*.015,.14)),ant+Vector((-.22,s*.035,.23))],[.0017,.001,.0003],sides=5)
cb.finish('真实节肢蟹腿',[cr])

# 小滨鹬的窄背、白腹、短颈、细长下探喙与层叠覆羽。
bx,by=-3.25,-4.7; bz=bed2(bx,by)
body=uvball('写实滨鹬白腹',(bx,by,bz+.37),(.26,.115,.15),birdwhite,40,24); body.rotation_euler.y=-.12
uvball('写实滨鹬颈',(bx-.20,by,bz+.35),(.07,.065,.105),birdwhite,32,20)
uvball('写实滨鹬头',(bx-.26,by-.01,bz+.37),(.085,.071,.077),feather,32,20)
uvball('写实滨鹬眼',(bx-.28,by-.079,bz+.387),(.009,.005,.009),black,20,12)
bf=Batch()
for i in range(52):
    t=i/51; x=bx-.15+.42*t; z=bz+.43+.075*sin(pi*t)
    w=.105*max(.1,sin(pi*t)**.5); y=by-.04+.06*sin(i*2.4)
    bf.face([(x-.06,y-w,z),(x+.09,y-w*.6,z-.035),(x+.14,y,z-.06),(x+.09,y+w*.6,z-.035),(x-.06,y+w,z)],i%2)
bf.finish('滨鹬褐羽',[feather,thatch[0]])
bb=Batch(); bb.tube([(bx-.33,by-.01,bz+.35),(bx-.50,by-.01,bz+.19)],[.009,.0008],sides=9)
for s in (-1,1):
    p=Vector((bx+s*.10,by+s*.044,bz+.26)); q=p+Vector((.025,0,-.12)); foot=Vector((bx+s*.13,by+s*.065,bz+.014))
    bb.tube([p,q,foot],[.007,.006,.004],sides=7)
    for k in (-1,0,1): bb.tube([foot,foot+Vector((-.06,k*.023,-.005))],[.004,.001],sides=5)
bb.finish('滨鹬细腿与喙',[black])
anchor=Vector((bx,by,bz))
for ob in sc.objects:
    if ob.type=='MESH' and ob.name.startswith(('写实滨鹬','滨鹬褐羽','滨鹬细腿')):
        inv=ob.matrix_world.inverted()
        for ve in ob.data.vertices: ve.co=inv@(anchor+(ob.matrix_world@ve.co-anchor)*.8)

# 干沙上不均匀分布的砂砾与根木，补足参考的近景尺度线索。
grit=Batch(); gm=[mat('近沙碎粒%d'%i,c,.92) for i,c in enumerate([(.35,.25,.16),(.55,.43,.28),(.22,.17,.11),(.65,.56,.40)])]
for i in range(3500):
    x=rng.uniform(-4,6); y=rng.uniform(-12,-5)
    if x<coast2(y)+1.0: continue
    p=Vector((x,y,bed2(x,y)+.017)); s=rng.uniform(.004,.014)
    a=rng.random()*2*pi; u=Vector((cos(a),sin(a),0))*s; w=Vector((-sin(a),cos(a),0))*s*.7
    top=p+Vector((0,0,s*.6)); mi=rng.choices(range(4),weights=(4,5,1,3))[0]
    grit.face([p-u-w,p+u-w,top],mi); grit.face([p+u-w,p+u+w,top],mi); grit.face([p+u+w,p-u+w,top],mi); grit.face([p-u+w,p-u-w,top],mi)
grit.finish('近景立体沙砾',[*gm],False)
rootmat=textured('海滩风化根木',(.035,.020,.009),(.17,.105,.044),18,.87,.006,(1,1,.25))
root=Batch(); p=Vector((3.5,-5.2,bed2(3.5,-5.2)))
root.tube([p+Vector((-.6,-.1,.03)),p+Vector((-.15,0,.13)),p+Vector((.30,.1,.19)),p+Vector((.6,.25,.24))],[.012,.09,.075,.005],sides=10)
for a in range(5):
    direction=Vector((cos(a*2),sin(a*2),0)); start=p+Vector((.1,0,.10))
    root.tube([start,start+direction*.25+Vector((0,0,.12)),start+direction*.55+Vector((0,0,.01))],[.045,.03,.004],sides=8)
root.finish('沙滩根木',[rootmat])

# 前景椰叶按参考的垂落方向布置，叶轴、两列叶片均有真实深度和重力弯曲。
remove_matching(['近处垂落椰羽','近处椰叶中轴','顶端前景椰树','椰树09'])
bpy.context.view_layer.update()
def frame_point(u,v,depth):
    return sc.camera.matrix_world@Vector(((u-.5)*36/31*depth,(.5-v)*24/31*depth,-depth))
oh=Batch(); oa=Batch()
for c0,c1,c2,width in [((.23,-.08,8),(.15,.04,9),(.10,.18,11),.92),((.44,-.09,8),(.37,.07,10),(.40,.24,12),1.12),((.57,-.09,9),(.53,.03,10),(.55,.16,12),.88)]:
    p0,p1,p2=[frame_point(*c) for c in (c0,c1,c2)]
    def curve(t): return (1-t)**2*p0+2*(1-t)*t*p1+t*t*p2
    oa.tube([curve(i/40) for i in range(41)],[.032*(1-i/42) for i in range(41)],sides=7)
    for i in range(66):
        t=.02+i*.0146; p=curve(t); tangent=(curve(min(1,t+.01))-curve(max(0,t-.01))).normalized()
        side=tangent.cross((sc.camera.location-p).normalized()).normalized()
        length=width*sin(pi*t)**.55*rng.uniform(.90,1.08)
        for s in (-1,1):
            tip=p+side*s*length+tangent*.30+Vector((0,0,-.24-.25*t))
            mid=p.lerp(tip,.52)+Vector((0,0,.045)); w=.026*(1-t*.35)
            oh.face([p-tangent*.012,mid-tangent*w,tip,mid+tangent*w,p+tangent*.012],rng.randrange(6))
oh.finish('参考方向垂落椰羽',leaves); oa.finish('垂落椰叶中轴',[thatch[1]])
for ob in sc.objects:
    if ob.type=='MESH' and ob.name.startswith('椰树00'):
        inv=ob.matrix_world.inverted()
        for ve in ob.data.vertices:
            wp=ob.matrix_world@ve.co; wp.x-=.016*wp.z*wp.z; ve.co=inv@wp

sc.cycles.samples=1024 if V2.final else 192
sc.cycles.use_denoising=False
sc.cycles.caustics_reflective=False; sc.cycles.caustics_refractive=False
sc.cycles.volume_bounces=2
sc.render.resolution_x,sc.render.resolution_y=(1536,1024) if V2.final else (1152,768)
sc.render.filepath=os.path.join(OUT,'v2-%02d.png'%V2.iteration)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'tropical-shallows-v2.blend'),compress=True)
summary={'iteration':V2.iteration,'objects':len(sc.objects),'unique_vertices':sum(len(m.vertices) for m in bpy.data.meshes if m.users>0),'samples':sc.cycles.samples,'resolution':[sc.render.resolution_x,sc.render.resolution_y],'method':'3D Cycles, CC0 scans, physical water, no reference backplate'}
with open(os.path.join(OUT,'v2-%02d.json'%V2.iteration),'w',encoding='utf8') as f: json.dump(summary,f,ensure_ascii=False,indent=2)
print('V2_SCENE_READY',json.dumps(summary),flush=True)
with open(os.path.join(OUT,'v2-%02d.py'%V2.iteration),'w',encoding='utf8') as f:
    f.write(open(os.path.join(ROOT,'tropical-shallows','build_v2.py'),encoding='utf8').read())
bpy.ops.render.render(write_still=True)
print('V2_RENDER_DONE',sc.render.filepath,flush=True)
