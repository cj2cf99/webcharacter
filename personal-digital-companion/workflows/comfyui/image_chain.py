"""绯月图像 skill 的宿主工具。模型只提供步骤，附件与版本由宿主绑定。"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import time
import uuid

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "tools"))
import comfy_job as backend
sys.path.insert(0, str(HERE.parents[1] / "skills"))
from catalog import resolve_skill


def now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def compile_plan(original, steps, count, has_base=False):
    if not isinstance(original, str) or not original.strip():
        raise ValueError("缺少用户原文")
    if not isinstance(steps, list) or not steps:
        raise ValueError("缺少图像操作")
    cursor = 0
    plan = []
    for i, step in enumerate(steps):
        if not isinstance(step, dict) or set(step) != {"op", "quote", "refs"}:
            raise ValueError("步骤只接受 op、quote、refs")
        op, quote, refs = step["op"], step["quote"], step["refs"]
        if op not in ("generate", "img2img", "edit", "upscale"):
            raise ValueError("工作流未登记此操作")
        position = original.find(quote, cursor) if isinstance(quote, str) else -1
        if not isinstance(quote, str) or not quote.strip() or position < 0:
            raise ValueError("每一步需要独立、可核对的用户原文")
        cursor = position + len(quote)
        if op == "generate" and i or op == "upscale" and i != len(steps)-1:
            raise ValueError("生成只能是首步，高清放大只能是末步")
        if not isinstance(refs, list) or any(type(x) is not int or not 1 <= x <= count for x in refs):
            raise ValueError("参考图编号超出宿主提供的附件")
        if len(set(refs)) != len(refs) or (refs and op != "edit") or len(refs) > 15:
            raise ValueError("只有定向编辑可使用互不重复的额外参考图，最多 15 张")
        base = None if op == "generate" else "previous" if i else "prior-result" if has_base else "attachment:1"
        if base == "attachment:1" and (not count or 1 in refs):
            raise ValueError("首步需要底图，额外参考图应从图 2 开始")
        plan.append({"op": op, "quote": quote, "refs": refs, "base": base})
    return plan


def make_graph(folder, step, seed, inputs):
    graph = backend.read_json(folder / "graphs" / (step["op"] + ".json"))
    prompt = step["quote"]
    if step["op"] == "edit":
        labels = ["<image_1> 为待编辑底图"]
        for index, attachment in enumerate(step["refs"], 2):
            key = str(10 + index)
            graph[key] = {"class_type": "LoadImage", "inputs": {"image": inputs[index-1]}}
            graph["4"]["inputs"][f"images.image_{index}"] = [key, 0]
            labels.append(f"用户的图{attachment}为 <image_{index}>")
        prompt = "；".join(labels) + "。" + prompt
    values = {"$prompt": prompt, "$seed": seed, "$base": inputs[0] if inputs else None}
    for node in graph.values():
        for key, value in node["inputs"].items():
            if isinstance(value, str) and value in values:
                node["inputs"][key] = values[value]
    return graph


def run(job):
    spec = backend.read_json(job / "request.json")
    deadline = spec["deadline"]
    receipt = backend.read_json(job / "status.json")
    completed = receipt["completed"]
    def update(state, **fields):
        receipt.update(state=state, updated=now(), **fields)
        backend.write_json(job / "status.json", receipt)
    try:
        _, folder = resolve_skill("comfy-image-workflows", spec["workflowVersion"])
        with backend.gpu_slot(deadline):
            previous = None
            for index, step in enumerate(spec["steps"], 1):
                backend.remaining(deadline)
                stage = job / f"step-{index:02d}"
                stage.mkdir()
                inputs = []
                if step["base"]:
                    inputs.append(previous if index > 1 else job / (spec.get("baseFile") or spec["attachments"][0]))
                inputs.extend(job / spec["attachments"][n-1] for n in step["refs"])
                sources = {f"input-{i}{path.suffix}": path for i, path in enumerate(inputs, 1)}
                seed = spec["seed"] + index
                graph = make_graph(folder, step, seed, list(sources))
                target = stage / "result.png"
                started = now()
                update("starting", step=index, operation=step["op"], started=started, log=str(stage / "backend.log"))
                result = backend.execute(stage, {"output": str(target)}, update, deadline, graph=graph, inputs=sources)
                completed.append(dict(step=index, operation=step["op"], started=started, finished=now(), seed=seed, **result))
                previous = target
                update("running")
            update("done", **result)
        return 0
    except Exception as exc:
        timeout = isinstance(exc, backend.JobTimeout) or time.monotonic() >= deadline
        update("failed", code="TIMEOUT" if timeout else "IMAGE_STEP_FAILED", error=str(exc))
        return 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("describe")
    for command in ("check", "submit"):
        sub = commands.add_parser(command)
        sub.add_argument("--version")
        sub.add_argument("--workflow-version")
        sub.add_argument("--image", action="append", type=Path, default=[])
        sub.add_argument("--base", type=Path, help="对话中用户指明继续处理的已有结果")
    for command in ("status", "_run"):
        commands.add_parser(command).add_argument("job", type=uuid.UUID)
    args = parser.parse_args()
    if args.command == "describe":
        version, folder = resolve_skill("image-task-chain")
        workflow_version, _ = resolve_skill("comfy-image-workflows")
        row = {"version": version, "workflowVersion": workflow_version, "instruction": (folder / "SKILL.md").read_text(encoding="utf-8")}
    elif args.command in ("status", "_run"):
        job = backend.ROOT / args.job.hex
        if args.command == "_run":
            return run(job)
        row = backend.status(job)
    else:
        deadline = time.monotonic() + backend.JOB_SECONDS
        version, _ = resolve_skill("image-task-chain", args.version)
        workflow_version, _ = resolve_skill("comfy-image-workflows", args.workflow_version)
        data = json.loads(sys.stdin.buffer.read().decode("utf-8-sig"))
        if not isinstance(data, dict) or set(data) != {"original", "steps"}:
            raise ValueError("宿主须绑定用户原文，只接受 original 和 steps")
        plan = compile_plan(data["original"], data["steps"], len(args.image), bool(args.base))
        for path in [*args.image, *([args.base] if args.base else [])]:
            if not path.is_file() or path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
                raise ValueError("缺少可读取的本地 PNG、JPEG 或 WebP 附件")
        if args.command == "check":
            row = {"version": version, "workflowVersion": workflow_version, "steps": plan}
        else:
            backend.installation()
            job = backend.ROOT / uuid.uuid4().hex
            job.mkdir(parents=True)
            names = []
            base_file = None
            if args.base:
                base_file = "prior-result" + args.base.suffix.lower()
                shutil.copyfile(args.base, job / base_file)
            for i, path in enumerate(args.image, 1):
                name = f"attachment-{i}{path.suffix.lower()}"
                shutil.copyfile(path, job / name)
                names.append(name)
            backend.write_json(job / "request.json", dict(original=data["original"], version=version, workflowVersion=workflow_version, steps=plan,
                               attachments=names, baseFile=base_file, seed=secrets.randbits(62), deadline=deadline))
            row = dict(job=job.name, version=version, workflowVersion=workflow_version, state="queued", submitted=now(), completed=[])
            backend.write_json(job / "status.json", row)
            try:
                with (job / "worker.log").open("w") as log:
                    worker = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "_run", job.name],
                        stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                        creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP)
            except OSError as exc:
                row.update(state="failed", code="WORKER_START_FAILED", error=str(exc))
                backend.write_json(job / "status.json", row)
            else:
                (job / "worker.pid").write_text(str(worker.pid))
    print(json.dumps(row))
    return int(row.get("state") == "failed")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, RuntimeError) as exc:
        print(json.dumps({"state": "failed", "error": str(exc)}))
        sys.exit(1)
