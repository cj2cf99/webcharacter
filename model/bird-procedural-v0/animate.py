# 极乐鸟求偶动画节奏（粗模）。先 exec build_scene.py，再 exec 本文件。30 fps，20 秒循环。
import bpy, math
from mathutils import Vector

FPS = 30
END = 600
sc = bpy.context.scene
sc.render.fps = FPS
sc.frame_start, sc.frame_end = 1, END
male = bpy.data.objects['Male']
cam = bpy.data.objects['Camera']

SIDE = -90      # 侧身面向雌鸟
FRONT = -12     # 展示时朝向镜头偏左（雌鸟方向）

def key(obj, frame, loc=None, rot_z=None, scale_z=None, roll=0.0):
    if loc is not None:
        obj.location = loc
        obj.keyframe_insert('location', frame=frame)
    if rot_z is not None:   # XYZ 欧拉：先绕 Y 侧倾（roll），再绕 Z 转向
        obj.rotation_euler = (0, math.radians(roll), math.radians(rot_z))
        obj.keyframe_insert('rotation_euler', frame=frame)
    if scale_z is not None:
        obj.scale = (1 / math.sqrt(scale_z), 1 / math.sqrt(scale_z), scale_z)
        obj.keyframe_insert('scale', frame=frame)

def hop(f0, f1, p0, p1, r0, r1, h, roll0=0.0, roll1=0.0):
    """一次跳跃：f0 起跳（下蹲）→ 中点最高 → f1 落地（压扁后回弹）。p 为 (x, y)。"""
    mid = (f0 + f1) // 2
    key(male, f0, (*p0, 0), r0, 0.9, roll0)
    key(male, f0 + 1, (*p0, 0), r0, 1.06, roll0)
    key(male, mid, ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, h), (r0 + r1) / 2, 1.04, (roll0 + roll1) / 2)
    key(male, f1, (*p1, 0), r1, 0.88, roll1)
    key(male, f1 + 1, (*p1, 0), r1, 1.0, roll1)

def stage(frame, value):
    set_stage(value, frame)

# 清除旧动画
for o in [male, cam, cam.data] + PARTS:
    o.animation_data_clear()
    if getattr(getattr(o, 'data', None), 'shape_keys', None):
        o.data.shape_keys.animation_data_clear()
tgt = bpy.data.objects.get('CamTarget')
if tgt is None:
    tgt = bpy.data.objects.new('CamTarget', None)
    sc.collection.objects.link(tgt)
tgt.animation_data_clear()

# ---------------------------------------------------------------- 雄鸟
# 节奏参考：ref/dance.gif（横展停约 1.2 s → 约 0.35 s 一下扣合）；
# 舞蹈段参考 B 站视频 ref/ref.mp4（原地左右快速转身）。
FEM = bpy.data.objects['Female'].location.copy()
def face(p):
    """朝向雌鸟为主，略偏镜头，让观众看到胸盾。"""
    zf = math.degrees(math.atan2(FEM.x - p[0], -(FEM.y - p[1])))
    return zf * 0.45 + FRONT * 0.55
ARC_R = math.hypot(0.05 - FEM.x, 0 - FEM.y)
def arc(deg):
    a = math.radians(deg)
    return (FEM.x + ARC_R * math.cos(a), FEM.y + ARC_R * math.sin(a))
HOME = (0.05, 0.0)

# 0–2.6s 正常栖息：两次小蹦
key(male, 1, (0, 0, 0), SIDE, 1.0)
stage(1, 0)
hop(24, 32, (0, 0), (0, 0), SIDE, SIDE - 8, 0.03)
hop(44, 52, (0, 0), (0, 0), SIDE - 8, SIDE, 0.03)
# 跳转身面向雌鸟
hop(64, 78, (0, 0), HOME, SIDE, face(HOME), 0.09)
stage(80, 0)
stage(86, 1)                      # 胸盾横展（0.2 s）
hop(94, 100, HOME, HOME, face(HOME), face(HOME), 0.02, 0, 8)     # 横展状态下原地顿两下
hop(106, 112, HOME, HOME, face(HOME), face(HOME), 0.02, 8, -6)
key(male, 116, (*HOME, 0), face(HOME), 1.0, 0)
stage(118, 1)
stage(122, 2)                     # 一下扣合（11 帧 ≈ 0.37 s），中途经过竖扇
stage(129, 3)
stage(132, 2.95)
stage(135, 3)
# 舞蹈（参考 B 站视频）：原地左右快速转身，约 ±18°，转 5 帧、停 9 帧，
# 每次转身轻微离地、侧倾一点、披肩一颤；每 4 次转身横挪一小步。
k, f, p, roll = 0, 138, HOME, 0.0
yaw0 = face(HOME)
cur = yaw0
while f < 410:
    k += 1
    side = 1 if k % 2 else -1
    q = p
    if k % 4 == 0:   # 小挪步
        q = (HOME[0] + 0.05 * side, HOME[1] + 0.02 * side)
    nyaw = FRONT - 15 + 18 * side
    nroll = 6 * side
    hop(f, f + 5, p, q, cur, nyaw, 0.015, roll, nroll)
    stage(f + 5, 3)
    stage(f + 6, 2.95)
    stage(f + 8, 3)
    key(male, f + 14, (*q, 0), nyaw + 3 * side, 1.0, nroll)    # 停顿中惯性微转
    p, roll, cur = q, nroll, nyaw + 3 * side
    f += 14
hop(f, f + 9, p, HOME, cur, face(HOME), 0.04, roll, 0)
f += 12
stage(f, 3)
# 收拢：一下收回横展 → 停一会 → 复原
stage(f + 5, 2)
stage(f + 10, 1)
stage(f + 30, 1)
stage(f + 42, 0)
fb = f + 48
hop(fb, fb + 14, HOME, (0, 0), face(HOME), SIDE, 0.09)
key(male, END, (0, 0, 0), SIDE, 1.0)
stage(END, 0)
print('dance ends at', f, 'turn back at', fb)

# ---------------------------------------------------------------- 镜头
WIDE_C, WIDE_T = (-0.15, -3.1, 0.8), (-0.35, 0, 0.36)
# 近景：从雌鸟右后方看过去，雌鸟留在左下角当观众
CLOSE_C, CLOSE_T = (-0.35, -2.2, 0.5), (-0.15, -0.15, 0.38)
WIDE_L, CLOSE_L = 50, 42
def cam_key(frame, c, t):
    cam.data.lens = CLOSE_L if c == CLOSE_C else WIDE_L
    cam.data.keyframe_insert('lens', frame=frame)
    cam.location = c; cam.keyframe_insert('location', frame=frame)
    tgt.location = t; tgt.keyframe_insert('location', frame=frame)
cam_key(1, WIDE_C, WIDE_T)
cam_key(128, WIDE_C, WIDE_T)
cam_key(178, CLOSE_C, CLOSE_T)       # 合拢后推近
cam_key(f, CLOSE_C, CLOSE_T)
cam_key(fb + 20, WIDE_C, WIDE_T)     # 收拢后拉回
cam_key(END, WIDE_C, WIDE_T)
for c in [c for c in cam.constraints]:
    cam.constraints.remove(c)
tc = cam.constraints.new('TRACK_TO')
tc.target = tgt; tc.track_axis = 'TRACK_NEGATIVE_Z'; tc.up_axis = 'UP_Y'
cam.data.dof.focus_object = male

# 形态键：快速扣合用缓入缓出，整体用贝塞尔默认
sc.frame_set(1)
print('frames', sc.frame_start, sc.frame_end)
