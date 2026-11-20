# 人鱼公主建模公用工具：numpy 网格、单调插值、材质节点简写。
import bpy, numpy as np
from mathutils import Vector, Matrix

H_TOTAL = 3.05          # 头顶至尾鳍末梢中轴展开长度（米）
H_BODY = 0.82           # 头顶至鱼尾起点
L_TAIL = 1.40           # 鱼尾躯干
L_FIN = 0.83            # 主尾鳍


def z_of(h):
    """沿中轴自头顶向下的长度 h → 站立建模姿态下的世界 z。"""
    return H_TOTAL - np.asarray(h, float)


def pchip(xs, ys):
    """单调分段三次插值，避免截面宽度在控制点之间过冲。"""
    xs = np.asarray(xs, float); ys = np.asarray(ys, float)
    hk = np.diff(xs); dk = np.diff(ys) / hk
    m = np.zeros_like(ys)
    for k in range(1, len(xs) - 1):
        if dk[k - 1] * dk[k] > 0:
            w1 = 2 * hk[k] + hk[k - 1]; w2 = hk[k] + 2 * hk[k - 1]
            m[k] = (w1 + w2) / (w1 / dk[k - 1] + w2 / dk[k])
    m[0] = dk[0]; m[-1] = dk[-1]

    def f(x):
        x = np.clip(np.asarray(x, float), xs[0], xs[-1])
        i = np.clip(np.searchsorted(xs, x) - 1, 0, len(xs) - 2)
        t = (x - xs[i]) / hk[i]
        h00 = (1 + 2 * t) * (1 - t) ** 2; h10 = t * (1 - t) ** 2
        h01 = t * t * (3 - 2 * t); h11 = t * t * (t - 1)
        return h00 * ys[i] + h10 * hk[i] * m[i] + h01 * ys[i + 1] + h11 * hk[i] * m[i + 1]
    return f


def smoothstep(a, b, x):
    t = np.clip((np.asarray(x, float) - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def grid_faces(rows, cols, wrap=True, offset=0):
    """rows×cols 顶点网格的四边形面；wrap 为环向闭合。"""
    c2 = cols if wrap else cols - 1
    r = np.arange(rows - 1)[:, None]; c = np.arange(c2)[None, :]
    a = r * cols + c; b = r * cols + (c + 1) % cols
    f = np.stack([a, b, b + cols, a + cols], -1).reshape(-1, 4) + offset
    return f


def make_mesh(name, verts, faces, mat=None, coll=None, smooth=True, attrs=None, uv=None):
    verts = np.asarray(verts, np.float32).reshape(-1, 3)
    faces = np.asarray(faces, np.int32)
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(verts)); me.vertices.foreach_set('co', verts.ravel())
    n = faces.shape[1]
    me.loops.add(len(faces) * n); me.loops.foreach_set('vertex_index', faces.ravel())
    me.polygons.add(len(faces))
    me.polygons.foreach_set('loop_start', np.arange(0, len(faces) * n, n, dtype=np.int32))
    me.update(calc_edges=True); me.validate()
    if smooth:
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    if uv is not None:
        lay = me.uv_layers.new(name='UVMap')
        lay.data.foreach_set('uv', np.asarray(uv, np.float32)[faces.ravel()].ravel())
    for k, v in (attrs or {}).items():
        v = np.asarray(v, np.float32)
        if v.ndim == 1:
            a = me.attributes.new(k, 'FLOAT', 'POINT'); a.data.foreach_set('value', v)
        else:
            a = me.color_attributes.new(k, 'FLOAT_COLOR', 'POINT')
            if v.shape[1] == 3: v = np.concatenate([v, np.ones((len(v), 1), np.float32)], 1)
            a.data.foreach_set('color', v.ravel())
    if mat: me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(ob)
    return ob


def merge(parts):
    """[(verts, faces), ...] → 单个顶点/面数组。"""
    vs, fs, off = [], [], 0
    for v, f in parts:
        v = np.asarray(v).reshape(-1, 3); vs.append(v); fs.append(np.asarray(f) + off); off += len(v)
    return np.concatenate(vs), np.concatenate(fs)


def frame_from(d, up=(0, 0, 1)):
    """以方向 d 为 Z 轴的正交基（返回 3×3，列为 x,y,z）。"""
    d = np.asarray(d, float); d = d / np.linalg.norm(d)
    u = np.asarray(up, float)
    if abs(np.dot(u, d)) > .95: u = np.array([1., 0, 0])
    x = np.cross(u, d); x /= np.linalg.norm(x); y = np.cross(d, x)
    return np.stack([x, y, d], 1)


def tube(path, radius, seg=8, cap=False, radius2=None, up=(0, 0, 1)):
    """沿折线的圆管（平行移动标架），radius 可为数组；radius2 给出椭圆第二半径。"""
    P = np.asarray(path, float); n = len(P)
    r1 = np.broadcast_to(np.asarray(radius, float), (n,))
    r2 = r1 if radius2 is None else np.broadcast_to(np.asarray(radius2, float), (n,))
    T = np.gradient(P, axis=0); T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-12
    F = frame_from(T[0], up); nx = F[:, 0]
    ang = np.linspace(0, 2 * np.pi, seg, endpoint=False)
    V = np.zeros((n, seg, 3))
    for i in range(n):
        nx = nx - T[i] * np.dot(nx, T[i]); nx /= np.linalg.norm(nx) + 1e-12
        ny = np.cross(T[i], nx)
        V[i] = P[i] + np.outer(np.cos(ang) * r1[i], nx) + np.outer(np.sin(ang) * r2[i], ny)
    V = V.reshape(-1, 3); F = grid_faces(n, seg)
    if cap:
        V = np.vstack([V, P[0], P[-1]]); a, b = len(V) - 2, len(V) - 1
        s = np.arange(seg)
        F = np.vstack([F, np.stack([np.full(seg, a), (s + 1) % seg, s, s], 1),
                       np.stack([np.full(seg, b), (n - 1) * seg + s, (n - 1) * seg + (s + 1) % seg,
                                 (n - 1) * seg + (s + 1) % seg], 1)])
        # 退化四边形转为三角形写法：后两个索引相同在 Blender 里会被 validate 修正，这里改成三角形另存
    return V, F


def tube_tri(path, radius, seg=8, radius2=None, up=(0, 0, 1)):
    """圆管 + 两端扇形三角封口（返回 verts、quad faces、tri faces）。"""
    V, F = tube(path, radius, seg, cap=False, radius2=radius2, up=up)
    n = len(path); V = np.vstack([V, path[0], path[-1]]); a, b = len(V) - 2, len(V) - 1
    s = np.arange(seg)
    tris = np.vstack([np.stack([np.full(seg, a), (s + 1) % seg, s], 1),
                      np.stack([np.full(seg, b), (n - 1) * seg + s, (n - 1) * seg + (s + 1) % seg], 1)])
    return V, F, tris


def make_mixed(name, verts, quads, tris, mat=None, coll=None, attrs=None, smooth=True):
    """四边形与三角形混合网格。"""
    verts = np.asarray(verts, np.float32).reshape(-1, 3)
    polys = [list(map(int, q)) for q in quads] + [list(map(int, t)) for t in tris]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts.tolist(), [], polys); me.update(); me.validate()
    if smooth: me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    for k, v in (attrs or {}).items():
        v = np.asarray(v, np.float32)
        a = me.attributes.new(k, 'FLOAT', 'POINT'); a.data.foreach_set('value', v)
    if mat: me.materials.append(mat)
    ob = bpy.data.objects.new(name, me); (coll or bpy.context.scene.collection).objects.link(ob)
    return ob


