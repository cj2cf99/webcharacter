"""公开取材目录。配置决定每个用途的来源顺序，模型和渲染进程只收到本机文件。"""
import base64
import http.client
import itertools
import html
import json
import os
from pathlib import Path
import re
import sys
import uuid
import subprocess
from urllib.parse import urlencode, urlsplit
from public_reader import Reader, news, page_material, discover_images
import tavily_search

DEFAULT = Path(__file__).with_name("world-tour-sources.json")


def config():
    custom = Path(os.environ.get("LOCALAPPDATA", ".")) / "Feiyue/world-tour-sources.json"
    return json.loads((custom if custom.is_file() else DEFAULT).read_text(encoding="utf-8-sig"))


def plain(value):
    return html.unescape(re.sub(r"<[^>]*>", "", str(value or ""))).strip()[:300]


def safe(url, hosts):
    parts = urlsplit(url)
    return parts.scheme == "https" and parts.hostname in hosts and not parts.username and not parts.password and parts.port in (None, 443)


def read_url(url, limit):
    status,_,raw = Reader(seconds=12).get(url,limit)
    if status!=200:
        raise ValueError("公开目录返回 HTTP "+str(status))
    return raw


IMAGE_LIMIT = 5


def serp_images(query,reader):
    key=os.getenv("SERPAPI_API_KEY")
    if not key:
        return
    origin="https://serpapi.com/"
    status,_,raw=reader.get(origin+"account.json?"+urlencode({"api_key":key}),100_000)
    if status!=200:
        return
    account=json.loads(raw)
    if (account.get("plan_name")!="Free Plan" or account.get("plan_monthly_price")!=0 or
            not isinstance(account.get("plan_searches_left"),int) or account["plan_searches_left"]<1 or
            account.get("extra_credits",0)!=0):
        return
    status,_,raw=Reader(seconds=25,request_timeout=22).get(origin+"search.json?"+urlencode(dict(engine="google_images",q=query,api_key=key)),2_000_000)
    if status!=200:
        return
    for item in json.loads(raw).get("images_results",[])[:IMAGE_LIMIT]:
        page,image=item.get("link"),item.get("original")
        if page and image:
            yield (item.get("title"),page,image,"","授权见原页",[urlsplit(page).hostname],[urlsplit(image).hostname])


