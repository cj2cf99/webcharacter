"""以稳定 ID 查找 skill；内容更新时自动发布下一个十分位版本。"""
import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile
import uuid
import sys

ROOT = Path(__file__).resolve().parent


def resolve_skill(skill, version=None, root=ROOT):
    if not isinstance(skill, str) or not re.fullmatch(r"[a-z][a-z0-9-]*", skill):
        raise ValueError("skill 标识无效")
    base = root / skill
    def location(v):
        if not isinstance(v, str) or not re.fullmatch(r"[1-9][0-9]*\.[0-9]", v):
            raise ValueError("skill 版本无效")
        return base / "versions" / (skill + "-v" + v.replace(".", "-"))
    if version is not None:
        folder = location(version)
        if not (folder / "SKILL.md").is_file():
            raise ValueError("保存的 skill 版本不存在")
        return version, folder
    source = base / "source"
    if not (source / "SKILL.md").is_file():
        raise ValueError("未登记此 skill")
    import msvcrt
    with (base / ".publish.lock").open("a+b") as lock:
        lock.seek(0)
        msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
        try:
            files = {p.relative_to(source): p.read_bytes() for p in sorted(source.rglob("*")) if p.is_file()}
            digest = hashlib.sha256()
            for path, data in files.items():
                digest.update(path.as_posix().encode() + b"\0" + hashlib.sha256(data).digest())
            fingerprint = digest.hexdigest()
            pointer = base / "latest.json"
            latest = json.loads(pointer.read_bytes()) if pointer.exists() else {}
            if latest.get("sha256") == fingerprint:
                return resolve_skill(skill, latest["version"], root)
            major, minor = map(int, latest.get("version", "0.9").split("."))
            revision = major * 10 + minor + 1
            version = f"{revision // 10}.{revision % 10}"
            folder = location(version)
            folder.parent.mkdir(exist_ok=True)
            tmp = Path(tempfile.mkdtemp(dir=folder.parent))
            try:
                for path, data in files.items():
                    target = tmp / path
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if path.as_posix() == "SKILL.md":
                        data = data.replace(b"@VERSION_ID@", version.replace(".", "-").encode()).replace(b"@VERSION@", version.encode())
                    target.write_bytes(data)
                if folder.exists():
                    # 恢复在快照发布和更新指针之间中断的同一次更新。
                    if any((folder / path).read_bytes() != (tmp / path).read_bytes() for path in files) or set(files) != {p.relative_to(folder) for p in folder.rglob("*") if p.is_file()}:
                        raise ValueError("已有同版本快照与待发布内容冲突")
                else:
                    tmp.rename(folder)
                temp_pointer = pointer.with_suffix("." + uuid.uuid4().hex + ".tmp")
                temp_pointer.write_text(json.dumps({"skill": skill, "version": version, "sha256": fingerprint}, indent=2)+"\n", encoding="utf-8")
                temp_pointer.replace(pointer)
            finally:
                if tmp.exists():
                    shutil.rmtree(tmp)
            return version, folder
        finally:
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)


def child_skill(folder, purpose, version=None):
    links = json.loads((folder / "children.json").read_bytes())
    child = links[purpose]
    release, location = resolve_skill(child, version)
    return child, release, location


def route_skill(hint, group="hints"):
    root_version, folder = resolve_skill("feiyue-interaction")
    routes = json.loads((folder / "routes.json").read_bytes())
    skill = routes[group][hint]
    version, child = resolve_skill(skill)
    def body(path):
        return path.read_text(encoding="utf-8").split("---", 2)[2].strip()
    instruction = body(folder / "SKILL.md") + "\n\n" + body(child / "SKILL.md")
    selected = {"routerVersion": root_version, "skill": skill, "version": version, "content": body(child / "SKILL.md")}
    if skill in routes.get("workRedrafts", {}):
        selected["workRedrafts"] = routes["workRedrafts"][skill]
    if hint == "attachmentRegistration" and group == "hints":
        sub, sub_version, location = child_skill(child, "registration")
        selected["child"] = {"skill": sub, "version": sub_version}
        instruction += "\n\n" + body(location / "SKILL.md")
    local = child / "local-ai.json"
    if local.is_file():
        selected["localAi"] = json.loads(local.read_bytes())
    for key in ("schemas", "templates"):
        data_file = child / (key + ".json")
        if data_file.is_file():
            selected[key] = json.loads(data_file.read_bytes())
    return {**selected, "instruction": instruction}


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "list":
        print(json.dumps({p.parent.name: resolve_skill(p.parent.name)[0] for p in sorted(ROOT.glob("*/source"))}))
    else:
        print(json.dumps(route_skill(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "hints")))
