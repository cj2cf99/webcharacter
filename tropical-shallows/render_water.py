"""从已完成的 v2 场景继续水专项，不修改其它物件。"""
import bpy,runpy,argparse,sys,os,json
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
parser=argparse.ArgumentParser();parser.add_argument('--iteration',type=int,default=1);parser.add_argument('--variant',type=int,default=2);parser.add_argument('--samples',type=int,default=512);parser.add_argument('--final',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
scene=bpy.context.scene
runpy.run_path(os.path.join(ROOT,'tropical-shallows/sea_breeze.py'))['add_sea_breeze'](scene)
runpy.run_path(os.path.join(ROOT,'tropical-shallows/water.py'))['apply_water'](scene,args.variant)
scene.cycles.use_denoising=False;scene.cycles.samples=args.samples
scene.render.resolution_x,scene.render.resolution_y=(1536,1024) if args.final else (1152,768)
scene.render.filepath=os.path.join(ROOT,'work/tropical-shallows/sea-breeze-%02d.png'%args.iteration)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'work/tropical-shallows/tropical-shallows-water.blend'),compress=True)
print('SEA_BREEZE_READY',json.dumps({'wind':3.5,'wave_scale':.25,'native_spectrum':'TMA','resolution':32,'keyframes':[1,121],'time_seconds':[1,5],'variant':args.variant,'samples':args.samples}),flush=True)
bpy.ops.render.render(write_still=True)
print('SEA_BREEZE_DONE',scene.render.filepath,flush=True)
