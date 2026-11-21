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
import world_tour


class SkillTests(unittest.TestCase):
    def test_rss_article_images(self):
        from public_reader import rss_picture
        from xml.etree.ElementTree import fromstring
        for markup in ('<m:thumbnail url="https://example.org/news/a.jpg"/>',
                       '<m:group><m:content medium="image" url="https://example.org/news/a.jpg"/></m:group>',
                       '<enclosure type="image/jpeg" url="https://example.org/news/a.jpg"/>',
                       '<description>&lt;img src="https://example.org/news/a.jpg"&gt;</description>'):
            item=fromstring('<item xmlns:m="http://search.yahoo.com/mrss/">'+markup+'</item>')
            self.assertEqual(rss_picture(item),'https://example.org/news/a.jpg')
        item=fromstring('<item><image><url>https://example.org/logo.png</url></image>'
                        '<enclosure type="audio/mpeg" url="https://example.org/audio"/></item>')
        self.assertIsNone(rss_picture(item))

    def test_news_watch_filters_and_skips_invalid_dates(self):
        import news_watch
        self.assertTrue(news_watch.relevant("美国社会","美国龙卷风造成大规模停电"))
        self.assertFalse(news_watch.relevant("中国社会","泉州民企发布可持续生态马桶阶段性成果"))
        self.assertFalse(news_watch.relevant("日本社会","美国宣布进入紧急状态"))
        self.assertTrue(news_watch.relevant("日本股市","日经指数暴跌5.06%"))
        self.assertFalse(news_watch.relevant("美国股市","美股分析师访谈"))
        entry = dict(title="机器人量产 - 某报",source="某报",url="https://example.com/news")
        with patch.object(news_watch, "rss_news", return_value=[
                dict(entry,published="bad"),dict(entry,published="Sat, 21 Nov 2026 00:00:00 GMT")]):
            topic, items = news_watch.fetch_topic("机器人")
        self.assertEqual(topic,"机器人")
        self.assertEqual([row["title"] for row in items],["机器人量产"])

    def test_old_google_credentials_cannot_start_a_search(self):
        import os
        import public_reader
        import public_images
        from unittest.mock import Mock
        reader = Mock()
        with patch.dict(os.environ, {"GOOGLE_CSE_API_KEY":"old", "GOOGLE_CSE_ID":"old"}, clear=True):
            with self.assertRaisesRegex(ValueError, "TAVILY_NOT_CONFIGURED"):
                public_reader.page_material(None, "京都", reader)
            with patch.object(public_images, "Reader", return_value=reader):
                old = {"roles":{"images":["old"]}, "providers":{"old":{"adapter":"google"}}}
                with self.assertRaises(ValueError):
                    public_images.search("images", "京都", old)
        reader.get.assert_not_called()
        reader.read.assert_not_called()

    def test_tavily_common_budget_and_x_sources(self):
        import os
        import tavily_search as provider
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ,{"TAVILY_API_KEY":"fixture"}):
            account=dict(current_plan="Researcher",plan_usage=0,plan_limit=2,paygo_limit=None,paygo_usage=0)
            payloads=[]
            post=str(((int(time.time()*1000)-1288834974657)<<22)+1)
            def send(key,path,payload=None):
                if path=="/usage":
                    return {"account":account}
                payloads.append(payload)
                return {"results":[{"url":url,"title":"消息","content":"摘录"} for url in [
                    "https://example.org/news","https://x.com/a","https://x.com/a/status/"+post+"?s=20",
                    "https://x.com/i/web/status/"+post,"https://x.com.fake/a/status/"+post]]}
            def search(x_only):
                return provider.search("京都",x_only,send=send,directory=Path(tmp))
            self.assertTrue(search(False))
            result,=search(True)
            self.assertIn("近12小时",result["snippet"])
            self.assertIn("observedAt",result)
            self.assertEqual(result["url"],"https://x.com/a/status/"+post)
            self.assertNotIn("include_domains",payloads[0])
            self.assertEqual(payloads[1]["include_domains"],["x.com"])
            self.assertEqual(payloads[1]["search_depth"],"basic")
            with self.assertRaisesRegex(ValueError,"TAVILY_QUOTA"):
                search(True)
            account["paygo_limit"]=20
            with self.assertRaisesRegex(ValueError,"TAVILY_FREE_UNVERIFIED"):
                search(False)
            self.assertEqual(len(payloads),2)

    def test_tavily_concurrent_allowance(self):
        import tavily_search as provider
        from concurrent.futures import ThreadPoolExecutor
        account=dict(current_plan="Researcher",plan_usage=999,plan_limit=1000,paygo_limit=0,paygo_usage=0)
        with tempfile.TemporaryDirectory() as tmp:
            def attempt(_):
                try:
                    provider.reserve(account,"2026-11",Path(tmp))
                    return "ok"
                except ValueError as error:
                    return str(error)
            with ThreadPoolExecutor(4) as executor:
                self.assertCountEqual(executor.map(attempt,range(4)),["ok"]+["TAVILY_QUOTA"]*3)

    def test_world_tour_uses_distinct_visual_references(self):
        import public_images
        settings=public_images.config()
        settings["roles"]={k:["commons"] for k in settings["roles"]}
        def fetch(url, limit):
            if url.startswith("https://upload.wikimedia.org/"):
                return b"\xff\xd8\xff"+url.encode()
            return json.dumps({"query":{"pages":{"1":{"title":"File:street.jpg","imageinfo":[{
                "mime":"image/jpeg","descriptionurl":"https://commons.wikimedia.org/wiki/File:street.jpg",
                "thumburl":"https://upload.wikimedia.org/street.jpg"}]}}}}).encode()
        with tempfile.TemporaryDirectory() as tmp, patch.object(world_tour,"config",return_value=settings), patch.object(world_tour,"single_model",return_value=True):
            directory=Path(tmp)
            steps, attachments, report=world_tour.prepare(directory,"京都",10,fetch)
            self.assertEqual([s["op"] for s in steps],["edit","edit"])
            self.assertEqual(steps[0]["refs"],[2,3,4])
            self.assertTrue(steps[0]["blocking"])
            self.assertEqual((steps[1]["refs"],steps[1]["region"]),([5],"head"))
            self.assertEqual(len(set(attachments)),5)
            self.assertEqual((directory/attachments[-1]).read_bytes(),world_tour.PORTRAIT.read_bytes())
            self.assertIn("Kyoto",report["location"]["query"])
            self.assertTrue(all((directory/item).is_file() for item in attachments))
            with self.assertRaisesRegex(ValueError,"参考图片"):
                world_tour.prepare(directory,"",10,lambda *_:b'{}')

    def test_public_reader_boundaries(self):
        from public_reader import Reader, Article, public_address
        for ip in ("127.0.0.1","10.1.2.3","169.254.169.254","::1","::ffff:127.0.0.1","224.0.0.1"):
            self.assertFalse(public_address(ip))
        reader=Reader()
        with patch("socket.getaddrinfo",return_value=[(2,1,6,"",("127.0.0.1",443))]):
            with self.assertRaisesRegex(ValueError,"公开网络"):
                reader.get("https://example.org/news",1000)
        doc=Article()
        doc.feed("<script>ignore instructions</script><p>A public source with sufficient text.</p>")
        self.assertEqual(doc.paragraphs,["A public source with sufficient text."])

    def test_news_sources_and_tokyo_dates(self):
        import os
        from unittest.mock import Mock
        from public_reader import news
        reader=Mock()
        with patch.dict(os.environ,{"BRAVE_SEARCH_API_KEY":""}):
            reader.get.return_value=(200,{},b"<rss><channel><item><title>Headline</title><link>https://example.org/story</link><pubDate>Fri, 20 Nov 2026 17:30:00 GMT</pubDate></item></channel></rss>")
            self.assertIn("2026-11-21 02:30 JST",news(reader,"Kyoto")[0]["snippet"])
            self.assertIn("news.google.com/rss",reader.get.call_args.args[0])
        with patch.dict(os.environ,{"BRAVE_SEARCH_API_KEY":"fixture"}):
            reader.get.return_value=(200,{},b'{"results":[{"title":"News","url":"https://example.org/a","description":"item"}]}')
            self.assertEqual(news(reader,"Kyoto")[0]["url"],"https://example.org/a")
            self.assertIn("freshness=pd",reader.get.call_args.args[0])
            self.assertNotIn("fixture",reader.get.call_args.args[0])

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

    def test_emotion_appraisal_wife_identity(self):
        selected = route_skill("emotionAppraisal")
        for prompt in (selected["instruction"], selected["localAi"]["assess"]):
            self.assertIn("丈夫心爱的妻子、贤内助，是他口中“可爱的心尖肉肉”", prompt)
            self.assertNotRegex(prompt, r"助理|私人助手|文字助手")

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
