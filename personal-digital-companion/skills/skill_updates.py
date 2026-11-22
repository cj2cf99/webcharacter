"""本机技能总纲、可编辑草稿及已发布版本。"""
import argparse
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile

ROUTER = "feiyue-interaction"
TRANSCRIPTION = "conversation-transcription"
ID = re.compile(r"[a-z][a-z0-9-]{0,63}")
VERSION = re.compile(r"[1-9][0-9]*\.[0-9]")
DEFAULT_STEPS = [{"run": "organize"}, {"run": "classify"}]
LOCKED = {"comfy-image-workflows"}
FRONTMATTER = re.compile(r"\A---\n(.*?)\n---\n(.+)\Z", re.S)


def markdown_body(text):
    match = FRONTMATTER.fullmatch(text.replace("\r\n", "\n").lstrip("\ufeff"))
    if not match or not match[2].strip():
        raise ValueError("SKILL.md 缺少头部或正文")
    return match[2].strip()


def read_json(path, default=None):
    try:
        with path.open("rb") as stream:
            raw = stream.read(256 * 1024 + 1)
    except FileNotFoundError:
        if default is not None:
            return default
        raise
    if len(raw) > 256 * 1024:
        raise ValueError("技能 JSON 超过 256 KiB")
    return json.loads(raw.decode("utf-8-sig"))


def write_json(path, value):
    raw = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if len(raw) > 256 * 1024:
        raise ValueError("技能 JSON 超过 256 KiB")
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temp = Path(stream.name)
    try:
        temp.write_bytes(raw)
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


def fingerprint(data):
    raw = json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


@contextmanager
def publish_lock(path):
    import msvcrt
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as lock:
        lock.seek(0)
        msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
        try:
            yield
        finally:
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)


def editable_prompts(folder):
    data = read_json(folder / "local-ai.json", {})
    return {key: value for key, value in data.items() if isinstance(value, str) and key != "profile"}


def capability_entries(data, known=None):
    fields = {"name", "does", "call", "examples"}
    def short_text(value):
        return isinstance(value, str) and bool(value.strip()) and len(value) <= 240
    if (not isinstance(data, dict) or any(not ID.fullmatch(key) for key in data)
            or known is not None and not data.keys() <= known):
        raise ValueError("能力目录只能描述已登记的功能")
    for entry in data.values():
        if (not isinstance(entry, dict) or set(entry) != fields
                or not all(short_text(entry[key]) for key in ("name", "does", "call"))
                or not isinstance(entry["examples"], list) or not 1 <= len(entry["examples"]) <= 3
                or not all(short_text(value) for value in entry["examples"])):
            raise ValueError("每项能力须有名称、用途、调用方式和一至三个简短示例")
    return data


def installed_capabilities(bundled):
    declared = capability_entries(read_json(bundled / ROUTER / "capabilities.json"))
    return {slot: entry for slot, entry in declared.items()
            if (bundled / slot / "source" / "SKILL.md").is_file()}


def validate_content(slot, folder, data):
    body, prompts, workflow = (data[key] for key in ("body", "prompts", "workflow"))
    if not isinstance(body, str) or not body.strip() or len(body.encode("utf-8")) > 64 * 1024:
        raise ValueError("技能正文须为非空文字，最多 64 KiB")
    allowed = editable_prompts(folder)
    if (not isinstance(prompts, dict) or not prompts.keys() <= allowed.keys()
            or any(not isinstance(text, str) or not text.strip() or len(text) > 16000 for text in prompts.values())):
        raise ValueError("阶段提示须使用现有字段和非空文字，每项最多 16000 字")
    if slot == TRANSCRIPTION:
        steps = workflow.get("steps") if isinstance(workflow, dict) and set(workflow) == {"steps"} else None
        if (not isinstance(steps, list) or any(not isinstance(step, dict) for step in steps)
                or [step.get("run") for step in steps] not in (["organize", "classify"], ["organize", "classify", "review"])):
            raise ValueError("对话转录依次执行 organize、classify，可在最后加入 review")
        for step in steps:
            fields = {"run", "instruction", "when"} if step["run"] == "review" else {"run", "instruction"}
            instruction = step.get("instruction", "")
            if (not step.keys() <= fields or not isinstance(instruction, str) or len(instruction) > 1000
                    or step.get("when", "has-candidates") not in ("has-candidates", "has-missing-fields")):
                raise ValueError("步骤支持长度不超过 1000 字的 instruction，review 可设 when")
    elif workflow is not None:
        raise ValueError("此功能没有可配置的执行步骤")
    if slot == ROUTER:
        bundled = folder.parents[1] if folder.name == "source" else folder.parents[2]
        capability_entries(data["capabilities"], installed_capabilities(bundled).keys())
    elif data["capabilities"] is not None:
        raise ValueError("能力目录须由总纲维护")
    return data


