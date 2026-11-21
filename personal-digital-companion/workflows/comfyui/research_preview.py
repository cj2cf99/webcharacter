"""用本机 Pillow 解码公开图像。只把重编码的小预览送进桌宠窗口。"""
import sys
from PIL import Image, ImageOps

with Image.open(sys.argv[1]) as image:
    if image.format not in ("JPEG","PNG","WEBP") or image.width*image.height>24_000_000:
        raise ValueError("图片超出解码范围")
    image.thumbnail((300,200))
    ImageOps.exif_transpose(image).convert("RGB").save(sys.argv[2],"JPEG",quality=78)
