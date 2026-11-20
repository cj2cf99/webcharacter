"""只读检查已保存离线场景，为实时转换提供实际资源清单。"""
import bpy, json, math
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'work/tropical-shallows/tropical-shallows-swash.blend'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene = bpy.context.scene
scene.frame_set(1)
objects = []
for o in scene.objects:
    if o.type != 'MESH' or o.hide_render:
        continue
    mesh = o.data
    corners = [o.matrix_world @ __import__('mathutils').Vector(v) for v in o.bound_box]
    objects.append({
        'name': o.name, 'mesh': mesh.name, 'vertices': len(mesh.vertices),
        'triangles': sum(max(0, len(p.vertices)-2) for p in mesh.polygons),
        'materials': [m.name if m else None for m in mesh.materials],
        'uvLayers': list(mesh.uv_layers.keys()),
        'modifiers': [{'type': m.type, 'name': m.name} for m in o.modifiers],
        'shapeKeys': len(mesh.shape_keys.key_blocks) if mesh.shape_keys else 0,
        'bounds': [[min(p[i] for p in corners) for i in range(3)],
                   [max(p[i] for p in corners) for i in range(3)]],
    })
meshes = {o.data.name: o.data for o in scene.objects if o.type == 'MESH' and not o.hide_render}
materials = []
for m in bpy.data.materials:
    if not m.users: continue
    nodes = Counter(n.type for n in m.node_tree.nodes) if m.use_nodes else Counter()
    materials.append({'name': m.name, 'users': m.users, 'nodes': dict(nodes)})
cam = scene.camera
report = {
    'source': str(SOURCE), 'frame': scene.frame_current,
    'meshObjects': len(objects), 'uniqueMeshes': len(meshes),
    'uniqueVertices': sum(len(m.vertices) for m in meshes.values()),
    'instancedTriangles': sum(o['triangles'] for o in objects),
    'uniqueTriangles': sum(sum(max(0,len(p.vertices)-2) for p in m.polygons) for m in meshes.values()),
    'camera': {'position': list(cam.location), 'matrixWorld': [list(row) for row in cam.matrix_world],
               'fovY': cam.data.angle_y, 'fovX': cam.data.angle_x,
               'lens': cam.data.lens, 'sensorWidth': cam.data.sensor_width},
    'images': [{'name': i.name, 'size': list(i.size), 'packed': bool(i.packed_file),
                'source': i.filepath} for i in bpy.data.images if i.users],
    'materials': materials,
    'objects': sorted(objects, key=lambda o: o['triangles'], reverse=True),
}
out = ROOT / 'work/tropical-shallows/realtime-audit.json'
out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print('REALTIME_AUDIT', json.dumps({k: report[k] for k in ['meshObjects','uniqueMeshes','uniqueVertices','uniqueTriangles','instancedTriangles']},ensure_ascii=False))
print('REPORT', out)