def srgb(hexstr, a=1.0):
    h = hexstr.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c]
    return (*lin, a)


class NT:
    """材质节点简写。"""
    def __init__(self, mat):
        mat.use_nodes = True
        self.mat = mat; self.nt = mat.node_tree; self.nodes = self.nt.nodes; self.links = self.nt.links
        self.bsdf = self.nodes.get('Principled BSDF')
        self.out = self.nodes.get('Material Output')

    def node(self, kind, **kw):
        n = self.nodes.new(kind)
        for k, v in kw.items():
            if k.startswith('i_'):
                key = k[2:].replace('_', ' ')
                n.inputs[key].default_value = v
            else:
                setattr(n, k, v)
        return n

    def link(self, a, b):
        self.links.new(a, b)

    def math(self, op, a, b=None, clamp=False):
        n = self.nodes.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: self.links.new(v, n.inputs[i])
        return n.outputs[0]

    def mix(self, fac, a, b, blend='MIX'):
        n = self.nodes.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = blend
        for sock, v in ((n.inputs[0], fac), (n.inputs[6], a), (n.inputs[7], b)):
            if isinstance(v, (int, float)): sock.default_value = v
            elif isinstance(v, tuple): sock.default_value = v
            else: self.links.new(v, sock)
        return n.outputs[2]

    def attr(self, name):
        n = self.nodes.new('ShaderNodeAttribute'); n.attribute_name = name; return n

    def set(self, **kw):
        for k, v in kw.items():
            key = k.replace('_', ' ')
            if isinstance(v, (int, float, tuple)): self.bsdf.inputs[key].default_value = v
            else: self.links.new(v, self.bsdf.inputs[key])


def new_mat(name, color=(.8, .8, .8, 1), **kw):
    m = bpy.data.materials.new(name); t = NT(m)
    t.set(Base_Color=color, **kw)
    m.diffuse_color = color
    return m, t
