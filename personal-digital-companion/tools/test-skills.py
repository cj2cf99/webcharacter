"""验证技能发布、历史查找、菜单覆盖及图像任务边界，不使用真实业务库。"""
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from contextlib import nullcontext
import time
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "skills"), str(ROOT / "workflows/comfyui")]
from catalog import resolve_skill, route_skill
from image_chain import compile_plan, make_graph
import image_chain


class SkillTests(unittest.TestCase):
    def test_publication(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            stable = "image-task-chain"
            source = root / stable / "source"
            shutil.copytree(ROOT / "skills" / stable / "source", source)
            version, old = resolve_skill(stable, root=root)
            self.assertEqual(version, "1.0")
            before = (old / "SKILL.md").read_bytes()
            for i in range(1, 11):
                with (source / "SKILL.md").open("a", encoding="utf-8") as f:
                    f.write(f"\n更新 {i}")
                expected = f"{1+i//10}.{i%10}"
                self.assertEqual(resolve_skill(stable, root=root)[0], expected)
                self.assertEqual(resolve_skill(stable, root=root)[0], expected)
            self.assertEqual(resolve_skill(stable, "1.0", root)[1], old)
            self.assertEqual((old / "SKILL.md").read_bytes(), before)

    def test_coverage(self):
        menu = json.loads((ROOT / "desktop/menu-layout.json").read_bytes())
        def visit(items):
            for item in items:
                if isinstance(item, dict):
                    if "action" in item:
                        self.assertIn("instruction", route_skill(item["action"], "menu"))
                    visit(item.get("items", []))
        visit(menu)
        _, folder = resolve_skill("feiyue-interaction")
        for hint in json.loads((folder / "routes.json").read_bytes())["hints"]:
            self.assertIn(route_skill(hint)["skill"], {p.parent.name for p in (ROOT / "skills").glob("*/source")})

    def test_diary_template(self):
        selected = route_skill("diaryWriting")
        self.assertEqual(selected["skill"], "diary-writing")
        for action in ("writeDiary", "reviewLocalTasks"):
            self.assertEqual(route_skill(action, "menu"), selected)
        for section in ("你的日记", "花园部署", "当日消费", "基础情绪", "绯月私语"):
            self.assertIn(section, selected["content"])
        for stage in ("reviewAction", "reviewSource", "mood", "narrate", "summary", "follow"):
            self.assertTrue(selected["localAi"][stage].strip())

    def test_diary_audit(self):
        selected = route_skill("diaryAudit")
        self.assertEqual(selected["skill"], "diary-audit")
        self.assertIn("线上唯一主对象", selected["content"])
        for stage in ("extract", "compare", "verify", "keywords", "condense", "reply", "write"):
            self.assertTrue(selected["localAi"][stage].strip())

    def test_image_steps(self):
        text = "生成女孩，再换上图1的风衣，最后放大"
        steps = [{"op": op, "quote": quote, "refs": refs} for op, quote, refs in
                 [("generate", "生成女孩", []), ("edit", "换上图1的风衣", [1]), ("upscale", "放大", [])]]
        plan = compile_plan(text, steps, 1)
        self.assertEqual([s["base"] for s in plan], [None, "previous", "previous"])
        _, folder = resolve_skill("comfy-image-workflows")
        graph = make_graph(folder, plan[1], 123, ["base.png", "jacket.png"])
        self.assertEqual(graph["4"]["inputs"]["images.image_2"], ["12", 0])
        self.assertEqual(graph["12"]["inputs"]["image"], "jacket.png")
        ordinal = "用第三张图的围巾修改第一张图，保留表情"
        edit = compile_plan(ordinal, [{"op":"edit","quote":ordinal,"refs":[3]}], 3)[0]
        edit_graph = make_graph(folder, edit, 123, ["base.png", "scarf.png"])
        prompt = json.dumps(edit_graph, ensure_ascii=False)
        self.assertIn("用<image_2>的围巾修改<image_1>", prompt)
        for invalid in [[dict(steps[0], op="shell")], [dict(steps[0], path="x")],
                        [dict(steps[0], quote="额外添加")], [dict(steps[1], refs=[2])], steps[::-1]]:
            with self.assertRaises(ValueError):
                compile_plan(text, invalid, 1)
        with self.assertRaises(ValueError):
            compile_plan("放大", [steps[-1]], 0)
        quote = "把图1的外套换成图3的夹克"
        with self.assertRaisesRegex(ValueError, "原文"):
            compile_plan(quote, [{"op": "edit", "quote": quote, "refs": [2]}], 3)

    def test_mock_execution_receipts(self):
        original = "画一只海豹，然后换上图1的围巾，最后放大"
        steps = compile_plan(original, [
            {"op": "generate", "quote": "画一只海豹", "refs": []},
            {"op": "edit", "quote": "换上图1的围巾", "refs": [1]},
            {"op": "upscale", "quote": "放大", "refs": []},
        ], 1)
        version, _ = resolve_skill("comfy-image-workflows")
        for fail_at in (None, 2):
            with self.subTest(fail_at=fail_at), tempfile.TemporaryDirectory() as temp:
                job = Path(temp)
                backend = image_chain.backend
                backend.write_json(job / "status.json", {"completed": []})
                backend.write_json(job / "request.json", dict(steps=steps, seed=100,
                    workflowVersion=version, attachments=["ref.png"], deadline=time.monotonic()+60))
                (job / "ref.png").write_bytes(b"reference")
                seen = []
                def execute(stage, request, update, deadline, *, graph, inputs):
                    seen.append([p.read_bytes() for p in inputs.values()])
                    if len(seen) == fail_at:
                        raise RuntimeError("模拟编辑失败")
                    Path(request["output"]).write_bytes(stage.name.encode())
                    return {"output": request["output"], "width": 128, "height": 128}
                with patch.object(backend, "gpu_slot", return_value=nullcontext()), patch.object(backend, "execute", execute):
                    code = image_chain.run(job)
                receipt = backend.read_json(job / "status.json")
                self.assertEqual(seen[:2], [[], [b"step-01", b"reference"]])
                if fail_at:
                    self.assertEqual((code, receipt["state"], receipt["step"], receipt["error"]),
                                     (1, "failed", 2, "模拟编辑失败"))
                    self.assertEqual(len(receipt["completed"]), 1)
                else:
                    self.assertEqual((code, receipt["state"], seen[2]), (0, "done", [b"step-02"]))
                    self.assertEqual(Path(receipt["output"]).read_bytes(), b"step-03")


if __name__ == "__main__":
    unittest.main()
