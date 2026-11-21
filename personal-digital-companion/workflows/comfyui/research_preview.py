"""用本机 Pillow 解码公开图像。只把重编码的小预览送进桌宠窗口。"""
import sys
from io import BytesIO
from PIL import Image, ImageOps

news = sys.argv[1:] == ["--news"]
with Image.open(BytesIO(sys.stdin.buffer.read()) if news else sys.argv[1]) as image:
    if image.format not in ("JPEG","PNG","WEBP") or image.width*image.height>24_000_000:
        raise ValueError("图片超出解码范围")
    if news and (image.width < 80 or image.height < 48):
        raise ValueError("图像过小")
    image.thumbnail((760,490) if news else (300,200))
    ImageOps.exif_transpose(image).convert("RGB").save(sys.stdout.buffer if news else sys.argv[2],"JPEG",quality=82 if news else 78)
