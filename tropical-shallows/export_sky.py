import bpy
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
scene=bpy.context.scene
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=1.0
scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=94
img=bpy.data.images.load(str(ROOT/'tropical-shallows/assets/kloofendal_48d_partly_cloudy_puresky_2k.hdr'))
img.save_render(str(ROOT/'tropical-shallows/site/assets/realtime/sky.jpg'),scene=scene)
