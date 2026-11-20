"""Windows 本机 ComfyUI 后台作业。仅使用标准库和 Desktop 已安装的运行环境。"""
import argparse
import contextlib
import ctypes
import json
import msvcrt
import os
from pathlib import Path
import secrets
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time
from urllib import error, parse, request
import uuid


ROOT = Path(os.environ["LOCALAPPDATA"]) / "Feiyue" / "ComfyJobs"
DESKTOP = Path(os.environ["APPDATA"]) / "Comfy Desktop"
CHECKPOINT = "sd_xl_turbo_1.0_fp16.safetensors"
HTTP = request.build_opener(request.ProxyHandler({}))
JOB_SECONDS = 600


class JobTimeout(TimeoutError):
    pass


def remaining(deadline):
    seconds = deadline - time.monotonic()
    if seconds <= 0:
        raise JobTimeout("任务从提交起已满 10 分钟，已超时")
    return seconds


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path, value):
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)


def installation():
    for item in read_json(DESKTOP / "installations.json"):
        if not item.get("installPath"):
            continue
        app = Path(item["installPath"]) / "ComfyUI"
        python = app / ".venv/Scripts/python.exe"
        models = DESKTOP / "instance-model-paths" / (item["id"] + ".yaml")
        if python.is_file() and (app / "main.py").is_file() and models.is_file():
            return app, python, models
    raise RuntimeError("找不到 Comfy Desktop 本地虚拟环境或模型路径配置")


@contextlib.contextmanager
def gpu_slot(deadline):
    # Windows 在进程退出时释放文件锁。多次提交不会同时把模型装入显存。
    with (ROOT / "gpu.lock").open("a+b") as lock:
        lock.seek(0)
        while True:
            remaining(deadline)
            try:
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                break
            except OSError as exc:
                if exc.errno != 13:
                    raise
                time.sleep(min(0.5, remaining(deadline)))
        try:
            yield
        finally:
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)


def workflow(spec):
    def node(kind, **inputs):
        return {"class_type": kind, "inputs": inputs}

    graph = {
        "1": node("CheckpointLoaderSimple", ckpt_name=CHECKPOINT),
        "2": node("CLIPTextEncode", clip=["1", 1], text=spec["prompt"]),
        "3": node("CLIPTextEncode", clip=["1", 1], text=""),
        "6": node("VAEDecode", samples=["5", 0], vae=["1", 2]),
        "7": node("SaveImage", images=["6", 0], filename_prefix="result"),
    }
    editing = bool(spec.get("input"))
    if editing:
        graph["8"] = node("LoadImage", image=spec["input"])
        graph["9"] = node("ImageScaleToMaxDimension", image=["8", 0],
                          upscale_method="lanczos", largest_size=spec["size"])
        graph["4"] = node("VAEEncode", pixels=["9", 0], vae=["1", 2])
    else:
        graph["4"] = node("EmptyLatentImage", width=spec["size"], height=spec["size"], batch_size=1)
    graph["5"] = node("KSampler", model=["1", 0], positive=["2", 0], negative=["3", 0],
                      latent_image=["4", 0], seed=spec["seed"], steps=4 if editing else 2,
                      cfg=1.0, sampler_name="euler_ancestral", scheduler="normal",
                      denoise=spec["strength"] if editing else 1.0)
    return graph


def json_api(base, route, deadline, body=None):
    payload = json.dumps(body).encode() if body is not None else None
    req = request.Request(base + route, data=payload, headers={"Content-Type": "application/json"})
    try:
        with HTTP.open(req, timeout=min(10, remaining(deadline))) as resp:
            return json.load(resp)
    except error.HTTPError as exc:
        raise RuntimeError(f"{route}: HTTP {exc.code} {exc.read(1500).decode(errors='replace')}") from exc


def save_image(base, image, output, deadline):
    query = parse.urlencode({k: image[k] for k in ("filename", "subfolder", "type")})
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=output.parent, suffix=".part", delete=False) as temp:
        part = Path(temp.name)
    try:
        with HTTP.open(base + "/view?" + query, timeout=min(60, remaining(deadline))) as resp, part.open("wb") as f:
            while chunk := resp.read1(65536):
                remaining(deadline)
                f.write(chunk)
        with part.open("rb") as f:
            header = f.read(24)
        if header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
            raise ValueError("ComfyUI 没有返回有效的 PNG")
        width, height = struct.unpack(">II", header[16:24])
        # Windows 同卷 rename 在目标已存在时失败，两个任务不会覆盖彼此或用户文件。
        remaining(deadline)
        part.rename(output)
        return {"output": str(output), "width": width, "height": height}
    finally:
        part.unlink(missing_ok=True)


