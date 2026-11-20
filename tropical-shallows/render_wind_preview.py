"""真实 Ocean 时间轴短预览，独立进程修改输出配置，不覆盖高清工程。"""
import bpy,os,json,sys,argparse
parser=argparse.ArgumentParser();parser.add_argument('--full',action='store_true');parser.add_argument('--quality',action='store_true');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sc=bpy.context.scene
has_swash=bool(sc.get('swash_period_seconds'))
for action in bpy.data.actions:
    if not action.users:continue
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.co.x=1+(key.co.x-1)*.4
                        key.handle_left.x=1+(key.handle_left.x-1)*.4
                        key.handle_right.x=1+(key.handle_right.x-1)*.4
                        key.interpolation='LINEAR'
sc.render.fps=12;sc.frame_start=1;sc.frame_end=73 if has_swash else 49;sc.frame_set(1)
sc.render.resolution_x=768;sc.render.resolution_y=512;sc.render.resolution_percentage=100
if has_swash and not args.full:
    sc.render.resolution_x=1152;sc.render.resolution_y=768
    sc.render.use_border=True;sc.render.use_crop_to_border=True
    sc.render.border_min_x=0;sc.render.border_max_x=.6875;sc.render.border_min_y=.1875;sc.render.border_max_y=.59375
if args.full:
    sc.render.use_border=False;sc.render.use_crop_to_border=False
    sc.render.resolution_x,sc.render.resolution_y=(1152,768) if args.quality else (960,640)
sc.render.use_persistent_data=True
sc.cycles.samples=128;sc.cycles.use_denoising=False
sc.render.image_settings.media_type='VIDEO'
sc.render.image_settings.file_format='FFMPEG'
sc.render.ffmpeg.format='MPEG4';sc.render.ffmpeg.codec='H264';sc.render.ffmpeg.constant_rate_factor='MEDIUM'
sc.render.filepath=os.path.join(ROOT,('work/tropical-shallows/whole-scene-hq.mp4' if args.quality else 'work/tropical-shallows/whole-scene.mp4') if args.full else ('work/tropical-shallows/swash-preview.mp4' if has_swash else 'work/tropical-shallows/sea-breeze-preview.mp4'))
def progress(scene,*args):print('WIND_PREVIEW_FRAME',scene.frame_current,flush=True)
bpy.app.handlers.render_post.append(progress)
print('WIND_PREVIEW_START',flush=True)
bpy.ops.render.render(animation=True)
print('WIND_PREVIEW_DONE',sc.render.filepath,flush=True)