def catalogue(provider, query, fetch, thumbnail_width):
    adapter = provider["adapter"]
    if adapter == "commons":
        params = dict(action="query", generator="search", gsrsearch=query + " filetype:bitmap",
                      gsrnamespace=6, gsrlimit=IMAGE_LIMIT, prop="imageinfo", iiprop="url|mime|extmetadata",
                      iiextmetadatafilter="Artist|LicenseShortName", iiurlwidth=thumbnail_width, format="json")
        data = json.loads(fetch("https://commons.wikimedia.org/w/api.php?" + urlencode(params), 2_000_000))
        for row in sorted(data.get("query", {}).get("pages", {}).values(), key=lambda r: r.get("index", 100)):
            info = (row.get("imageinfo") or [{}])[0]
            if info.get("mime") not in ("image/jpeg", "image/png", "image/webp"):
                continue
            meta = info.get("extmetadata", {})
            yield (row["title"].removeprefix("File:"), info.get("descriptionurl"), info.get("thumburl", info.get("url")),
                   plain(meta.get("Artist", {}).get("value")), plain(meta.get("LicenseShortName", {}).get("value")),
                   ["commons.wikimedia.org"], ["upload.wikimedia.org", "thumb.wikimedia.org"])
    elif adapter == "openverse":
        params = dict(q=query, page_size=IMAGE_LIMIT, mature="false", **({"source": provider["source"]} if provider.get("source") else {}))
        data = json.loads(fetch("https://api.openverse.org/v1/images/?" + urlencode(params), 2_000_000))
        for item in data.get("results", []):
            yield (item["title"], "https://openverse.org/image/" + item["id"], item.get("thumbnail"),
                   item.get("creator"), item.get("license"), ["openverse.org"], ["api.openverse.org"])
    elif adapter == "sketchfab":
        params = dict(type="models", q=query, count=IMAGE_LIMIT, downloadable="true")
        data = json.loads(fetch("https://api.sketchfab.com/v3/search?" + urlencode(params), 2_000_000))
        for row in data.get("results", []):
            title = row.get("name", "")
            if not all(t in title.lower() for t in query.lower().split()) or re.search(
                    r"\b(pack|collection|nude|naked|bikini|swimsuit|zombie|doll|group)\b|t[- ]pose", title, re.I):
                continue
            pics = [p for p in row.get("thumbnails", {}).get("images", []) if 400 <= p.get("width", 0) <= 1920]
            if pics and re.fullmatch(r"[a-f0-9]{32}", row.get("uid", "")):
                yield (title, "https://sketchfab.com/models/" + row["uid"], min(pics, key=lambda p: abs(p["width"]-800)).get("url"),
                       row.get("user", {}).get("displayName"), "", ["sketchfab.com"], ["media.sketchfab.com"])
    elif adapter == "json":
        # Configured by the owner, with explicit field mappings and separate page/image hosts.
        endpoint = provider["endpoint"]
        if not safe(endpoint, provider["apiHosts"]):
            raise ValueError("图片目录地址与配置不一致")
        params = {**provider.get("parameters", {}), provider["queryParameter"]: query}
        data = json.loads(fetch(endpoint + ("&" if "?" in endpoint else "?") + urlencode(params), 2_000_000))
        def field(obj, path):
            for key in path.split(".") if path else ():
                obj = obj.get(key) if isinstance(obj, dict) else None
            return obj
        for row in (field(data, provider["results"]) or [])[:24]:
            yield (*[field(row, provider["fields"].get(k, "")) if k in provider["fields"] else "" for k in
                     ("title", "url", "image", "author", "license")], provider["pageHosts"], provider["imageHosts"])
    else:
        raise ValueError("未知取材接口 " + adapter)


def title_score(title, query):
    title = plain(title).casefold()
    terms = re.findall(r"[a-z0-9]+|[\u3400-\u9fff]+",query.casefold())
    return sum(len(term) for term in terms if term in title)


def search(role, query, settings, fetch=read_url, rng=None, page=None, validate=None, choose=None):
    errors = []
    seen = set()
    for source in settings["roles"][role]:
        if len(seen) >= IMAGE_LIMIT:
            break
        try:
            provider = settings["providers"][source]
            effective_query = provider.get("queries", {}).get(query, query)
            effective_query = provider.get("roleQueries", {}).get(role,"{query}").replace("{query}",effective_query)
            adapter = provider["adapter"]
            via_web = bool(page) or adapter in ("google", "web", "serpapi")
            if via_web:
                # 旧个人配置中的 google 来源沿用同一取材词，交给普通公开网页入口。
                reader = Reader(seconds=35)
                rows = serp_images(effective_query,reader) if adapter=="serpapi" and not page else discover_images(reader,effective_query,page)
            else:
                rows = catalogue(provider, effective_query, fetch, 320 if role == "images" else 960)
            candidates = []
            for row in itertools.islice(rows, IMAGE_LIMIT-len(seen)):
                title, origin, image, author, license_name, pages, images = row
                if not title or not origin or not image or not safe(origin, pages) or not safe(image, images):
                    continue
                if image not in seen:
                    seen.add(image)
                    candidates.append(row)
            if rng:
                rng.shuffle(candidates)
            candidates.sort(key=lambda row:title_score(row[0],effective_query),reverse=True)
            if choose and len(candidates)>1:
                index=choose([plain(row[0]) for row in candidates])
                if 0 <= index < len(candidates):
                    candidates.insert(0,candidates.pop(index))
            if via_web:
                # 选图可能等待本机模型，取原图有单独的读取时限。
                reader=Reader(seconds=30)
            for title, origin, image, author, license_name, pages, images in candidates:
                try:
                    if via_web:
                        if not reader.allowed(origin):
                            continue
                        image,raw = reader.read(image,"image")
                    else:
                        raw = fetch(image, 8_000_000)
                except (OSError, ValueError, http.client.HTTPException):
                    continue
                ext = ".jpg" if raw[:3] == b"\xff\xd8\xff" else ".png" if raw[:8] == b"\x89PNG\r\n\x1a\n" else ".webp" if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP" else None
                if ext and (not validate or (role=="outfit" and not via_web) or validate(raw,ext)):
                    return [(dict(title=plain(title), url=origin, author=plain(author), license=plain(license_name),
                                  query=effective_query, provider=("web" if page or adapter=="google" else source), imageUrl=image), ext, raw)]
        except (KeyError, TypeError, ValueError, OSError, http.client.HTTPException) as exc:
            errors.append(f"{source}: {type(exc).__name__}")
    raise ValueError(f"{role} 没有可读取的参考图片（{query}；{', '.join(errors) or '目录无匹配'}）")


