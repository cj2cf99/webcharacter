"""显式运行一次离线 GPU 验收；沿用真实 Desktop 缓存和全局作业锁。"""
import json
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
cli = str(root / "workflows/comfyui/image_chain.py")
phrases = ["a blue ceramic teapot on a table", "change the blue teapot to red", "upscale"]
steps = [dict(op=op, quote=text, refs=[]) for op, text in zip(("generate", "edit", "upscale"), phrases)]
request = json.dumps(dict(original="; ".join(phrases), steps=steps))
reply = subprocess.check_output([sys.executable, "-B", cli, "submit"], input=request.encode())
job = json.loads(reply)["job"]
print("job", job, flush=True)
wait = subprocess.run([sys.executable, "-B", str(root.parent / "tools/comfy_job.py"), "wait", job], capture_output=True)
receipt = json.loads(wait.stdout)
print(json.dumps(receipt), flush=True)
assert receipt["state"] == "done" and len(receipt["completed"]) == 3
images = receipt["completed"]
assert (images[-1]["width"], images[-1]["height"]) == (images[1]["width"] * 4, images[1]["height"] * 4)
assert all(Path(row["output"]).read_bytes()[:8] == b"\x89PNG\r\n\x1a\n" for row in images)
