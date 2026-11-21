"""绯月图像 skill 的宿主工具。模型只提供步骤，附件与版本由宿主绑定。"""
import argparse
from datetime import datetime, timezone
import json
import os
import re
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import time
import uuid
import world_tour

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "tools"))
import comfy_job as backend
sys.path.insert(0, str(HERE.parents[1] / "skills"))
from catalog import resolve_skill, child_skill

IMAGE_NUMBER = re.compile(r"图\s*(\d+|[零一二两三四五六七八九十]+)|第\s*(\d+|[零一二两三四五六七八九十]+)\s*张(?:图)?")


def image_number(match):
    label = (match[1] or match[2]).replace("两", "二")
    if label.isdecimal():
        return int(label)
    digits = "零一二三四五六七八九"
    if "十" not in label:
        return digits.find(label)
    first, last = label.split("十", 1)
    return (digits.find(first) if first else 1) * 10 + (digits.find(last) if last else 0)


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
        if op == "edit":
            mentioned = {image_number(m) for m in IMAGE_NUMBER.finditer(quote)}
            expected = mentioned - {1} if base == "attachment:1" else mentioned
            if mentioned and expected != set(refs):
                raise ValueError("参考图编号与用户原文不一致，请核对")
        if base == "attachment:1" and (not count or 1 in refs):
            raise ValueError("首步需要底图，额外参考图应从图 2 开始")
        plan.append({"op": op, "quote": quote, "refs": refs, "base": base})
    return plan