def save_reference(job, role, query, settings, rng=None, fetch=read_url, validate=None):
    (record, ext, raw), = search(role, query, settings, fetch, rng, validate=validate)
    path = job / (role + ext)
    path.write_bytes(raw)
    return dict(record, file=path.name)


def material_directory():
    root=Path(os.environ.get("FEIYUE_PUBLIC_RESEARCH_DIR") or Path(os.environ["LOCALAPPDATA"])/"Feiyue/PublicResearch")/uuid.uuid4().hex
    root.mkdir(parents=True)
    return root


if __name__ == "__main__":
    try:
        interactive = sys.argv[1:] == ["--pick"]
        request = json.loads(sys.stdin.buffer.readline()) if interactive else json.load(sys.stdin.buffer)
        query = request["query"]
        mode = request.get("mode","images")
        if mode in ("web","news","page","x"):
            if mode=="x":
                sources=tavily_search.search(query,x_only=True)
                if not sources:
                    raise ValueError("TAVILY_NO_POSTS")
            elif mode=="news":
                sources=news(Reader(),query)
            else:
                sources=page_material(request.get("page"),query)
            if mode!="news":
                file=material_directory()/"excerpts.json"
                file.write_text(json.dumps(sources,ensure_ascii=False,indent=2),encoding="utf-8")
                for row in sources:
                    row["file"]=str(file)
            print(json.dumps(dict(sources=sources)))
            sys.exit(0)
        sys.path.insert(0,str(Path(__file__).resolve().parents[3]/"tools"))
        import comfy_job
        _,runtime,_=comfy_job.installation()
        def choose(titles):
            print(json.dumps(dict(candidates=titles)),flush=True)
            return int(sys.stdin.buffer.readline() or b"0")
        preview_bytes=b""
        def decode(raw, ext):
            global preview_bytes
            check=subprocess.run([str(runtime),"-B",str(DEFAULT.with_name("research_preview.py")),"--search"],
                                 input=raw,capture_output=True,timeout=12,creationflags=subprocess.CREATE_NO_WINDOW)
            preview_bytes=check.stdout
            return check.returncode==0 and bool(preview_bytes)
        (record,ext,raw),=search("images",query,config(),page=request.get("page"),validate=decode,
                                 choose=choose if interactive else None)
        root=material_directory()
        path=root/("1"+ext)
        path.write_bytes(raw)
        path.with_suffix(".preview.jpg").write_bytes(preview_bytes)
        preview="data:image/jpeg;base64,"+base64.b64encode(preview_bytes).decode()
        sources=[dict(title=record["title"],url=record["url"],imageUrl=record["imageUrl"],file=str(path),
                      snippet=" · ".join(filter(None,[record["author"],record["license"],record["provider"]])),preview=preview)]
        (root/"sources.json").write_text(json.dumps([dict((k,v) for k,v in s.items() if k!="preview")
                                                    for s in sources],ensure_ascii=False,indent=2),encoding="utf-8")
        print(json.dumps(dict(sources=sources)))
    except (KeyError, OSError, ValueError) as exc:
        print(json.dumps(dict(error=str(exc))))
        sys.exit(1)
