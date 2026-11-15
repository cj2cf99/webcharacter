# 全流程（在 Blender 中按步骤 exec；每步单独调用以免超时）：
#   STEP = 'model'  → 建模 + 材质 + 光照 + 合并展 UV
#   STEP = 'bake1'  → 门、地面、外观 A
#   STEP = 'bake2'  → 外观 B、室内、玻璃、天空
#   STEP = 'export' → 编码贴图、碰撞网格、导出 glb（导出会替换材质，之后需重新 'model'）
#   STEP = 'ext1'   → 天候 W3：外部颜色烘焙（不含光照）
#   【顺序】室内烘焙（bake2 / int）必须在任何导出步骤（export / ext2 / ext3）之前：导出会把玻璃换成不透明材质。
#   STEP = 'ext2'   → 天候 W3：外部遮蔽烘焙、编码、导出到 site/assets_next/（导出会替换材质，之后需重新 'model'）
# 用法：exec("STEP='model'\n" + open(r"G:/selftool/Cathedral/blender/build_all.py", encoding='utf-8').read())
import time
B = r"G:/selftool/Cathedral/blender/"
load = lambda f: exec(open(B + f, encoding='utf-8').read(), globals())
T0 = time.time()
if STEP == 'model':
    for f in ('massing.py', 'materials.py', 'lighting.py', 'bake.py'):
        load(f)
    prepare_all()
elif STEP == 'bake1':
    load('bake.py')
    for n in ('door_l', 'door_r', 'ground', 'ext_a'):
        bake_group(n)
elif STEP == 'bake2':
    load('bake.py')
    for n in ('ext_b', 'int'):
        bake_group(n)
    bake_glass(); render_sky()
elif STEP == 'export':
    load('bake.py'); load('collision.py')
    tonemap_all()
    run_collision()
    export_all()
elif STEP == 'ext1':
    load('bake.py'); load('bake_ext.py')
    for n in EXT_RES:
        bake_albedo(n)
elif STEP == 'ext2':
    load('bake.py'); load('bake_ext.py')
    for n in EXT_RES:
        bake_ao(n)
    encode_ext()
    export_ext()
elif STEP == 'ext3':          # 只重新导出外部 glb（颜色/遮蔽贴图已在 assets_next，沿用）
    load('bake.py'); load('bake_ext.py')
    export_ext()
elif STEP == 'int':           # 只重烘并导出室内（分类后的室内面 + 地板）
    load('bake.py')
    bake_group('int')
    export_interior()
print('step', STEP, 'sec', round(time.time() - T0, 1))