def make_graph(folder, step, seed, inputs):
    graph = backend.read_json(folder / "graphs" / (step["op"] + ".json"))
    prompt = step["quote"]
    if step["op"] == "edit":
        labels = ["<image_1> 为待编辑底图"]
        image_numbers = {1: 1} if step["base"] == "attachment:1" else {}
        for index, attachment in enumerate(step["refs"], 2):
            key = str(10 + index)
            graph[key] = {"class_type": "LoadImage", "inputs": {"image": inputs[index-1]}}
            graph["4"]["inputs"][f"images.image_{index}"] = [key, 0]
            labels.append(f"用户的图{attachment}为 <image_{index}>")
            image_numbers[attachment] = index
        guide_file = folder / "edit-guidance.json"
        if guide_file.is_file():
            prompt = IMAGE_NUMBER.sub(lambda match:
                f"<image_{image_numbers[image_number(match)]}>"
                if image_number(match) in image_numbers else match[0], prompt)
            if step["refs"] and re.search("衣|服装|外套|穿搭|夹克|裙", prompt) and not re.search("换人|替换.{0,4}人物", prompt):
                prompt = backend.read_json(guide_file)["garment"] + "\n" + prompt
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
        _, folder = resolve_skill(spec.get("workflowSkill","comfy-image-workflows"), spec["workflowVersion"])
        if "tourDestination" in spec:
            update("starting", operation="tour", step=0)
            steps, attachments, tour = world_tour.prepare(job, spec["tourDestination"], spec["seed"])
            spec.update(steps=steps, attachments=attachments, tour=tour)
            backend.write_json(job / "request.json", spec)
            update("starting", tour=tour)
        with backend.gpu_slot(deadline):
            previous = None
            for index, step in enumerate(spec["steps"], 1):
                backend.remaining(deadline)
                stage = job / f"step-{index:02d}"
                stage.mkdir()
                inputs = []
                if step["base"]:
                    inputs.append(previous if index > 1 else job / (spec.get("baseFile") or spec["attachments"][0]))
                local_head = step.get("region") == "head"
                if local_head:
                    app, runtime, _ = backend.installation()
                    def head_tool(mode):
                        proc = subprocess.run([str(runtime), "-X", "utf8", "-B", str(HERE / "tour_head.py"), mode,
                            str(previous), str(stage), str(app / "models/ultralytics/bbox/face_yolov8m.pt")],
                            cwd=stage, env={**os.environ, "YOLO_AUTOINSTALL": "false", "YOLO_OFFLINE": "true"},
                            capture_output=True, encoding="utf-8", errors="replace", timeout=backend.remaining(deadline),
                            creationflags=subprocess.CREATE_NO_WINDOW)
                        if proc.returncode:
                            raise ValueError((proc.stderr.strip().splitlines() or ["主角面部局部处理失败"])[-1][-300:])
                        return proc.stdout
                    head_tool("crop")
                    inputs[0] = stage / "context.png"
                inputs.extend(job / spec["attachments"][n-1] for n in step["refs"])
                if step.get("blocking"):
                    _, runtime, _ = backend.installation()
                    proc = subprocess.run([str(runtime), "-X", "utf8", "-B", str(HERE / "tour_block.py"),
                        str(inputs[0]), str(inputs[2]), str(stage)], creationflags=subprocess.CREATE_NO_WINDOW,
                        capture_output=True, encoding="utf-8", errors="replace", timeout=backend.remaining(deadline))
                    if proc.returncode:
                        raise ValueError((proc.stderr.strip().splitlines() or ["姿势分镜失败"])[-1][-300:])
                    inputs[0],inputs[2] = stage / "blocking.png",stage / "pose-card.png"
                sources = {f"input-{i}{path.suffix}": path for i, path in enumerate(inputs, 1)}
                seed = spec["seed"] + index
                graph = make_graph(folder, step, seed, list(sources))
                target = stage / "result.png"
                started = now()
                update("starting", step=index, operation=step["op"], started=started, log=str(stage / "backend.log"))
                render_target = stage / "head-edit.png" if local_head else target
                result = backend.execute(stage, {"output": str(render_target)}, update, deadline, graph=graph, inputs=sources)
                if local_head:
                    result.update(json.loads(head_tool("composite")), output=str(target))
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
    commands.add_parser("availability")
    for command in ("check", "submit"):
        sub = commands.add_parser(command)
        if command == "submit":
            sub.add_argument("--server-task-id", type=uuid.UUID)
            sub.add_argument("--tour", action="store_true")
        sub.add_argument("--version")
        sub.add_argument("--workflow-version")
        sub.add_argument("--image", action="append", type=Path, default=[])
        sub.add_argument("--base", type=Path, help="对话中用户指明继续处理的已有结果")
    for command in ("status", "_run"):
        commands.add_parser(command).add_argument("job", type=uuid.UUID)
    args = parser.parse_args()
    if args.command == "availability":
        backend.installation()
        row = {"available": True}
    elif args.command == "describe":
        version, folder = resolve_skill("image-task-chain")
        _, workflow_version, _ = child_skill(folder, "execute")
        row = {"version": version, "workflowVersion": workflow_version, "instruction": (folder / "SKILL.md").read_text(encoding="utf-8")}
    elif args.command in ("status", "_run"):
        job = backend.ROOT / args.job.hex
        if args.command == "_run":
            return run(job)
        row = backend.status(job)
    else:
        deadline = time.monotonic() + backend.JOB_SECONDS
        version, parent = resolve_skill("image-task-chain", args.version)
        if (parent / "children.json").exists():
            workflow_skill, workflow_version, _ = child_skill(parent, "execute", args.workflow_version)
        else:
            workflow_skill = "comfy-image-workflows"
            workflow_version, _ = resolve_skill(workflow_skill, args.workflow_version)
        data = json.loads(sys.stdin.buffer.read().decode("utf-8-sig"))
        tour = getattr(args, "tour", False)
        if tour:
            if (not isinstance(data, dict) or set(data) != {"original", "destination"} or
                    not isinstance(data["original"], str) or not data["original"].strip() or
                    not isinstance(data["destination"], str) or len(data["destination"]) > 80 or
                    args.image or args.base or args.server_task_id):
                raise ValueError("环球之旅接受桌宠指令和一个目的地")
            plan = []
        else:
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
            server_id = args.server_task_id
            if server_id and (args.image or args.base or len(plan) != 1 or plan[0]["op"] != "generate"):
                raise ValueError("服务器生图仅接收文字提示词")
            job = backend.ROOT / (server_id or uuid.uuid4()).hex
            try:
                job.mkdir(parents=True)
            except FileExistsError:
                if not server_id:
                    raise
                saved = backend.read_json(job / "request.json")
                if saved.get("serverTaskId") != str(server_id) or saved.get("original") != data["original"]:
                    raise ValueError("服务器任务绑定不一致")
                print(json.dumps(backend.status(job)))
                return 0
            names = []
            base_file = None
            if args.base:
                base_file = "prior-result" + args.base.suffix.lower()
                shutil.copyfile(args.base, job / base_file)
            for i, path in enumerate(args.image, 1):
                name = f"attachment-{i}{path.suffix.lower()}"
                shutil.copyfile(path, job / name)
                names.append(name)
            backend.write_json(job / "request.json", dict(original=data["original"], serverTaskId=str(server_id) if server_id else None, version=version, workflowSkill=workflow_skill, workflowVersion=workflow_version, steps=plan,
                               attachments=names, baseFile=base_file, seed=secrets.randbits(62), deadline=deadline,
                               **({"tourDestination": data["destination"]} if tour else {})))
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
