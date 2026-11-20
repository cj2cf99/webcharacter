"""提取既有冲退轨迹为浏览器可用 Float32 数据；不修改离线工程。"""
import bpy, json, numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'work/tropical-shallows/realtime-prep'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'work/tropical-shallows/tropical-shallows-swash.blend'))
manifest = {'version': 1, 'coordinates': 'right-handed Y-up; (x,z,-y) from Blender',
            'fps': 30, 'durationSeconds': 6, 'frames': list(range(1,182,6)), 'meshes': []}
buffer = bytearray()
errors = {}
for name, columns, target in [('冲滩薄水层',43,'film'), ('随浪前缘碎沫',9,'frontFoam'), ('留滩碎沫',9,'residueFoam')]:
    obj = bpy.context.scene.objects[name]
    rows = 501
    assert len(obj.data.vertices) == rows * columns
    step = 1 if target == 'film' else 2
    rr = np.arange(0,rows,step); cc = np.arange(0,columns,step)
    indices = (rr[:,None]*columns+cc[None,:]).ravel()
    faces = []
    for j in range(len(rr)-1):
        for i in range(len(cc)-1):
            a = j*len(cc)+i
            faces.extend([a,a+1,a+len(cc)+1,a,a+len(cc)+1,a+len(cc)])
    keys = list(obj.data.shape_keys.key_blocks)[1:] if obj.data.shape_keys else [None]
    offset = len(buffer); max_error = 0; first = None; loop_correction = 0
    for key_index,key in enumerate(keys):
        data = key.data if key else obj.data.vertices
        xyz = np.empty(len(data)*3,np.float32); data.foreach_get('co',xyz); xyz=xyz.reshape(-1,3)
        # 计算降采样后在原网格各点的双线性重建误差，防止岸缘精简过度。
        grid = xyz.reshape(rows,columns,3)
        low = grid[rr][:,cc]
        mid = np.empty((rows,len(cc),3),np.float32)
        reconstructed = np.empty_like(grid)
        for c in range(len(cc)):
            for axis in range(3): mid[:,c,axis] = np.interp(np.arange(rows),rr,low[:,c,axis])
        for r in range(rows):
            for axis in range(3): reconstructed[r,:,axis] = np.interp(np.arange(columns),cc,mid[r,:,axis])
        max_error = max(max_error,float(np.linalg.norm(reconstructed-grid,axis=2).max()))
        points = xyz[indices].copy()
        if first is None: first = points.copy()
        # 只修正最后 1.2 秒的休止段，前冲和主要退水轨迹保持原值。
        if len(keys) > 1:
            phase = np.clip((manifest['frames'][key_index]-145)/36,0,1)
            blend = phase*phase*(3-2*phase)
            corrected = points*(1-blend)+first*blend
            loop_correction = max(loop_correction,float(np.linalg.norm(corrected-points,axis=1).max()))
            points = corrected
        converted = np.column_stack((points[:,0],points[:,2],-points[:,1])).astype('<f4')
        assert np.isfinite(converted).all()
        buffer.extend(converted.tobytes())
    manifest['meshes'].append({'name': target, 'sourceObject': name, 'rows': len(rr), 'columns': len(cc),
        'vertexCount': len(indices), 'frameCount': len(keys), 'byteOffset': offset,
        'byteLength': len(buffer)-offset, 'indices': faces, 'maxSpatialErrorMetres': max_error,
        'loopClosure': {'fromFrame':145,'endFrame':181,'maxCorrectionMetres':loop_correction}})
    errors[target] = max_error
manifest['foamStrengthKeys'] = {
    'frontFoam': [[1,.18],[22,.75],[51,1],[87,.50],[130,.18],[160,.08],[181,.18]],
    'residueFoam': [[1,.05],[31,.70],[51,1],[96,.35],[145,.03],[181,.05]]}
manifest['binary'] = 'swash-motion.bin'
(OUT / 'swash-motion.bin').write_bytes(buffer)
(OUT / 'swash-motion.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
result = {'binaryBytes': len(buffer), 'spatialErrorsMetres': errors,
          'finite': True, 'sourcePreserved': True,
          'note': '仅为转换准备；浏览器水材质、海面FFT和画质/帧率尚未验证。'}
(OUT / 'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False),flush=True)
assert errors['film'] < .00001 and max(errors.values()) < .02, '空间采样误差过大，必须提高密度'
