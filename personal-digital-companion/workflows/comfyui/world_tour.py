"""绯月旅行摄影。模型网站只接收通用服装／姿态关键词，合成留在本机。"""
import random
import shutil
import subprocess
import tempfile
from pathlib import Path

from public_images import config, read_url, save_reference


PORTRAIT = Path(__file__).with_name("world-tour-feiyue.jpg")
STOPS = {
    "京都": "Kyoto, Japan, a quiet Higashiyama lane lined with wooden machiya townhouses",
    "里斯本": "Lisbon, Portugal, a sloping Alfama street with azulejo tiles and a distant yellow tram",
    "巴黎": "Paris, France, the tree lined embankment of the Seine with limestone apartment buildings",
    "布拉格": "Prague, Czechia, a cobbled riverside lane below the old stone Charles Bridge",
    "伊斯坦布尔": "Istanbul, Turkey, a Bosphorus ferry landing with ferries in the distance",
    "墨尔本": "Melbourne, Australia, a narrow cafe lane with brick facades",
    "开普敦": "Cape Town, South Africa, the colorful houses of Bo-Kaap with Table Mountain behind them",
    "里约热内卢": "Rio de Janeiro, Brazil, the black and white wave-patterned promenade at Copacabana",
    "纽约": "New York City, a Brooklyn brownstone street with stoops and leafy sidewalks",
}
OUTFITS = ("denim jacket", "trench coat", "leather jacket")
POSES = ("walking woman", "standing woman")
# Public search terms and a plausible subject of attention on location.
LOCATIONS = {
    "伊斯坦布尔": ("Istanbul ferry pier waterfront", "the boarding point along the quay"),
    "京都": ("Kyoto Higashiyama street", "a shop entrance along the lane"),
    "里斯本": ("Lisbon Alfama tram street", "the tram stop ahead"),
    "巴黎": ("Paris Seine embankment promenade", "the footpath along the Seine"),
    "布拉格": ("Prague Charles Bridge pedestrians", "the path toward the bridge"),
    "墨尔本": ("Melbourne Degraves Street", "a cafe doorway on the lane"),
    "开普敦": ("Cape Town Bo-Kaap street", "the next corner along the colorful houses"),
    "里约热内卢": ("Copacabana promenade Rio", "the beach access on the promenade"),
    "纽约": ("Brooklyn brownstone sidewalk", "the next stoop on the sidewalk"),
}
BODY = ("One 20-year-old adult East Asian woman, 172 cm, naturally curvy hourglass build, "
        "defined waist, rounded hips and full thighs, realistic joints and adult head scale.")


def single_model(job, raw, extension):
    import comfy_job
    _, runtime, _ = comfy_job.installation()
    with tempfile.TemporaryDirectory(dir=job) as tmp:
        image = Path(tmp)/("candidate"+extension)
        image.write_bytes(raw)
        check = subprocess.run([str(runtime),"-B",str(PORTRAIT.with_name("tour_block.py")),"check",str(image)],
                               creationflags=subprocess.CREATE_NO_WINDOW, capture_output=True, timeout=35)
        return check.returncode==0


def prepare(job, destination, seed, fetch=read_url):
    rng = random.Random(seed)
    destination = destination or rng.choice(list(STOPS))
    settings = config()
    garment, pose = rng.choice(settings.get("outfits") or OUTFITS), rng.choice(POSES)
    query, landmark = LOCATIONS.get(destination, (destination, "a visible point on the public walkway"))
    setting = save_reference(job, "destination", query, settings, fetch=fetch)
    camera = save_reference(job, "camera", settings["cameraQuery"], settings, fetch=fetch)
    wardrobe = save_reference(job, "outfit", garment, settings, rng, fetch, validate=lambda raw,ext: single_model(job,raw,ext))
    movement = save_reference(job, "pose", pose, settings, rng, fetch, validate=lambda raw,ext: single_model(job,raw,ext))
    face = job / PORTRAIT.name
    shutil.copyfile(PORTRAIT, face)
    action = (f"She is on her way toward {landmark}. Catch one short step: the near sole supports her weight, "
              "the other heel has just lifted; the opposite arm swings loosely. Her hips, chest, toes "
              "and gaze follow the same path." if pose == "walking woman" else
              f"She has stopped to look toward {landmark}. Both shoes touch level ground, weight over "
              "one hip, free knee soft. Her shoulders and eyes turn together toward what she sees.")
    frame = ("A single full-length environmental candid in natural color, seen from a slight front three-quarter angle. "
             "Keep the camera level at chest height, a normal lens several paces away. Her crown to soles occupies "
             "about two thirds of the frame. Include pavement below both shoes and room ahead of her.")
    compose = (f"Photograph at {STOPS.get(destination, destination)}. Use the actual location in <image_1>: "
               "retain its architecture, daylight direction and color. Replace the joint guide in place with the woman. "
               "Fit her shoes to the marked feet, her crown just above the marked nose. Leave the ground below her visible. "
               f"{action} {frame} Use <image_4> as a camera reference for full-body framing, ground plane and "
               "breathing space only. Translate the balance from <image_3> to this action and camera angle. "
               f"{BODY} Long black hair in a half-up style. Tailor the {garment} from <image_2> to her body; "
               "copy its seams, material and cut only, with everyday trousers and flat shoes. "
               "Place contact shadows immediately beneath the loaded shoe; same perspective, grain, light and detail throughout.")
    identity = ("Edit the face of the woman in <image_1> using the facial identity in <image_2>: "
                "short oval face, warm brown eyes, delicate gold and ivory flower with a red ribbon in her half-up black hair. "
                "Keep the existing head outline, gaze, head angle, neck and collar in place. Match her cheek shadows, "
                "skin texture, focus and white balance to the candid photograph in <image_1>.")
    steps = [{"op": "edit", "quote": compose, "base": "attachment:1", "refs": [2, 3, 4], "blocking": True},
             {"op": "edit", "quote": identity, "base": "previous", "refs": [5], "region": "head"}]
    report = dict(destination=destination, background="网上实景参考", location=setting, camera=camera,
                  identity=face.name, outfit=wardrobe, pose=movement, action=action, framing=frame)
    return steps, [setting["file"], wardrobe["file"], movement["file"], camera["file"], face.name], report
