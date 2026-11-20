"""参考热带浅滩，独立可重建 Cycles 实体场景。无需第三方包。"""
import bpy, math, random, os, sys, argparse, json, time
from mathutils import Vector, noise
from math import sin, cos, pi, exp

args = argparse.ArgumentParser()
args.add_argument('--round', type=int, default=1, choices=[1, 2, 3])
args.add_argument('--prepare-only', action='store_true', help='仅供后续场景修订复用构建函数，不保存或渲染旧版')
opt = args.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
R = opt.round
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'work', 'tropical-shallows')
os.makedirs(OUT, exist_ok=True)
random.seed(12871)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for datablock in list(bpy.data.materials): bpy.data.materials.remove(datablock)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = [40, 64, 160][R-1]
sc.cycles.use_denoising = True
sc.cycles.max_bounces = 10
sc.cycles.transmission_bounces = 8
sc.cycles.transparent_max_bounces = 8
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
for d in prefs.devices: d.use = d.type == 'OPTIX'
sc.cycles.device = 'GPU'
sc.render.resolution_x, sc.render.resolution_y = [(1152,768),(1152,768),(1536,1024)][R-1]
sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'PNG'
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Medium High Contrast'
sc.view_settings.exposure = -.1 if R==3 else (-.55 if R > 1 else -.3)

