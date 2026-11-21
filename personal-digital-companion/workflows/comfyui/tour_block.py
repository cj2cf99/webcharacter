"""将姿势参考降为骨架，并按全身机位在目的地照片上标记承重位置。"""
from pathlib import Path
import sys

import mediapipe as mp
from PIL import Image, ImageDraw, ImageOps


def landmarks(pose):
    with Image.open(pose) as ref:
        if ref.width*ref.height>24_000_000:
            raise ValueError("候选图像过大")
    options = mp.tasks.vision.PoseLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(Path(__file__).with_name("pose_landmarker_lite.task"))),
        num_poses=2, min_pose_detection_confidence=.35)
    with mp.tasks.vision.PoseLandmarker.create_from_options(options) as detector:
        result = detector.detect(mp.Image.create_from_file(str(pose)))
    if len(result.pose_landmarks)!=1:
        raise ValueError("需要能辨认出单人全身的参考图")
    points = result.pose_landmarks[0]
    if min(max(points[i].visibility for i in group) for group in ((11,12),(23,24),(25,26),(27,28))) < .45:
        raise ValueError("姿势图缺少可见的承重关节，请重新取材")
    return points


def block(scene, pose, directory):
    points = landmarks(pose)
    with Image.open(pose) as ref:
        pw, ph = ref.size
    with Image.open(scene) as photo:
        size = (960,768) if photo.width >= photo.height else (768,960)
        plate = ImageOps.fit(ImageOps.exif_transpose(photo).convert("RGB"), size)
    ids = (0,11,12,13,14,15,16,23,24,25,26,27,28,29,30,31,32)
    raw = {i:(points[i].x*pw,points[i].y*ph) for i in ids}
    top = raw[0][1]
    floor = max(raw[i][1] for i in (27,28,29,30,31,32))
    if floor-top < .22*ph:
        raise ValueError("姿势图无法定位脚底")
    scale = .62*size[1]/(floor-top)
    center = (raw[23][0]+raw[24][0])/2
    def xy(i):
        x,y = raw[i]
        return (.47*size[0]+(x-center)*scale, .87*size[1]+(y-floor)*scale)
    def mid(i,j):
        a,b=xy(i),xy(j)
        return ((a[0]+b[0])/2,(a[1]+b[1])/2)
    card = Image.new("RGB",size,(230,230,230))
    for canvas in (card,plate):
        draw = ImageDraw.Draw(canvas)
        for chain in ((15,13,11,12,14,16),(23,24),(23,25,27,29,31),(24,26,28,30,32)):
            draw.line([xy(i) for i in chain],fill=(91,95,100),width=6)
        neck, pelvis = mid(11,12),mid(23,24)
        draw.line([xy(0),neck,pelvis],fill=(91,95,100),width=7)
        x,y=xy(0)
        radius=.028*size[1]
        draw.ellipse((x-radius,y-radius*1.3,x+radius,y+radius*1.3),fill=(127,127,127))
    card.save(directory/"pose-card.png")
    plate.save(directory/"blocking.png")


if __name__ == "__main__":
    try:
        if sys.argv[1]=="check":
            landmarks(Path(sys.argv[2]))
        else:
            block(*map(Path,sys.argv[1:]))
    except Exception as exc:
        sys.exit(str(exc))
