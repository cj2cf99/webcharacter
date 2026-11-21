"""用本机 Pillow 解码公开图像。只把重编码的小预览送进桌宠窗口。"""
import sys
from io import BytesIO
from PIL import Image, ImageOps

full_news = sys.argv[1:] == ["--news-full"]
news = full_news or sys.argv[1:] == ["--news"]
stream = news or sys.argv[1:] == ["--search"]
with Image.open(BytesIO(sys.stdin.buffer.read()) if stream else sys.argv[1]) as image:
    if image.format not in ("JPEG","PNG","WEBP") or image.width*image.height>24_000_000:
        raise ValueError("图片超出解码范围")
    if news and (image.width < 80 or image.height < 48):
        raise ValueError("图像过小")
    preview = ImageOps.exif_transpose(image)
    preview.thumbnail((1280,960) if full_news else (288,216) if news else (300,200))
    preview.convert("RGB").save(sys.stdout.buffer if stream else sys.argv[2],"JPEG",quality=82 if news else 78)
