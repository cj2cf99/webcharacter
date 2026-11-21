"""在 Comfy 自带的 Python 中运行。只在主角的头部范围写回身份细节。"""
import json
from pathlib import Path
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter


def main(mode, base, stage, model_path):
    base, stage = Path(base), Path(stage)
    with Image.open(base) as original:
        photo = original.convert("RGB")
    def locate(image):
        from ultralytics import YOLO
        if not Path(model_path).is_file():
            raise ValueError("缺少本机主角面部定位模型 face_yolov8m.pt")
        boxes = YOLO(model_path).predict(image, device="cpu", conf=.45, verbose=False)[0].boxes.xyxy.tolist()
        boxes.sort(key=lambda b: (b[2]-b[0])*(b[3]-b[1]), reverse=True)
        if not boxes:
            raise ValueError("没有定位到可辨认的主角面部，保留上一阶段照片")
        x, y, right, bottom = boxes[0]
        w, h = right-x, bottom-y
        if min(w,h)<18 or len(boxes)>1 and (boxes[1][2]-boxes[1][0])*(boxes[1][3]-boxes[1][1])>.65*w*h:
            raise ValueError("主角面部太小或有多人同等突出，保留上一阶段照片")
        return x,y,right,bottom
    if mode == "crop":
        x,y,right,bottom = locate(photo)
        w,h = right-x,bottom-y
        side = min(max(4*w, 3.6*h), *photo.size)
        cx, cy = (x+right)/2, (y+bottom)/2-.15*h
        left = max(0, min(photo.width-side, cx-side/2))
        top = max(0, min(photo.height-side, cy-side/2))
        region = [round(v) for v in (left,top,left+side,top+side)]
        mask = [round(v) for v in (x-.32*w,y-.68*h,right+.32*w,bottom+.08*h)]
        (stage/"head.json").write_text(json.dumps(dict(region=region, face=[x,y,right,bottom], mask=mask, feather=max(1,round(.09*w)))))
        photo.crop(region).resize((512,512),Image.Resampling.LANCZOS).save(stage/"context.png")
    else:
        data = json.loads((stage/"head.json").read_text())
        l,t,r,b = data["region"]
        with Image.open(stage/"head-edit.png") as edited:
            x,y,right,bottom = locate(edited)
            a,b0,c,d = data["face"]
            sx,sy = (right-x)/(c-a),(bottom-y)/(d-b0)
            # Inverse mapping into the edited crop aligns the cheekbones and jaw to the original face.
            affine = (sx,0,x+(l-a)*sx,0,sy,y+(t-b0)*sy)
            patch = edited.convert("RGB").transform((r-l,b-t),Image.Transform.AFFINE,affine,Image.Resampling.BICUBIC)
            coverage = Image.new("L",edited.size,255).transform((r-l,b-t),Image.Transform.AFFINE,affine)
        mask = Image.new("L", photo.size)
        ImageDraw.Draw(mask).ellipse(data["mask"], fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(data["feather"]))
        # Clip the feather to the original subject, so a bright studio backdrop cannot form a halo around her hair.
        from ultralytics import YOLO
        person_model=Path(model_path).parents[1]/"segm/person_yolov8m-seg.pt"
        if not person_model.is_file():
            raise ValueError("缺少本机人物轮廓模型 person_yolov8m-seg.pt")
        detected=YOLO(str(person_model)).predict(photo,device="cpu",verbose=False)[0]
        silhouette=Image.new("L",photo.size)
        for polygon in detected.masks.xy if detected.masks is not None else ():
            if len(polygon)>=3:
                ImageDraw.Draw(silhouette).polygon([tuple(point) for point in polygon],fill=255)
        if not silhouette.getpixel((round((a+c)/2),round((b0+d)/2))):
            raise ValueError("无法确认主角头部轮廓")
        mask=ImageChops.multiply(mask,silhouette.filter(ImageFilter.GaussianBlur(1)))
        # The identity photo has a pale studio wall. Preserve dark hair outside the facial oval
        # when the aligned edit tries to replace it with a much brighter background.
        face=Image.new("L",patch.size)
        ImageDraw.Draw(face).ellipse((a-l,b0-t,c-l,d-t),fill=255)
        face=face.filter(ImageFilter.GaussianBlur(max(1,data["feather"]//2)))
        brighter=ImageChops.subtract(patch.convert("L"),photo.crop((l,t,r,b)).convert("L"))
        hair=brighter.point(lambda delta:max(0,min(255,(44-delta)*8)))
        alpha=ImageChops.multiply(mask.crop((l,t,r,b)),coverage)
        photo.paste(patch,(l,t),ImageChops.multiply(alpha,ImageChops.lighter(face,hair)))
        photo.save(stage/"result.png")
        print(json.dumps(dict(width=photo.width,height=photo.height)))


if __name__ == "__main__":
    try:
        main(*sys.argv[1:])
    except Exception as exc:
        sys.exit(str(exc))