class SkillUpdates:
    def __init__(self, profile, bundled):
        self.root = Path(profile).resolve() / "skills"
        self.bundled = bundled
        self.manifest = self.root / ROUTER / "active.json"
        self.warnings = []

    def routes(self):
        return read_json(self.bundled / ROUTER / "source" / "routes.json")

    def variant_dir(self, slot, variant):
        if (not isinstance(slot, str) or not ID.fullmatch(slot) or slot in LOCKED
                or not (self.bundled / slot / "source" / "SKILL.md").is_file()):
            raise ValueError("总纲未登记此可更新功能")
        if not isinstance(variant, str) or not ID.fullmatch(variant):
            raise ValueError("Skill 名只能是小写字母、数字及连字符")
        return self.root / slot / variant

    def active(self, strict=False):
        try:
            data = read_json(self.manifest, {})
            if not isinstance(data, dict):
                raise ValueError("无效的总纲版本表")
            return data
        except (OSError, ValueError):
            if strict:
                raise
            self.warnings.append("总纲版本表无法读取，已使用随附版本")
            return {}

    def export(self, slot, variant):
        target = self.variant_dir(slot, variant) / "source"
        bundled = self.bundled / slot / "source"
        if target.exists():
            raise ValueError("草稿已存在，请直接编辑")
        target.parent.mkdir(parents=True, exist_ok=True)
        temp = Path(tempfile.mkdtemp(dir=target.parent))
        try:
            raw = (bundled / "SKILL.md").read_text(encoding="utf-8")
            raw = re.sub(r"(?m)^name: .+$", f"name: {variant}-v@VERSION_ID@", raw, count=1)
            (temp / "SKILL.md").write_text(raw, encoding="utf-8")
            prompts = editable_prompts(bundled)
            if prompts:
                write_json(temp / "local-ai.json", prompts)
            if slot == TRANSCRIPTION:
                write_json(temp / "workflow.json", {"steps": DEFAULT_STEPS})
            if slot == ROUTER:
                write_json(temp / "capabilities.json", self.capabilities())
            temp.rename(target)
        finally:
            if temp.exists():
                shutil.rmtree(temp)
        return {"draft": str(target)}

    def draft(self, slot, variant):
        source = self.variant_dir(slot, variant) / "source"
        allowed = {"SKILL.md", "local-ai.json"} | ({"workflow.json"} if slot == TRANSCRIPTION else set())
        if slot == ROUTER:
            allowed.add("capabilities.json")
        if any(path.name not in allowed or not path.is_file() or path.is_symlink() for path in source.iterdir()):
            raise ValueError("草稿只接受当前功能支持的 Markdown 和 JSON")
        with (source / "SKILL.md").open("r", encoding="utf-8-sig") as stream:
            raw = stream.read(64 * 1024 + 1)
        return validate_content(slot, self.bundled / slot / "source", {
            "body": markdown_body(raw), "prompts": read_json(source / "local-ai.json", {}),
            "workflow": read_json(source / "workflow.json") if slot == TRANSCRIPTION else None,
            "capabilities": read_json(source / "capabilities.json", {}) if slot == ROUTER else None,
        })

    def snapshot(self, slot, ref, folder):
        if not isinstance(ref, dict) or set(ref) != {"variant", "version"}:
            raise ValueError("总纲中的 Skill 版本引用无效")
        variant, version = ref["variant"], ref["version"]
        if not isinstance(version, str) or not VERSION.fullmatch(version):
            raise ValueError("Skill 版本无效")
        path = self.variant_dir(slot, variant) / "versions" / (version + ".json")
        release = read_json(path)
        if not isinstance(release, dict) or set(release) != {"sha256", "content"}:
            raise ValueError("Skill 快照格式无效")
        data = release["content"]
        if fingerprint(data) != release["sha256"]:
            raise ValueError("Skill 快照内容已改变")
        if not isinstance(data, dict) or set(data) != {"body", "prompts", "workflow", "capabilities"}:
            raise ValueError("Skill 快照格式无效")
        return validate_content(slot, folder, data)

    def lookup(self, slot, folder, active):
        if slot not in active:
            return None
        ref = active[slot]
        try:
            data = self.snapshot(slot, ref, folder)
        except (OSError, ValueError):
            self.warnings.append(f"{slot} 的外置版本不可用，已使用随附版本")
            return None
        version = ref["version"]
        return {**data, "version": f'{ref["variant"]}@{version}',
                "body": data["body"].replace("@VERSION_ID@", version.replace(".", "-")).replace("@VERSION@", version)}

    def publish(self, slot, variant):
        directory = self.variant_dir(slot, variant) / "versions"
        with publish_lock(self.manifest.with_name(".publish.lock")):
            data = self.draft(slot, variant)
            active = self.active(strict=True)
            versions = [tuple(map(int, file.stem.split("."))) for file in directory.glob("*.json")
                        if VERSION.fullmatch(file.stem)]
            major, minor = max(versions, default=(0, 9))
            previous = f"{major}.{minor}"
            folder = self.bundled / slot / "source"
            try:
                prior = self.snapshot(slot, {"variant": variant, "version": previous}, folder) if versions else None
            except (OSError, ValueError):
                prior = None
            if prior == data:
                version = previous
            else:
                number = major * 10 + minor + 1
                version = f"{number // 10}.{number % 10}"
                write_json(directory / (version + ".json"), {"sha256": fingerprint(data), "content": data})
            active[slot] = ref = {"variant": variant, "version": version}
            write_json(self.manifest, active)
        return ref

    def activate(self, slot, variant=None, version=None):
        self.variant_dir(slot, variant or slot)
        with publish_lock(self.manifest.with_name(".publish.lock")):
            active = self.active(strict=True)
            if variant is None:
                active.pop(slot, None)
            else:
                ref = {"variant": variant, "version": version}
                self.snapshot(slot, ref, self.bundled / slot / "source")
                active[slot] = ref
            write_json(self.manifest, active)
        return {"slot": slot, "active": active.get(slot, "bundled")}

    def capabilities(self):
        return installed_capabilities(self.bundled)

    def directory(self):
        active = self.active()
        capabilities = self.capabilities()
        bound = {slot: self.lookup(slot, self.bundled / slot / "source", active) for slot in capabilities if slot not in LOCKED}
        router = bound.get(ROUTER)
        if router:
            capabilities.update(router["capabilities"])
        skills = []
        for slot, entry in capabilities.items():
            override = bound.get(slot)
            version = override["version"] if override else read_json(self.bundled / slot / "latest.json", {}).get("version")
            item = {"id": slot, **entry, "version": version, "source": "external" if override else "bundled"}
            if slot == TRANSCRIPTION:
                steps = override["workflow"]["steps"] if override else DEFAULT_STEPS
                item["workflow"] = {"entry": "对话交给本机整理", "steps": [
                    {key: step[key] for key in ("run", "when") if key in step} for step in steps
                ], "exit": "完成后交回结果，有草稿时等待用户确认"}
            skills.append(item)
        return {"router": ROUTER, "skills": skills, "warnings": self.warnings}


def run_cli(args, bundled):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", type=Path, default=bundled.parent / "output/desktop-profile")
    actions = parser.add_subparsers(dest="action", required=True)
    actions.add_parser("status")
    actions.add_parser("directory")
    for action in ("export", "check", "publish", "use", "reset"):
        command = actions.add_parser(action)
        command.add_argument("slot")
        if action in ("export", "check", "publish"):
            command.add_argument("variant", nargs="?")
        elif action == "use":
            command.add_argument("variant")
            command.add_argument("version")
    opts = parser.parse_args(args)
    store = SkillUpdates(opts.profile, bundled)
    if opts.action == "status":
        return {**store.directory(), "routes": store.routes()}
    if opts.action == "directory":
        return store.directory()
    slot = opts.slot
    if opts.action == "reset":
        return store.activate(slot)
    variant = opts.variant or slot
    if opts.action == "use":
        return store.activate(slot, variant, opts.version)
    if opts.action == "check":
        store.draft(slot, variant)
        return {"slot": slot, "variant": variant, "valid": True}
    return getattr(store, opts.action)(slot, variant)
