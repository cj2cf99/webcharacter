"""验证技能发布、历史查找、菜单覆盖及图像任务边界，不使用真实业务库。"""
import json
from datetime import datetime, timedelta, timezone
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
            reader.reset_mock()
            self.assertEqual(news(reader,"Kyoto")[0]["url"],"https://example.org/story")
            reader.get.assert_called_once()
            self.assertIn("news.google.com/rss",reader.get.call_args.args[0])
            self.assertNotIn("fixture",str(reader.get.call_args))

    def test_autonomous_editorials_use_rss_and_exclude_straight_news(self):
        from public_reader import news
        from unittest.mock import Mock
        from urllib.parse import parse_qs, urlsplit
        reader = Mock()
        reader.get.return_value = (200, {}, """<rss><channel>
          <item><title>Officials welcomed the editorial</title><link>https://news.example.org/report</link></item>
          <item><title>New rules - Opinion</title><source>Opinion</source><link>https://news.example.org/publisher</link></item>
          <item><title>【社論】能源轉型</title><source>例報</source><link>https://news.example.org/editorial</link>
          <pubDate>Fri, 20 Nov 2026 17:30:00 GMT</pubDate></item></channel></rss>""".encode())
        with patch.dict("os.environ", {"BRAVE_SEARCH_API_KEY": "fixture"}):
            sources = news(reader, "能源轉型", editorials=True)
        self.assertEqual([s["url"] for s in sources], ["https://news.example.org/editorial"])
        self.assertIn("2026-11-21 02:30 JST", sources[0]["snippet"])
        request = urlsplit(reader.get.call_args.args[0])
        self.assertEqual(request.hostname, "news.google.com")
        self.assertIn("when:3d", parse_qs(request.query)["q"][0])

    def test_autonomous_tavily_checks_shared_free_quota_and_keeps_only_x_posts(self):
        import tavily_search
        from search_budget import MonthlyBudgetUnavailable
        seen = []
        used = 0
        def send(key, path, body=None):
            seen.append((path, body))
            if path == "/usage":
                return {"account": {"current_plan": "Researcher", "paygo_limit": 0, "paygo_usage": 0, "plan_limit": 1000, "plan_usage": used}}
            return {"results": [{"title": "帖", "url": "https://x.com/example/status/123", "content": "公开讨论"},
                                {"title": "重复帖", "url": "https://www.x.com/example/status/123"},
                                {"title": "外站", "url": "https://example.org/"}]}
        with tempfile.TemporaryDirectory() as tmp, patch.dict("os.environ", {"TAVILY_API_KEY": "fixture"}):
            options = dict(send=send, directory=Path(tmp), now=datetime(2026, 11, 21, tzinfo=timezone.utc))
            posts = tavily_search.search("公开话题", x_only=True, **options)
            self.assertEqual([r["url"] for r in posts], ["https://x.com/example/status/123"])
            self.assertIn("JST", posts[0]["snippet"])
            self.assertEqual(seen[1][1]["include_domains"], ["x.com"])
            tavily_search.search("另一个公开主题", **options)
            self.assertNotIn("include_domains", seen[3][1])
            self.assertEqual(seen[3][1]["max_results"], 10)
            used = 800
            with self.assertRaisesRegex(MonthlyBudgetUnavailable, "SEARCH_MONTHLY_PACED"):
                tavily_search.search("第三个公开主题", **options)
            self.assertEqual([p for p, _ in seen].count("/search"), 2)

    def test_autonomous_images_use_commons_without_touching_monthly_quota(self):
        from public_images import initiative_images
        from unittest.mock import Mock
        reader = Mock()
        def get(url, limit):
            self.assertTrue(url.startswith("https://commons.wikimedia.org/w/api.php?"))
            content = {str(i): {"title": f"File:bird-{i}.jpg", "index": i, "imageinfo": [{"mime": "image/jpeg",
                       "descriptionurl": f"https://commons.wikimedia.org/wiki/File:bird-{i}.jpg",
                       "thumburl": f"https://upload.wikimedia.org/bird-{i}.jpg"}]} for i in range(8)}
            return 200, {}, json.dumps({"query": {"pages": content}}).encode()
        reader.get.side_effect = get
        with patch.dict("os.environ", {"SERPAPI_API_KEY": "fixture"}):
            sources = initiative_images("birds", reader)
        self.assertEqual(len(sources), 5)
        self.assertEqual(sources[0]["provider"], "Wikimedia Commons")
        self.assertEqual(reader.get.call_count, 1)

    def test_daily_search_prefers_langsearch_for_web_and_x_without_monthly_requests(self):
        import public_search_sources as search
        from unittest.mock import Mock
        now = datetime(2026, 11, 21, tzinfo=timezone.utc)
        def url(at):
            post = (int(at.timestamp() * 1000) - 1288834974657) << 22
            return f"https://x.com/example/status/{post}"
        rows = [dict(name="正常来源", url=url(now-timedelta(days=2))), dict(name="旧帖", url=url(now-timedelta(days=9))),
                dict(name="非 X 来源", url="https://example.org/post")]
        send = Mock(return_value={"code": 200, "data": {"webPages": {"value": rows}}})
        with patch.dict("os.environ", {"LANGSEARCH_API_KEY": "fixture", "WEIR_API_KEY": "fixture"}):
            hits = search.langsearch("公开话题", "x", send=send, now=now)
            self.assertEqual([s["title"] for s in hits], ["正常来源"])
            self.assertEqual(send.call_args.args[3]["includeDomains"], ["x.com"])
            self.assertEqual(send.call_args.args[3]["freshness"], "oneWeek")
            with patch.object(search, "langsearch", return_value=hits), patch.object(search, "weir_posts") as weir, \
                    patch.object(search.tavily_search, "search") as tavily:
                self.assertEqual(search.lookup("公开话题", "x"), hits)
                self.assertEqual(search.lookup("公开话题", "web"), hits)
                weir.assert_not_called()
                tavily.assert_not_called()

    def test_monthly_fallback_stops_once_a_monthly_query_is_sent(self):
        import public_search_sources as search
        from search_budget import MonthlyBudgetUnavailable
        with patch.dict("os.environ", {"WEIR_API_KEY": "fixture", "TAVILY_API_KEY": "fixture"}), \
                patch.object(search, "langsearch", side_effect=ValueError("SEARCH_HTTP_429")), \
                patch.object(search, "weir_posts", side_effect=MonthlyBudgetUnavailable("SEARCH_MONTHLY_PACED")) as weir, \
                patch.object(search.tavily_search, "search", return_value=[{"provider": "Tavily"}]) as tavily:
            self.assertEqual(search.lookup("公开话题", "x"), [{"provider": "Tavily"}])
            tavily.assert_called_once_with("公开话题", x_only=True)
            tavily.reset_mock()
            weir.side_effect = None
            weir.return_value = []
            self.assertEqual(search.lookup("公开话题", "x"), [])
            weir.side_effect = TimeoutError()
            with self.assertRaises(TimeoutError):
                search.lookup("公开话题", "x")
            tavily.assert_not_called()

    def test_weir_budget_reduces_page_size_and_keeps_tokyo_dates(self):
        from public_search_sources import weir_posts
        from search_budget import MonthlyBudgetUnavailable
        from unittest.mock import Mock
        now = datetime(2026, 11, 21, tzinfo=timezone.utc)
        free = {"granted": 5000, "remaining": 1003, "resetsAt": "2026-12-01T00:00:00Z"}
        credit = {"spendingPaused": False, "balance": 1003, "available": 1003, "freeGrant": free}
        def send(host, key, path, body=None):
            return {"data": credit} if path.endswith("/usage") else {"data": [{"text": "新帖", "url": "https://x.com/example/status/123",
                                                                              "createdAt": "2026-11-20T17:30:00Z"}]}
        with tempfile.TemporaryDirectory() as tmp, patch.dict("os.environ", {"WEIR_API_KEY": "fixture"}):
            transport = Mock(side_effect=send)
            options = dict(send=transport, directory=Path(tmp), now=now)
            posts = weir_posts("极光", **options)
            self.assertIn("2026-11-21 02:30 JST", posts[0]["snippet"])
            self.assertEqual(transport.call_args.args[3]["limit"], 1)
            with self.assertRaisesRegex(MonthlyBudgetUnavailable, "SEARCH_MONTHLY_PACED"):
                weir_posts("极光", **options)
            credit["balance"] += 100
            with self.assertRaisesRegex(MonthlyBudgetUnavailable, "WEIR_FREE_UNVERIFIED"):
                weir_posts("极光", **options)
            self.assertEqual([row.args[2] for row in transport.call_args_list].count("/v1/x/search"), 1)

    def test_daily_reservations_are_atomic_and_reset_while_holding_monthly_reserve(self):
        from concurrent.futures import ThreadPoolExecutor
        from search_budget import MonthlyBudgetUnavailable, reserve_monthly
        now = datetime(2026, 11, 1, 23, 59, tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            def claim(_):
                try:
                    return reserve_monthly("serpapi", 250, 250, directory=directory, now=now)
                except MonthlyBudgetUnavailable:
                    return 0
            with ThreadPoolExecutor(max_workers=4) as pool:
                self.assertEqual(sum(pool.map(claim, range(12))), 6)
            self.assertEqual(reserve_monthly("serpapi", 250, 244, directory=directory, now=now+timedelta(minutes=1)), 1)
            with self.assertRaisesRegex(MonthlyBudgetUnavailable, "SEARCH_MONTHLY_PACED"):
                reserve_monthly("serpapi", 250, 50, directory=directory, now=now+timedelta(days=28))

    def test_serpapi_checks_hard_free_plan_and_budget_before_using_monthly_search(self):
        from public_images import serp_results
        from search_budget import MonthlyBudgetUnavailable
        from unittest.mock import Mock
        now = datetime(2026, 11, 21, tzinfo=timezone.utc)
        account = {"plan_name": "Free Plan", "plan_monthly_price": 0, "searches_per_month": 250,
                   "plan_searches_left": 50, "extra_credits": 0}
        def fetch(url, limit):
            return (200, {}, json.dumps(account).encode()) if "account.json" in url else (200, {}, b'{"images_results":[{}]}')
        reader = Mock()
        reader.get.side_effect = fetch
        with tempfile.TemporaryDirectory() as tmp, patch.dict("os.environ", {"SERPAPI_API_KEY": "fixture"}):
            options = dict(directory=Path(tmp), now=now)
            with self.assertRaisesRegex(MonthlyBudgetUnavailable, "SEARCH_MONTHLY_PACED"):
                serp_results("birds", reader, **options)
            self.assertEqual(reader.get.call_count, 1)
            account["plan_searches_left"] = 250
            self.assertEqual(serp_results("birds", reader, **options), [{}])
            self.assertEqual(reader.get.call_count, 3)

    def test_tavily_existing_monthly_reservations_are_preserved(self):
        import sqlite3
        from contextlib import closing
        from search_budget import MonthlyBudgetUnavailable, reserve_monthly
        now = datetime(2026, 11, 21, tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            with closing(sqlite3.connect(directory / "tavily-budget.sqlite3")) as db, db:
                db.execute("CREATE TABLE monthly (month TEXT PRIMARY KEY, used INTEGER NOT NULL)")
                db.execute("INSERT INTO monthly VALUES ('2026-11', 800)")
            with self.assertRaisesRegex(MonthlyBudgetUnavailable, "SEARCH_MONTHLY_PACED"):
                reserve_monthly("tavily", 1000, 1000, directory=directory, now=now)
            self.assertEqual(reserve_monthly("tavily", 1000, 1000, directory=directory, now=now+timedelta(days=11)), 1)

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
