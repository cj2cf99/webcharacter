import bpy,os,runpy,json
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sc=bpy.context.scene
runpy.run_path(os.path.join(ROOT,'tropical-shallows/swash.py'))['add_swash'](sc)
sc.cycles.use_denoising=False;sc.cycles.samples=512
sc.render.resolution_x=1536;sc.render.resolution_y=1024
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'work/tropical-shallows/tropical-shallows-swash.blend'),compress=True)
sc.render.filepath=os.path.join(ROOT,'work/tropical-shallows/swash-uprush.png')
bpy.ops.render.render(write_still=True)
sc.frame_set(130);sc.render.filepath=os.path.join(ROOT,'work/tropical-shallows/swash-backwash.png')
bpy.ops.render.render(write_still=True)
print('SWASH_RENDER_DONE',flush=True)