def mat(name, color, rough=.5, metallic=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value=(*color,1)
    b.inputs['Roughness'].default_value=rough; b.inputs['Metallic'].default_value=metallic
    return m

def pbr_images(m,asset,meters,blend=.0):
    """世界坐标三向投影：实测纹理用于真实几何表面，不是相机背景。"""
    bs=m.node_tree.nodes.get('Principled BSDF'); tc=node(m,'ShaderNodeTexCoord')
    scale=node(m,'ShaderNodeVectorMath'); scale.operation='SCALE'; scale.inputs['Scale'].default_value=1/meters
    link(m,tc,'Object',scale,0)
    maps={}
    for kind in ('diff','rough','disp'):
        tex=node(m,'ShaderNodeTexImage'); tex.image=bpy.data.images.load(os.path.join(ROOT,'tropical-shallows','assets',asset+'_'+kind+'_2k.jpg'),check_existing=True)
        if kind!='diff': tex.image.colorspace_settings.name='Non-Color'
        tex.projection='BOX'; tex.projection_blend=.25; link(m,scale,'Vector',tex,'Vector'); maps[kind]=tex
    if blend:
        old=bs.inputs['Base Color'].links[0].from_socket
        mix=node(m,'ShaderNodeMixRGB'); mix.inputs[0].default_value=blend
        link(m,maps['diff'],'Color',mix,1); m.node_tree.links.new(old,mix.inputs[2]); link(m,mix,0,bs,'Base Color')
    else: link(m,maps['diff'],'Color',bs,'Base Color')
    link(m,maps['rough'],'Color',bs,'Roughness')
    bump=node(m,'ShaderNodeBump',Strength=.65,Distance=.065 if 'rock' in asset else .018)
    link(m,maps['disp'],'Color',bump,'Height'); link(m,bump,'Normal',bs,'Normal')

def node(m, kind, **vals):
    n=m.node_tree.nodes.new(kind)
    for k,v in vals.items(): n.inputs[k].default_value=v
    return n

def link(m,a,ao,b,bi): m.node_tree.links.new(a.outputs[ao],b.inputs[bi])

def textured(name,c0,c1,scale,rough,bumpdist,stretch=None):
    m=mat(name,c0,rough); b=m.node_tree.nodes.get('Principled BSDF')
    coord=node(m,'ShaderNodeTexCoord')
    tex=node(m,'ShaderNodeTexNoise',Scale=scale,Detail=5.0,Roughness=.72)
    if stretch:
        mp=node(m,'ShaderNodeVectorMath'); mp.operation='MULTIPLY'; mp.inputs[1].default_value=stretch
        link(m,coord,'Object',mp,0); link(m,mp,'Vector',tex,'Vector')
    else: link(m,coord,'Object',tex,'Vector')
    ramp=node(m,'ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color=(*c0,1); ramp.color_ramp.elements[1].color=(*c1,1)
    link(m,tex,'Fac',ramp,'Fac'); link(m,ramp,'Color',b,'Base Color')
    fine=node(m,'ShaderNodeTexNoise',Scale=scale*13,Detail=3.0,Roughness=.7)
    link(m,coord,'Object',fine,'Vector')
    bump=node(m,'ShaderNodeBump',Strength=.5,Distance=bumpdist)
    link(m,fine,'Fac',bump,'Height'); link(m,bump,'Normal',b,'Normal')
    return m

def mesh(name,vs,fs,materials,indices=None,smooth=False):
    me=bpy.data.meshes.new(name); me.from_pydata(vs,[],fs); me.update()
    o=bpy.data.objects.new(name,me); sc.collection.objects.link(o)
    for m in materials: me.materials.append(m)
    for i,p in enumerate(me.polygons):
        p.use_smooth=smooth
        if indices: p.material_index=indices[i]
    return o

def cube(name,loc,scale,m,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.name=name; o.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(m)
    if bevel:
        mod=o.modifiers.new('磨圆棱边','BEVEL'); mod.width=bevel; mod.segments=3
        o.modifiers.new('平滑法线','WEIGHTED_NORMAL')
    return o

def uvball(name,loc,scale,m,seg=24,rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=loc)
    o=bpy.context.object; o.name=name; o.scale=scale; o.data.materials.append(m)
    for p in o.data.polygons: p.use_smooth=True
    return o

class Batch:
    def __init__(self): self.v=[]; self.f=[]; self.mi=[]
    def face(self,vs,mi=0):
        k=len(self.v); self.v.extend(vs); self.f.append(tuple(range(k,k+len(vs)))); self.mi.append(mi)
    def tube(self,pts,radii,mi=0,sides=5):
        k=len(self.v)
        for i,p in enumerate(pts):
            p=Vector(p); dr=Vector(pts[min(i+1,len(pts)-1)])-Vector(pts[max(i-1,0)])
            dr.normalize(); u=dr.cross(Vector((.13,.22,1))).normalized(); v=dr.cross(u).normalized()
            for j in range(sides): self.v.append(p+radii[i]*(cos(j*2*pi/sides)*u+sin(j*2*pi/sides)*v))
        for i in range(len(pts)-1):
            for j in range(sides):
                self.f.append((k+i*sides+j,k+i*sides+(j+1)%sides,k+(i+1)*sides+(j+1)%sides,k+(i+1)*sides+j)); self.mi.append(mi)
    def finish(self,name,mats,smooth=True): return mesh(name,self.v,self.f,mats,self.mi,smooth)

sand=textured('碳酸盐浅沙',(.36,.275,.17),(.76,.64,.45),4,.83,.009)
# 用实际地面顶点的湿度染色，海岸湿沙自然压暗。
b=sand.node_tree.nodes.get('Principled BSDF')
old=b.inputs['Base Color'].links[0].from_socket
attr=node(sand,'ShaderNodeAttribute'); attr.attribute_name='wetness'
mix=node(sand,'ShaderNodeMixRGB'); mix.blend_type='MULTIPLY'; mix.inputs[2].default_value=(.36,.42,.44,1)
sand.node_tree.links.new(old,mix.inputs[1]); link(sand,attr,'Fac',mix,0); link(sand,mix,0,b,'Base Color')
rockmat=textured('多孔石灰质礁岩',(.16,.135,.105),(.58,.55,.43),3.8,.84,.09)
b=rockmat.node_tree.nodes.get('Principled BSDF')
vor=node(rockmat,'ShaderNodeTexVoronoi',Scale=65.0); vor.distance='EUCLIDEAN'
tc=node(rockmat,'ShaderNodeTexCoord'); link(rockmat,tc,'Object',vor,'Vector')
cr=node(rockmat,'ShaderNodeValToRGB'); cr.color_ramp.elements[0].position=.17; cr.color_ramp.elements[1].position=.38
link(rockmat,vor,'Distance',cr,'Fac')
bu=node(rockmat,'ShaderNodeBump',Strength=.8,Distance=.045); link(rockmat,cr,'Color',bu,'Height')
normal=b.inputs['Normal'].links[0].from_socket; rockmat.node_tree.links.new(normal,bu.inputs['Normal']); link(rockmat,bu,'Normal',b,'Normal')
if R==3:
    pbr_images(sand,'coast_sand_01',2.4,.18)
    pbr_images(rockmat,'rock_pitted_mossy',1.25,.35)
    bs=sand.node_tree.nodes.get('Principled BSDF'); old=bs.inputs['Base Color'].links[0].from_socket
    bright=node(sand,'ShaderNodeHueSaturation',Saturation=.72,Value=1.48); sand.node_tree.links.new(old,bright.inputs['Color'])
    wetmix=node(sand,'ShaderNodeMixRGB'); wetmix.blend_type='MULTIPLY'; wetmix.inputs[2].default_value=(.36,.42,.44,1)
    link(sand,bright,'Color',wetmix,1); link(sand,attr,'Fac',wetmix,0); link(sand,wetmix,0,bs,'Base Color')
wood=textured('柚木纵向纤维',(.045,.016,.006),(.28,.115,.035),3,.45,.014,(5,5,.16))
plank=textured('甲板木纹',(.10,.038,.014),(.32,.15,.058),3,.48,.009,(4,.15,8))
bark=textured('椰干斑驳树皮',(.16,.14,.105),(.40,.37,.27),3,.88,.023)
thatch=[textured('茅草%d'%i,(.17+i*.026,.10+i*.02,.035+i*.012),(.48+i*.035,.32+i*.03,.14+i*.023),8,.9,.006) for i in range(5)]
leaves=[]
for i in range(6):
    m=textured('叶绿%d'%i,(.012+i*.005,.032+i*.012,.003),(.08+i*.022,.19+i*.029,.008+i*.005),6,.34,.001)
    bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Subsurface Weight'].default_value=.055
    bs.inputs['Subsurface Radius'].default_value=(.3,1,.15); bs.inputs['Coat Weight'].default_value=.23
    leaves.append(m)
vein=mat('浅叶脉',(.18,.25,.026),.6)
cream=mat('花瓣乳白',(.88,.85,.71),.34); cream.node_tree.nodes.get('Principled BSDF').inputs['Subsurface Weight'].default_value=.12
yellow=mat('花心金黄',(.95,.57,.025),.45)

def coast(y): return (-3.0 if R>1 else -.9)+.37*y+.6*sin(y*.15)
def ground(x,y):
    d=x-coast(y)
    return .035+max(d,0)*.075+min(d,0)*.115+.015*noise.noise_vector(Vector((x*2,y*2,0)))[0]

# 真实沙滩与水下缓坡，延伸到远处，避免截断。
vs=[]; fs=[]; wet=[]
nx,ny=190,190
for j in range(ny+1):
    y=-25+j*110/ny
    for i in range(nx+1):
        x=-65+i*110/nx; z=ground(x,y)
        vs.append((x,y,z)); wet.append(max(0,min(1,1-(x-coast(y)-.25)/1.1)))
for j in range(ny):
    for i in range(nx):
        a=j*(nx+1)+i; fs.append((a,a+1,a+nx+2,a+nx+1))
o=mesh('湿干沙滩及水下沙床',vs,fs,[sand],smooth=True)
a=o.data.attributes.new('wetness','FLOAT','POINT')
for i,v in enumerate(wet): a.data[i].value=v
if R==3:
    fgvs=[]; fgfs=[]; fgw=[]; n=280
    for j in range(n+1):
        y=-14+24*j/n
        for i in range(n+1):
            x=-8+20*i/n; d=x-coast(y)
            relief=.008*noise.fractal(Vector((x*9,y*9,1.4)),1.0,2.0,3)
            fgvs.append((x,y,ground(x,y)+.004+relief))
            fgw.append(max(0,min(1,1-(d-.25)/1.1)))
    for j in range(n):
        for i in range(n):
            k=j*(n+1)+i; fgfs.append((k,k+1,k+n+2,k+n+1))
    ob=mesh('前景细分沙面起伏',fgvs,fgfs,[sand],smooth=True)
    at=ob.data.attributes.new('wetness','FLOAT','POINT')
    for i,v in enumerate(fgw): at.data[i].value=v

# 海水：微波几何 + 两级法线 + 体积吸收，沙床确实位于水下。
water=mat('清澈蓝绿浅水',(.055,.32,.34),.105)
b=water.node_tree.nodes.get('Principled BSDF'); b.inputs['Transmission Weight'].default_value=.94; b.inputs['IOR'].default_value=1.333
tc=node(water,'ShaderNodeTexCoord'); mp=node(water,'ShaderNodeVectorMath'); mp.operation='MULTIPLY'; mp.inputs[1].default_value=(1,2.4,1)
link(water,tc,'Object',mp,0)
nw=node(water,'ShaderNodeTexNoise',Scale=4.0,Detail=3.0,Roughness=.65); link(water,mp,'Vector',nw,'Vector')
bu=node(water,'ShaderNodeBump',Strength=.28,Distance=.048); link(water,nw,'Fac',bu,'Height'); link(water,bu,'Normal',b,'Normal')
absorb=node(water,'ShaderNodeVolumeAbsorption',Color=(.32,.81,.82,1),Density=.075)
link(water,absorb,'Volume',water.node_tree.nodes.get('Material Output'),'Volume')
vs=[];fs=[]
wx,wy=220,240
for j in range(wy+1):
    y=-27+250*j/wy
    for i in range(wx+1):
        d=150*(i/wx)**1.6; x=coast(y)+(.6 if R==3 else 0)-d
        z=.065+(.017*sin(y*4.6+x*1.9)+.012*sin(y*2.1-x*3.3))*min(d*2,1)
        vs.append((x,y,z))
for j in range(wy):
    for i in range(wx):
        a=j*(wx+1)+i; fs.append((a,a+wx+1,a+wx+2,a+1))
o=mesh('浅海真实起伏面',vs,fs,[water],smooth=True)
sol=o.modifiers.new('水体深度','SOLIDIFY'); sol.thickness=12

foam=mat('薄层泡沫',(.85,.89,.84),.58)
nt=foam.node_tree; bs=nt.nodes.get('Principled BSDF'); out=nt.nodes.get('Material Output')
tc=node(foam,'ShaderNodeTexCoord'); ns=node(foam,'ShaderNodeTexNoise',Scale=43.0,Detail=3.0,Roughness=.8); link(foam,tc,'Object',ns,'Vector')
ra=node(foam,'ShaderNodeValToRGB'); ra.color_ramp.elements[0].position=.44; ra.color_ramp.elements[1].position=.66
link(foam,ns,'Fac',ra,'Fac')
tr=node(foam,'ShaderNodeBsdfTransparent'); mx=node(foam,'ShaderNodeMixShader'); link(foam,ra,'Color',mx,0); link(foam,tr,0,mx,1); link(foam,bs,0,mx,2); link(foam,mx,0,out,'Surface')
vs=[];fs=[]
for lane in range(4):
    if R==3 and lane>1: continue
    for j in range(1000):
        y=-22+j*46/999
        d=.08+lane*.43+.10*sin(y*1.7+lane)+.06*sin(y*5.5)
        width=(.12 if lane==0 else .055)*(1+.7*sin(y*7+lane))
        k=len(vs)
        for t in (-1,1):
            x=coast(y)+(.35 if R==3 else 0)-d+t*width; vs.append((x,y,.102+.004*sin(y*5)))
        if j: fs.append((k-2,k-1,k+1,k))
mesh('弯曲碎浪沫边缘',vs,fs,[foam])

def rock(name,loc,scale,seed):
    rng=random.Random(seed)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4,radius=1,location=loc)
    o=bpy.context.object; o.name=name
    off=Vector((seed*.31,seed*.77,seed*.16))
    for v in o.data.vertices:
        p=v.co.copy(); n=noise.fractal(p*3.5+off,1.0,2.0,4)
        n2=noise.noise(p*17+off)
        f=1+(.40 if R>1 else .22)*n+(.16 if R>1 else .085)*n2
        v.co=(p.x*scale[0]*f,p.y*scale[1]*f,p.z*scale[2]*f)
    o.data.materials.append(rockmat)
    for p in o.data.polygons: p.use_smooth=True
    return o

for i in range(33):
    x=random.uniform(-6 if R==3 else -2,6.0); y=random.uniform(8,14)
    s=random.uniform(.65,1.8); z=(.85 if R>1 else .1)+s*.4
    rock('后方珊瑚礁%d'%i,(x,y,z),(s,s*.72,s*random.uniform(.55,1.1)),100+i)
for i,(x,y,s) in enumerate([(3.8,3.8,.85),(2.8,4.2,.65),(5.5,5.2,.65),(1.5,5.8,.5),(6,8,1),(7,6,.7)]):
    rock('水线散礁%d'%i,(x,y,.12+s*.25),(s,s*.7,s*.6),180+i)
for i in range(7):
    rock('远海礁石%d'%i,(-14+random.random()*12,38+random.random()*8,-.08),(.6+random.random(),.8,.3),220+i)

# 木屋：右后方，甲板前廊、细门窗、靠椅、芦苇茅顶。
house_before=set(sc.objects)
cx,cy=(8.6 if R>1 else 7.4),11.4
concrete=textured('风化灰白基础',(.26,.26,.22),(.52,.51,.43),6,.87,.018)
cube('基座',(cx,cy,.8),(7.8,5.8,1.6),concrete,.035)
for i in range(30):
    cube('甲板条%02d'%i,(cx-4+i*.27,cy-1.4,1.66),(.26,5.9,.16),plank,.012)
for x in (cx-3.7,cx,cx+3.7):
    for y in (cy-3.7,cy+1.9): cube('屋柱',(x,y,3.12),(.23,.23,3.05),wood,.025)
cube('后墙',(cx,cy+1.8,3.2),(7.8,.17,3.0),wood,.02)
glass=mat('玻璃反射',(.54,.65,.64),.10); glass.node_tree.nodes.get('Principled BSDF').inputs['Transmission Weight'].default_value=.88
curtain=textured('亚麻薄帘',(.47,.40,.29),(.82,.76,.61),4,.85,.003,(10,1,.1))
for i in range(6):
    x=cx-3.25+i*1.24
    cube('落地玻璃',(x,cy+.35,3.17),(1.18,.025,2.55),glass,.005)
    cube('门窗竖框',(x-.60,cy+.28,3.17),(.065,.09,2.65),wood,.007)
    for dz in (-1.31,1.31): cube('门窗横框',(x,cy+.28,3.17+dz),(1.25,.09,.07),wood,.006)
    for j in range(8):
        cube('帘褶',(x-.5+j*.14,cy+.62+.045*sin(j*2),3.25),(.16,.035,2.45),curtain,.03)
for z in (2.15,2.75):
    cube('侧廊栏杆',(cx-3.8,cy-1.6,z),(.12,4.1,.11),wood,.02)
    cube('前廊左栏杆',(cx-2.65,cy-3.7,z),(2.3,.1,.1),wood,.02)
for x in (cx-3.8,cx-1.5): cube('栏杆立柱',(x,cy-3.7,2.2),(.14,.14,1.2),wood,.02)
# 屋顶前后坡与大量独立纤维条，真实投影，不使用平面草纹。
rv=[(cx-4.8,cy-4.1,4.6),(cx+4.8,cy-4.1,4.6),(cx+4.8,cy,6.6),(cx-4.8,cy,6.6),
    (cx-4.8,cy+3.0,4.6),(cx+4.8,cy+3.0,4.6)]
mesh('茅顶底层',rv,[(0,1,2,3),(3,2,5,4)],[thatch[0]])
straw=Batch()
for side in (-1,1):
    length=4.1 if side<0 else 3.0
    for i in range(15500):
        x=cx+random.uniform(-4.82,4.82); t=random.random()
        y=cy+side*t*length; z=6.62-2*t
        le=random.uniform(.22,.75); dx=random.uniform(-.045,.045); width=random.uniform(.005,.014)
        t2=t+le/length; y2=cy+side*t2*length; z2=6.62-2*t2-random.uniform(.015,.09)
        if t>.93: z2-=.12*random.random()
        straw.face([(x-width,y,z+.035),(x+width,y,z+.035),(x+dx+width*.35,y2,z2),(x+dx-width*.35,y2,z2)],random.randrange(5))
straw.finish('三万束铺叠干茅纤维',thatch,False)
for x in (cx-3.6,cx,cx+3.6):
    q=cube('前檐横梁',(x,cy-3.65,4.52),(2.8,.23,.20),wood,.025)
    p=cube('斜撑',(x+.3,cy-3.65,4.12),(.11,.14,.85),wood,.015); p.rotation_euler[1]=-.55
cushion=textured('青灰坐垫',(.07,.16,.17),(.20,.33,.32),90,.85,.002)
cane=textured('藤编',(.15,.065,.023),(.37,.22,.095),20,.6,.006)
for seatx in (cx-.3,cx+1.9):
    seaty=cy-2.55
    cube('躺椅坐框',(seatx,seaty,2.05),(1.45,1.5,.10),wood,.035)
    back=cube('躺椅靠背',(seatx,seaty+.65,2.55),(1.45,.13,1.1),wood,.035); back.rotation_euler[0]=-.28
    for x in (seatx-.65,seatx+.65):
        for y in (seaty-.6,seaty+.6): cube('椅腿',(x,y,1.88),(.09,.09,.5),wood,.018)
        cube('扶手',(x,seaty+.05,2.45),(.08,1.5,.08),wood,.02)
    cube('软坐垫',(seatx,seaty-.05,2.16),(1.27,1.3,.16),cushion,.08)
    back=cube('靠垫',(seatx,seaty+.52,2.57),(1.25,.2,.78),cushion,.08); back.rotation_euler[0]=-.28
cube('小茶几',(cx-1.8,cy-2.7,2.07),(.8,.7,.09),wood,.02)
for dx in (-.3,.3):
    for dy in (-.25,.25): cube('桌腿',(cx-1.8+dx,cy-2.7+dy,1.86),(.055,.055,.4),wood,.01)
if R>1:
    # 整体抬高后廊，轻微斜转，取得参考图的高台与斜向屋檐。
    from mathutils import Matrix
    rot=Matrix.Rotation(math.radians(-18 if R==3 else 12),4,'Z')
    origin=Vector((cx,cy,0))
    for ob in set(sc.objects)-house_before:
        ob.location=origin+rot.to_3x3()@(ob.location-origin)+Vector((0,0,1.1))
        ob.rotation_euler=(rot.to_3x3()@ob.rotation_euler.to_matrix()).to_euler()

# 棕榈：弯曲环节树干和真正独立狭长羽状小叶。
def palm(name,base,height,lean,seed):
    rng=random.Random(seed); base=Vector(base); lean=Vector((lean[0],lean[1],0))
    trunk=Batch(); pts=[]
    for i in range(50):
        t=i/49; pts.append(base+Vector((0,0,height*t))+lean*t*t)
    trunk.tube(pts,[.24*(1-.52*i/49)*(1+.035*sin(i*3)) for i in range(50)],sides=12)
    trunk.finish(name+'弯曲干',[bark])
    rings=Batch()
    for i in range(70):
        t=(i+.3)/70; p=base+Vector((0,0,height*t))+lean*t*t
        rad=.24*(1-.52*t)
        rings.tube([p+Vector((rad*cos(a*2*pi/16),rad*sin(a*2*pi/16),.008*sin(a))) for a in range(17)],[.009]*17,sides=3)
    rings.finish(name+'横向环纹',[thatch[0]])
    top=pts[-1]; fr=Batch(); ribs=Batch()
    for j in range(14):
        ang=j*2*pi/14+rng.uniform(-.16,.16); L=rng.uniform(3.2,4.6); rise=rng.uniform(.65,1.8)
        direction=Vector((cos(ang),sin(ang),0)); side=Vector((-sin(ang),cos(ang),0))
        def path(t): return top+direction*L*t+Vector((0,0,rise*sin(t*pi*.85)-1.1*t*t))
        ribs.tube([path(k/17) for k in range(18)],[.037*(1-k/18)+.002 for k in range(18)],rng.randrange(3),5)
        for k in range(55):
            t=.055+k*.0165; p=path(t); w=.63*(sin(pi*t)**.65)*(1-.27*t)*rng.uniform(.85,1.12)
            for s in (-1,1):
                tip=p+side*s*w+direction*(.12+.27*t)+Vector((0,0,-.17-.24*t))
                mid=p.lerp(tip,.5)+Vector((0,0,.045)); half=(.045 if R>1 else .025)*(1-t*.5)
                fr.face([p-direction*.012,mid-direction*half,tip,mid+direction*half,p+direction*.012],rng.randrange(6))
    fr.finish(name+'羽状小叶',leaves)
    ribs.finish(name+'叶轴',leaves)
    for i in range(5): uvball(name+'椰果',top+Vector((rng.uniform(-.3,.3),rng.uniform(-.3,.3),-.23)),(.14,.14,.18),thatch[0],12,8)

for i,(x,y,h,lx,ly) in enumerate([(2.7,12,10,-1.7,-.3),(6,17,11,-1,.2),(11,15,11,1,0),(0,18,9,.7,-.3),(-1,22,10,-1,-1),(13,22,13,-1,0),(17,27,13,0,1),(5,25,11,1,1),(1,3,9,-2,-1),(-7,-1,10,2,-2)]):
    if R>1 and i==8: continue
    if R>1 and i==9: x,y,h,lx,ly=-12,2,10,3,-1
    palm('椰树%02d'%i,(x,y,max(.2,ground(x,y))),h,(lx,ly),900+i)
if R>1: palm('顶端前景椰树',(-10,-5,.3),8,(6,1),998)
if R==3:
    # 镜头上方近处三条长叶，叶轴与小叶均弯曲，不增加可见前景树干。
    overhead=Batch(); axis=Batch()
    for root,az,L in [((-4,-1,6.9),-.3,5.4),((-1,1,8.0),3.65,6.2),((-1.8,-1.0,7.5),.5,5.0)]:
        root=Vector(root); dr=Vector((cos(az),sin(az),0)); side=Vector((-sin(az),cos(az),0))
        def center(t): return root+dr*L*t+Vector((0,0,-2.8*t*t+.5*sin(pi*t)))
        axis.tube([center(j/28) for j in range(29)],[.045*(1-j/30) for j in range(29)],sides=6)
        for j in range(82):
            t=.04+j*.0114; p=center(t); length=.95*sin(pi*t)**.6
            for s in (-1,1):
                tip=p+side*s*length+dr*.3+Vector((0,0,-.3-.3*t))
                mid=p.lerp(tip,.52)+Vector((0,0,.06)); w=.042
                overhead.face([p-dr*.012,mid-dr*w,tip,mid+dr*w,p+dr*.012],random.randrange(6))
    overhead.finish('近处垂落椰羽',[*leaves]); axis.finish('近处椰叶中轴',[thatch[2]])

# 宽叶灌木：每叶有隆起中脊、弯曲和非平面边缘。
fol=Batch(); veins=Batch(); branches=Batch()
def leaf(base,direction,length,width,idx,detail=False):
    base=Vector(base); d=Vector(direction).normalized(); u=d.cross(Vector((.17,.1,1))).normalized()
    normal=u.cross(d).normalized()
    if R==3 and detail:
        u=d.cross(Vector((.1,-1,.25))).normalized(); normal=u.cross(d).normalized()
    pts=[]
    for j in range(9):
        t=j/8; center=base+d*length*t+normal*(sin(pi*t)*length*.12-t*t*length*.12)
        w=width*(sin(pi*t)**.78)
        for s in (-1,0,1): pts.append(center+u*w*s-normal*abs(s)*width*.12*sin(pi*t))
    k=len(fol.v); fol.v.extend(pts)
    for j in range(8):
        for s in range(2): fol.f.append((k+j*3+s,k+(j+1)*3+s,k+(j+1)*3+s+1,k+j*3+s+1)); fol.mi.append(idx)
    if detail:
        veins.tube([pts[j*3+1]+normal*.002 for j in range(9)],[.0025*(1-j/10) for j in range(9)],sides=3)
        for j in (2,3,4,5,6):
            for s in (-1,1):
                p=pts[j*3+1]+normal*.003; end=pts[min(j+1,8)*3+(0 if s<0 else 2)]+normal*.003
                veins.tube([p,p.lerp(end,.5),end],[.0013,.001,.0003],sides=3)

def shrub(center,radius,n,seed):
    rng=random.Random(seed); c=Vector(center)
    if R>1: n=int(n*2.2)
    for i in range(n):
        az=rng.uniform(0,2*pi); dz=rng.uniform(-.65,1); r=radius*rng.random()**.33
        p=c+Vector((cos(az)*r,sin(az)*r,dz*r*.65))
        direction=Vector((cos(az),sin(az),rng.uniform(-.2,.8)))
        le=rng.uniform(.42,.78) if R>1 else rng.uniform(.27,.57); leaf(p,direction,le,le*.28,rng.randrange(6))
        if i%17==0: branches.tube([c,p],[.025,.006],sides=4)
for i in range(27):
    x=random.uniform(-4.0 if R==3 else -1.8,17); y=random.uniform(11,23); z=(2.4 if R>1 else 1.8)+random.uniform(0,2.4)
    shrub((x,y,z),random.uniform(1.1,2.0),250,1500+i)
for i,(x,y,z,r) in enumerate([(1.4,7,2.2,1.6),(4,7,1.4,1),(8,7,1.3,1),(11,5,1.5,1.5),(9,2,1.8,1.4)]):
    shrub((x,y,z),r,210,1700+i)

def flower(pos,direction,size):
    p=Vector(pos); d=Vector(direction).normalized(); u=d.cross(Vector((0,1,.1))).normalized(); v=d.cross(u).normalized()
    fl=Batch()
    for j in range(5):
        ang=j*2*pi/5; a=u*cos(ang)+v*sin(ang); b=d.cross(a)
        for k in range(6):
            t=k/6; t2=(k+1)/6
            def pt(t,s):
                w=size*.30*max(0,sin(pi*t))**.7
                return p+a*size*t+b*(w*s+size*.13*sin(pi*t))+d*(size*.28*sin(pi*t)-size*.1*t)
            fl.face([pt(t,-1),pt(t2,-1),pt(t2,1),pt(t,1)],0 if k<2 else 1)
    fl.finish('五瓣鸡蛋花',[yellow,cream])

# 右前方鸡蛋花枝作为景框，花和叶均为真实空间几何。
foreground=Batch()
foreground.tube([(6.8,-8.0,.8),(6.1,-7.2,2.1),(5.8,-5.5,3.4),(6.0,-3.9,5.4)], [.13,.10,.07,.035],sides=10)
foreground.tube([(6.0,-4.0,5.1),(4.6,-3.4,5.5),(3.6,-2.7,5.7)],[.065,.035,.015],sides=9)
foreground.finish('近景鸡蛋花树枝',[bark])
for cluster,c in enumerate(([(3.5,-6.5,1.3),(4,-5,2.6),(5.1,-3.5,5.3),(3.7,-2.8,5.7),(4.7,-4.4,4.0)] if R>1 else [(5.9,-7,1.6),(6.0,-5.2,3),(5.3,-3.5,5.3),(3.7,-2.8,5.7),(6.4,-4.4,4.4)])):
    c=Vector(c)
    for i in range(13):
        ang=i*2.4; d=Vector((cos(ang),sin(ang)*.7,random.uniform(-.45,.5)))
        leaf(c+d*.12,d,random.uniform(1.0,1.65) if R==3 else random.uniform(.65,1.25),random.uniform(.27,.44) if R==3 else random.uniform(.18,.32),random.randrange(2,6),True)
    for j in range(4):
        p=c+Vector((random.uniform(-.35,.35),-.16,random.uniform(-.15,.35)))
        flower(p,(0,-1,.3),random.uniform(.15,.23))
fol.finish('灌木与前景弯曲阔叶',leaves); veins.finish('鸡蛋花叶脉',[vein]); branches.finish('灌木木质枝条',[bark])

# 沙面颗粒与小石，合并网格以控制对象数。
grains=Batch(); grainmats=[mat('砂粒%d'%i,c,.88) for i,c in enumerate([(.49,.39,.26),(.74,.65,.49),(.24,.20,.15),(.65,.57,.43)])]
for i in range(19000):
    x=random.uniform(-6,10); y=random.uniform(-13,5)
    if x<coast(y)+.4: continue
    z=ground(x,y); s=random.uniform(.005,.023)
    p=Vector((x,y,z+.007))
    a=random.random()*pi; u=Vector((cos(a),sin(a),0))*s; v=Vector((-sin(a),cos(a),0))*s*.65
    grains.face([p-u-v,p+u-v,p+u+v,p-u+v],random.randrange(4))
grains.finish('前景独立沙砾',grainmats,False)
for i in range(28):
    x=random.uniform(-2,7); y=random.uniform(-10,3)
    if x<coast(y)+.5: continue
    s=random.uniform(.02,.07)
    uvball('碎珊瑚',(x,y,ground(x,y)+s*.3),(s,s*.6,s*.4),grainmats[random.randrange(4)],8,5)

shellmat=textured('贝壳奶油褐纹',(.37,.245,.13),(.82,.71,.51),20,.4,.004)
star=textured('海星浅赭',(.27,.15,.06),(.66,.46,.23),30,.85,.013)
def seashell(name,center,size,seed):
    rng=random.Random(seed); center=Vector(center); vs=[];fs=[]
    for i in range(170):
        t=i/169; a=t*4.9*pi; rad=size*(.08+.92*t)
        # 逐渐增大的螺管，末圈有周期细肋。
        for j in range(20):
            b=j*2*pi/20; tube=rad*(.58 if R==3 else .43)*(1+.055*sin(a*21))
            local=Vector(((rad+tube*cos(b))*cos(a),(rad+tube*cos(b))*sin(a)*.75,size*((1.45-t*1.20) if R==3 else (.80-t*.69))+tube*sin(b)))
            if R==3:
                from mathutils import Euler
                local=Euler((1.0,.35,0)).to_matrix()@local
            vs.append(center+local)
    for i in range(169):
        for j in range(20):
            k=i*20+j; fs.append((k,i*20+(j+1)%20,(i+1)*20+(j+1)%20,k+20))
    return mesh(name,vs,fs,[shellmat],smooth=True)
empty_x,empty_y=(.95,-9.0) if R==3 else (2.4,-9.6)
seashell('前景空螺壳',(empty_x,empty_y,ground(empty_x,empty_y)),.23,1)
# 海星在左前沙面。
sx,sy=(-1.2,-6.5) if R>1 else (-1.6,-8.0); sz=ground(sx,sy)+.045
sb=Batch()
for arm in range(5):
    a=arm*2*pi/5+.25; dr=Vector((cos(a),sin(a),0)); side=Vector((-sin(a),cos(a),0))
    centers=[Vector((sx,sy,sz))+dr*t*.58+Vector((0,0,.035*sin(pi*t))) for t in (0,.2,.5,.8,1)]
    sb.tube(centers,[.11,.105,.075,.037,.005],sides=8)
    for j in range(22):
        t=random.random(); p=Vector((sx,sy,sz))+dr*t*.55+side*random.uniform(-.055,.055)*(1-t)+Vector((0,0,.08*(1-t)+.01))
        sb.tube([p,p+Vector((0,0,.012))],[.009,.005],sides=4)
sb.finish('五腕颗粒海星',[star])
# 寄居蟹，独立壳、节肢、钳和眼柄。
crabmat=textured('寄居蟹朱红甲壳',(.18,.025,.006),(.63,.14,.026),30,.4,.003)
black=mat('黑眼与鸟喙',(.009,.008,.006),.22)
xx,yy=(1.9,-7.2) if R>1 else (3.8,-7.5); zz=ground(xx,yy)
seashell('寄居蟹螺壳',(xx+.13,yy+.12,zz+.16),.33,3)
uvball('蟹头',(xx-.14,yy-.12,zz+.20),(.12,.10,.085) if R==3 else (.17,.14,.12),crabmat)
cb=Batch()
for side in (-1,1):
    for j in range(3):
        p=Vector((xx-.04+j*.06,yy+side*.08,zz+.18))
        knee=p+Vector((-.13+j*.055,side*(.19+j*.03),.04))
        tip=knee+Vector((-.11,side*.10,-.20))
        cb.tube([p,knee,tip],[.029,.021,.005],sides=7)
    p=Vector((xx-.22,yy+side*.09,zz+.23)); q=p+Vector((-.16,side*.14,-.03))
    cb.tube([p,q],[.035,.046],sides=8)
    uvball('蟹钳',q,(.045,.03,.044) if R==3 else (.075,.045,.06),crabmat)
    eyeheight=.11 if R==3 else .18
    cb.tube([p+Vector((.015,0,.02)),p+Vector((-.05,side*.02,eyeheight))],[.008,.005],sides=5)
    uvball('蟹眼',p+Vector((-.05,side*.02,eyeheight)),(.011,.010,.011),black,12,6)
cb.finish('分节蟹腿与眼柄',[crabmat])

# 水边觅食小涉禽，细腿和微俯长喙。
feather=textured('涉禽褐色背羽',(.10,.075,.045),(.35,.28,.18),25,.7,.002)
birdwhite=mat('涉禽白腹',(.73,.72,.65),.75)
bx,by=(-4.8,-1.4) if R>1 else (-3.9,-2.8); bz=ground(bx,by)
body=uvball('滨鹬身体',(bx,by,bz+.46),(.32,.15,.19),birdwhite)
wing=uvball('褐色翼背',(bx+.06,by+.025,bz+.53),(.28,.147,.12),feather)
uvball('滨鹬颈',(bx-.23,by,bz+.48),(.11,.095,.19),birdwhite)
uvball('滨鹬头',(bx-.30,by-.01,bz+.58),(.12,.095,.105),feather)
uvball('鸟眼',(bx-.33,by-.095,bz+.61),(.017,.008,.017),black,16,8)
bb=Batch(); bb.tube([(bx-.39,by-.015,bz+.56),(bx-.57,by-.015,bz+.45)],[.018,.002],sides=8)
bb.face([(bx+.20,by-.1,bz+.52),(bx+.53,by,bz+.57),(bx+.24,by+.1,bz+.48)])
for s in (-1,1):
    p=Vector((bx+s*.13,by+s*.06,bz+.32)); q=Vector((bx+s*.12,by+s*.07,bz+.14)); r=Vector((bx+s*.2,by+s*.10,bz+.025))
    bb.tube([p,q,r],[.014,.011,.008],sides=5)
    for d in (-1,0,1): bb.tube([r,r+Vector((-.08,d*.035,-.009))],[.007,.002],sides=4)
bb.finish('涉禽细腿长喙尾羽',[black])

# 远处天空为真实环境光；云通过世界方向噪声形成，无参考照片。
world=bpy.data.worlds.new('热带下午天空'); world.use_nodes=True; sc.world=world
nt=world.node_tree; bg=nt.nodes.get('Background'); bg.inputs['Strength'].default_value=.075 if R>1 else .45
sky=nt.nodes.new('ShaderNodeTexSky'); sky.sky_type='MULTIPLE_SCATTERING'; sky.sun_elevation=math.radians(23); sky.sun_rotation=math.radians(218)
sky.air_density=1.1; sky.aerosol_density=1.4; sky.ozone_density=1.0; sky.sun_disc=False
nt.links.new(sky.outputs['Color'],bg.inputs['Color'])
if R>1:
    camera_bg=nt.nodes.new('ShaderNodeBackground'); camera_bg.inputs['Strength'].default_value=.8
    tc=nt.nodes.new('ShaderNodeTexCoord'); sep=nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Normal'],sep.inputs[0])
    ramp=nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color=(.48,.65,.79,1); ramp.color_ramp.elements[1].position=.65; ramp.color_ramp.elements[1].color=(.095,.32,.64,1)
    nt.links.new(sep.outputs['Z'],ramp.inputs[0]); nt.links.new(ramp.outputs['Color'],camera_bg.inputs['Color'])
    lp=nt.nodes.new('ShaderNodeLightPath'); mx=nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lp.outputs['Is Camera Ray'],mx.inputs[0]); nt.links.new(bg.outputs[0],mx.inputs[1]); nt.links.new(camera_bg.outputs[0],mx.inputs[2]); nt.links.new(mx.outputs[0],nt.nodes.get('World Output').inputs['Surface'])
sun=bpy.data.objects.new('暖侧日光',bpy.data.lights.new('暖侧日光','SUN')); sc.collection.objects.link(sun)
sun.data.energy=4.2 if R>1 else 2.3; sun.data.color=(1,.78,.54) if R>1 else (1,.84,.65); sun.data.angle=math.radians(.7)
sun.rotation_euler=Vector((.65,.55,-.52)).to_track_quat('-Z','Y').to_euler()
# 云的软体积团块，放在真实远方，保留蓝天开口。
cloud=bpy.data.materials.new('疏松积云体积'); cloud.use_nodes=True; nt=cloud.node_tree; nt.nodes.clear()
out=nt.nodes.new('ShaderNodeOutputMaterial'); vol=nt.nodes.new('ShaderNodeVolumePrincipled'); vol.inputs['Color'].default_value=(.94,.95,1,1)
tc=nt.nodes.new('ShaderNodeTexCoord'); ns=nt.nodes.new('ShaderNodeTexNoise'); ns.inputs['Scale'].default_value=2.4; ns.inputs['Detail'].default_value=4
nt.links.new(tc.outputs['Generated'],ns.inputs['Vector']); ra=nt.nodes.new('ShaderNodeValToRGB'); ra.color_ramp.elements[0].position=.38; ra.color_ramp.elements[1].position=.70
nt.links.new(ns.outputs['Fac'],ra.inputs[0])
if R>1:
    ra.color_ramp.elements[1].color=(.065,.065,.065,1)
    vol.inputs['Anisotropy'].default_value=.1
nt.links.new(ra.outputs['Color'],vol.inputs['Density']); nt.links.new(vol.outputs['Volume'],out.inputs['Volume'])
for i in range(24):
    rng=random.Random(2200+i); x=rng.uniform(-180,5); y=rng.uniform(220,290); z=rng.uniform(18,55)
    if R>1:
        x=-100+rng.uniform(-30,30); y=250+rng.uniform(-12,12); z=25+rng.uniform(0,40)
        uvball('远天积云',(x,y,z),(rng.uniform(7,16),rng.uniform(7,15),rng.uniform(6,14)),cloud,20,12)
    else: uvball('远天积云',(x,y,z),(rng.uniform(8,22),rng.uniform(5,12),rng.uniform(3,9)),cloud,16,10)

if R==3:
    # 真实 CC0 纯天空环境图用于照明、反射和远天，主体全部保留实体几何。
    for ob in list(sc.objects):
        if ob.name.startswith('远天积云'): bpy.data.objects.remove(ob,do_unlink=True)
    nt=world.node_tree; nt.nodes.clear()
    out=nt.nodes.new('ShaderNodeOutputWorld'); env=nt.nodes.new('ShaderNodeTexEnvironment')
    env.image=bpy.data.images.load(os.path.join(ROOT,'tropical-shallows/assets/kloofendal_48d_partly_cloudy_puresky_2k.hdr'))
    # Environment 默认输入使用正确的世界射线方向；世界 Normal 是反向，不能接入。
    env.texture_mapping.rotation[2]=1.65
    bg=nt.nodes.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value=.32; nt.links.new(env.outputs[0],bg.inputs[0])
    cbg=nt.nodes.new('ShaderNodeBackground'); cbg.inputs['Strength'].default_value=.8; nt.links.new(env.outputs[0],cbg.inputs[0])
    lp=nt.nodes.new('ShaderNodeLightPath'); mix=nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lp.outputs['Is Camera Ray'],mix.inputs[0]); nt.links.new(bg.outputs[0],mix.inputs[1]); nt.links.new(cbg.outputs[0],mix.inputs[2]); nt.links.new(mix.outputs[0],out.inputs[0])
    sun.data.energy=3.2; sun.data.color=(1,.83,.63)
    # 自然微波增加交叉尺度，不再让海面像规则镜面条纹。
    bs=water.node_tree.nodes.get('Principled BSDF'); bs.inputs['Roughness'].default_value=.075
    bs.inputs['Base Color'].default_value=(.07,.5,.50,1); bs.inputs['Transmission Weight'].default_value=.88
    fine=node(water,'ShaderNodeTexNoise',Scale=19.0,Detail=2.0,Roughness=.65)
    tc=node(water,'ShaderNodeTexCoord'); link(water,tc,'Object',fine,'Vector')
    bump=node(water,'ShaderNodeBump',Strength=.28,Distance=.012)
    old=bs.inputs['Normal'].links[0].from_socket; water.node_tree.links.new(old,bump.inputs['Normal']); link(water,fine,'Fac',bump,'Height'); link(water,bump,'Normal',bs,'Normal')
    absorb.inputs['Density'].default_value=.18

bpy.ops.object.camera_add(location=(0,-14,2.5)); cam=bpy.context.object; cam.name='参考固定低机位'
cam.rotation_euler=(Vector((0,10,1.5))-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.lens=31; cam.data.sensor_width=36
cam.data.clip_end=700; cam.data.dof.use_dof=True; cam.data.dof.focus_distance=16; cam.data.dof.aperture_fstop=5.6 if R==3 else 9
sc.camera=cam
sc.render.film_transparent=False
if not opt.prepare_only:
    sc.render.filepath=os.path.join(OUT,'round-%d.png'%R)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'tropical-shallows.blend'),compress=True)
    summary={'round':R,'objects':len(sc.objects),'vertices':sum(len(o.data.vertices) for o in sc.objects if o.type=='MESH'),'resolution':[sc.render.resolution_x,sc.render.resolution_y],'samples':sc.cycles.samples,'device':'OPTIX','reference_as_background':False}
    with open(os.path.join(OUT,'round-%d.json'%R),'w',encoding='utf8') as f: json.dump(summary,f,ensure_ascii=False,indent=2)
    print('SCENE_READY',json.dumps(summary),flush=True)
    bpy.ops.render.render(write_still=True)
    print('RENDER_DONE',sc.render.filepath,flush=True)