def execute(job, spec, update, deadline, *, graph=None, inputs=None):
    app, python, models = installation()
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory(prefix="comfy-", dir=job, ignore_cleanup_errors=True) as tmp:
        scratch = Path(tmp)
        (scratch / "user").mkdir()
        (scratch / "input").mkdir()
        if inputs is None:
            inputs = {spec["input"]: job / spec["input"]} if spec.get("input") else {}
        for name, source in inputs.items():
            shutil.copyfile(source, scratch / "input" / name)
        args = [str(python), "-B", "main.py", "--listen", "127.0.0.1", "--port", str(port),
                "--disable-auto-launch", "--offline", "--disable-all-custom-nodes",
                "--base-directory", tmp, "--user-directory", str(scratch / "user"),
                "--extra-model-paths-config", str(models)]
        if graph and any(node["class_type"] == "UpscaleModelLoader" for node in graph.values()):
            paths = scratch / "upscale-paths.yaml"
            paths.write_text(json.dumps({"local_upscale": {"base_path": str(app / "models"),
                                                           "upscale_models": "upscale_models"}}), encoding="utf-8")
            args.append(str(paths))
        with (job / "backend.log").open("w", encoding="utf-8") as log:
            remaining(deadline)
            proc = subprocess.Popen(args, cwd=app, stdout=log, stderr=subprocess.STDOUT,
                                    creationflags=subprocess.CREATE_NO_WINDOW)
            try:
                startup_limit = time.monotonic() + 180
                while True:
                    remaining(deadline)
                    if proc.poll() is not None or time.monotonic() >= startup_limit:
                        raise RuntimeError("ComfyUI 未能启动，见 backend.log")
                    try:
                        if json_api(base, "/system_stats", deadline).get("system"):
                            break
                    except (OSError, TimeoutError):
                        pass
                    time.sleep(min(0.5, remaining(deadline)))
                reply = json_api(base, "/prompt", deadline, {"client_id": job.name, "prompt": graph if graph is not None else workflow(spec)})
                pid = reply["prompt_id"]
                update("rendering", prompt_id=pid)
                while proc.poll() is None:
                    item = json_api(base, "/history/" + pid, deadline).get(pid)
                    if item:
                        if item["status"]["status_str"] != "success":
                            errors = [v.get("exception_message", "") for k, v in item["status"]["messages"]
                                      if k == "execution_error"]
                            raise RuntimeError("; ".join(errors) or "ComfyUI 执行失败，见 backend.log")
                        return save_image(base, item["outputs"]["7"]["images"][0], Path(spec["output"]), deadline)
                    time.sleep(min(0.7, remaining(deadline)))
                raise RuntimeError("渲染超时或后端已退出")
            finally:
                if proc.poll() is None:
                    killed = subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   creationflags=subprocess.CREATE_NO_WINDOW)
                    if killed.returncode and proc.poll() is None:
                        proc.kill()
                proc.wait(timeout=20)


def run_job(job):
    spec = read_json(job / "request.json")

    def update(state, **extra):
        write_json(job / "status.json", {"job": job.name, "state": state, "seed": spec["seed"],
                                         "log": str(job / "backend.log"), **extra})

    try:
        deadline = spec.get("deadline", time.monotonic() + JOB_SECONDS)
        with gpu_slot(deadline):
            update("starting")
            result = execute(job, spec, update, deadline)
            update("done", **result)
    except Exception as exc:
        if isinstance(exc, JobTimeout) or time.monotonic() >= deadline:
            update("failed", code="TIMEOUT", error="任务从提交起超过 10 分钟")
        else:
            update("failed", error=str(exc))
        return 1
    return 0


def submit(args):
    deadline = time.monotonic() + JOB_SECONDS
    installation()
    job = ROOT / uuid.uuid4().hex
    output = Path(args.output).resolve() if args.output else job / "result.png"
    if output.suffix.lower() != ".png" or output.exists():
        raise ValueError("输出须为尚不存在的 .png 文件")
    if not args.prompt.strip() or not 0 < args.strength <= 1 or not 0 <= args.seed < 2**63:
        raise ValueError("提示词须非空，strength 范围 (0,1]，seed 范围 [0,2^63)")
    source = Path(args.input).resolve() if args.input else None
    if source and (not source.is_file() or source.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}):
        raise ValueError("输入须为现有 PNG、JPEG 或 WebP")
    job.mkdir(parents=True)
    image = "source" + source.suffix.lower() if source else None
    if source:
        shutil.copyfile(source, job / image)
    write_json(job / "request.json", {"prompt": args.prompt, "seed": args.seed, "size": args.size,
                                      "strength": args.strength, "input": image, "output": str(output),
                                      "deadline": deadline})
    queued = {"job": job.name, "state": "queued", "output": str(output)}
    write_json(job / "status.json", queued)
    with (job / "worker.log").open("w") as log:
        worker = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "_run", job.name],
                                  stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                                  creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP)
    (job / "worker.pid").write_text(str(worker.pid))
    return queued


def status(job):
    row = read_json(job / "status.json")
    pid = job / "worker.pid"
    if row["state"] not in {"done", "failed"} and pid.exists():
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.restype = ctypes.c_void_p
        handle = kernel.OpenProcess(0x100000, False, int(pid.read_text()))
        if handle:
            try:
                stopped = kernel.WaitForSingleObject(ctypes.c_void_p(handle), 0) == 0
            finally:
                kernel.CloseHandle(ctypes.c_void_p(handle))
        else:
            stopped = ctypes.get_last_error() == 87
        if stopped:
            row = read_json(job / "status.json")
            if row["state"] not in {"done", "failed"}:
                row.update(state="failed", error="后台进程已中断，见 " + str(job / "worker.log"))
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    add = commands.add_parser("submit")
    add.add_argument("--prompt", required=True)
    add.add_argument("--input", help="提供底图时执行图生图")
    add.add_argument("--output", help="新 PNG 的目标路径，省略时保存在任务目录")
    add.add_argument("--strength", type=float, default=0.55)
    add.add_argument("--seed", type=int, default=secrets.randbits(63))
    add.add_argument("--size", type=int, choices=(512, 768, 1024), default=512)
    for name in ("status", "wait", "_run"):
        commands.add_parser(name).add_argument("job", type=uuid.UUID)
    args = parser.parse_args()
    if args.command == "submit":
        row = submit(args)
    else:
        job = ROOT / args.job.hex
        if args.command == "_run":
            return run_job(job)
        row = status(job)
        while args.command == "wait" and row["state"] not in {"done", "failed"}:
            time.sleep(1)
            row = status(job)
    print(json.dumps(row))
    return int(row["state"] == "failed")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, RuntimeError) as exc:
        print(json.dumps({"state": "failed", "error": str(exc)}))
        sys.exit(1)
