"""Bounded public HTTPS reader. No browser state, JavaScript, form submission or local tools."""
import http.client
import html
import ipaddress
import json
from xml.etree import ElementTree
import re
import socket
import time
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

AGENT = "FeiyueDesktop"
SKIP = {"script","style","noscript","template","nav","footer","header","form","svg"}
VOID = {"area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"}


def public_address(value):
    ip = ipaddress.ip_address(value)
    if ip.version == 6 and (ip.ipv4_mapped or ip.sixtofour or ip.teredo or ip in ipaddress.ip_network("64:ff9b::/96")):
        return False
    return ip.is_global and not ip.is_multicast and not ip.is_reserved


def target(url):
    p = urlsplit(url)
    if (len(url)>2048 or re.search(r"[\x00-\x20\\]",url) or p.scheme!="https" or not p.hostname or
            p.username is not None or p.password is not None or p.port not in (None,443)):
        raise ValueError("仅支持无登录凭据的公开 HTTPS 地址")
    return p


class Reader:
    def __init__(self, seconds=30, request_timeout=6):
        self.deadline = time.monotonic()+seconds
        self.request_timeout=request_timeout
        self.requests = 0
        self.budget = 16_000_000
        self.rules = {}

    def timeout(self):
        left = self.deadline-time.monotonic()
        if left<=0:
            raise TimeoutError("本轮公开取材超时")
        return min(self.request_timeout,left)

    def get(self, url, limit, api_headers=None):
        p = target(url)
        self.requests += 1
        if self.requests>42 or self.budget<=0:
            raise ValueError("本轮已达公开读取上限")
        self.timeout()
        addrs = sorted({row[4][0] for row in socket.getaddrinfo(p.hostname,443,type=socket.SOCK_STREAM)},
                       key=lambda ip: (":" in ip,ip))
        if not addrs or any(not public_address(a) for a in addrs):
            raise ValueError("目标不是公开网络地址")
        # Pin the checked IP while keeping the original hostname for SNI and certificate validation.
        conn = http.client.HTTPSConnection(p.hostname,timeout=self.timeout())
        conn._create_connection = lambda address,timeout,source_address=None: socket.create_connection((addrs[0],443),timeout)
        try:
            conn.request("GET",urlunsplit(("","",p.path or "/",p.query,"")),headers={
                "User-Agent": AGENT+"/1.0", "Accept-Encoding":"identity", "Connection":"close", **(api_headers or {})})
            res=conn.getresponse()
            headers={k.lower():v for k,v in res.getheaders()}
            data=bytearray()
            limit=min(limit,self.budget)
            if res.status==200:
                if int(headers.get("content-length","0"))>limit or headers.get("content-encoding","identity")!="identity":
                    raise ValueError("页面或图像超过本轮上限")
                while len(data)<=limit:
                    self.timeout()
                    chunk=res.read1(min(32768,limit+1-len(data)))
                    if not chunk:
                        break
                    data.extend(chunk)
                    self.budget-=len(chunk)
                if len(data)>limit:
                    raise ValueError("页面或图像过大")
            return res.status,headers,bytes(data)
        finally:
            conn.close()

    def allowed(self,url):
        p=target(url)
        origin="https://"+p.netloc
        if origin not in self.rules:
            status,_,raw=self.get(origin+"/robots.txt",512_000)
            if status in (404,410):
                self.rules[origin]=True
            elif status==200:
                rules=RobotFileParser()
                rules.parse(raw.decode("utf-8","replace").splitlines())
                self.rules[origin]=rules
            else:
                self.rules[origin]=False
        rules=self.rules[origin]
        return rules if isinstance(rules,bool) else rules.can_fetch(AGENT,url)

    def read(self,url,kind):
        for _ in range(4):
            if not self.allowed(url):
                raise ValueError("站点未允许本次抓取")
            status,headers,raw=self.get(url,1_500_000 if kind=="html" else 6_000_000)
            if status in (301,302,303,307,308) and headers.get("location"):
                url=urljoin(url,headers["location"])
                continue
            mime=headers.get("content-type","").split(";")[0].lower()
            if status!=200 or mime not in (("text/html","application/xhtml+xml") if kind=="html" else ("image/jpeg","image/png","image/webp")):
                raise ValueError("网页或图片未公开返回预期格式")
            return url,raw
        raise ValueError("网页跳转次数过多")


class Article(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack=[]
        self.paragraphs=[]
        self.images=[]
        self.social=[]
        self.title=[]
        self.anchors=[]
        self.buffer=[]

    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if any(t in SKIP for t in self.stack):
            if tag not in VOID:
                self.stack.append(tag)
            return
        if tag=="meta" and a.get("property")=="og:image" and a.get("content"):
            self.social.append((a["content"],""))
        if tag=="img":
            src=a.get("data-src") or a.get("src")
            if src and not re.search("logo|avatar|icon|pixel|tracking",src,re.I):
                self.images.append((src,a.get("alt") or ""))
        if tag=="a" and a.get("href"):
            self.anchors.append(a["href"])
        if tag=="p":
            self.buffer=[]
        if tag not in VOID:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag not in self.stack:
            return
        if tag=="p" and not any(t in SKIP for t in self.stack):
            s=" ".join(" ".join(self.buffer).split())
            if len(s)>=20 and s not in self.paragraphs:
                self.paragraphs.append(s)
        del self.stack[len(self.stack)-1-self.stack[::-1].index(tag):]

    def handle_data(self,data):
        if not any(t in SKIP for t in self.stack):
            if "title" in self.stack:
                self.title.append(data.strip())
            if "p" in self.stack:
                self.buffer.append(data)


def article(reader,url):
    url,raw=reader.read(url,"html")
    doc=Article()
    doc.feed(raw.decode("utf-8","replace"))
    return url,doc


def discover(query):
    import tavily_search
    return [item["url"] for item in tavily_search.search(query)]


def news(reader,query):
    def stamp(value):
        if not value:
            return ""
        try:
            try:
                date=datetime.fromisoformat(value.replace("Z","+00:00"))
            except ValueError:
                date=parsedate_to_datetime(value)
            if date.tzinfo:
                return date.astimezone(timezone(timedelta(hours=9))).strftime("%Y-%m-%d %H:%M JST")
        except (ValueError,TypeError,OverflowError):
            pass
        return ""
    rows = rss_news(reader, query)
    if not rows:
        raise ValueError("Google 新闻没有返回相关报道")
    return [dict(title=item["title"], url=item["url"], snippet=" · ".join(filter(None, [
        item["source"], stamp(item["published"])]))) for item in rows[:3]]


def picture_key(url):
    # 同一张频道图可能按不同尺寸分发。保留 id 等标识资源的查询参数。
    parts = urlsplit(url.strip())
    query = sorted((k,v) for k,v in parse_qsl(parts.query,keep_blank_values=True)
                   if k.lower() not in {"w","h","width","height","size"})
    return parts.hostname, parts.path, tuple(query)


def rss_picture(item, channel_images=()):
    media = "{http://search.yahoo.com/mrss/}"
    candidates = [el.get("url") for el in item.iter(media+"thumbnail")]
    for el in [*item.iter(media+"content"), *item.findall("enclosure")]:
        if el.get("medium") == "image" or el.get("type","").startswith("image/"):
            candidates.append(el.get("url"))
    for field in ("description", "{http://purl.org/rss/1.0/modules/content/}encoded"):
        parser = Article()
        parser.feed(item.findtext(field, "") or "")
        candidates.extend(src for src, _ in parser.images)
    for url in filter(None, candidates):
        try:
            target(url)
            if picture_key(url) in channel_images:
                continue
            if not re.search(r"(?:^|[/_.-])(?:logo|avatar|favicon|pixel|tracking)(?:[/_.?-]|$)",url,re.I):
                return url
        except ValueError:
            continue
    return None


def rss_news(reader, query, days=1):
    url="https://news.google.com/rss/search?"+urlencode(dict(q=f"{query} when:{days}d",hl="zh-CN",gl="CN",ceid="CN:zh-Hans"))
    status,_,raw=reader.get(url,1_500_000)
    if status!=200:
        raise ValueError("Google 新闻暂不可用")
    rows=[]
    channel = ElementTree.fromstring(raw).find("channel")
    if channel is None:
        return rows
    channel_images = set()
    for child in channel:
        name = child.tag.split("}")[-1]
        if name in {"image","thumbnail","icon","logo"}:
            value = child.findtext("url") or child.get("href") or child.get("url") or child.text
            if value:
                try:
                    channel_images.add(picture_key(value))
                except ValueError:
                    continue
    for item in channel.findall("item"):
        link=item.findtext("link","")
        title=item.findtext("title","")
        if title and link.startswith("https://"):
            description = item.findtext("description", "")
            text = html.unescape(re.sub(r"<[^>]*>", " ", description))
            rows.append(dict(title=title[:200], url=link, source=item.findtext("source",""),
                             imageUrl=rss_picture(item, channel_images), lang=item.get("{http://www.w3.org/XML/1998/namespace}lang",""),
                             excerpt=" ".join(text.split())[:900], published=item.findtext("pubDate","")))
    return rows


def page_material(url,query="",reader=None):
    reader=reader or Reader()
    candidates=[url] if url else discover(query)
    sources=[]
    visited=set()
    for address in list(dict.fromkeys(candidates))[:10]:
        try:
            final,doc=article(reader,address)
            if doc.paragraphs and final not in visited:
                visited.add(final)
                sources.append(dict(title=" ".join(doc.title)[:200] or urlsplit(final).hostname,url=final,
                                    snippet="\n".join(doc.paragraphs)[:2200]))
        except (OSError,ValueError,http.client.HTTPException):
            if url:
                raise
        if len(sources)>=10 or reader.requests>=20:
            break
    if not sources:
        raise ValueError("未读取到可用的公开正文")
    return sources


def discover_images(reader,query,url=None):
    for address in ([url] if url else discover(query)):
        try:
            final,doc=article(reader,address)
        except (ValueError,OSError,http.client.HTTPException):
            continue
        images=doc.images+doc.social
        words=set(re.findall(r"\w+",query.lower()))
        images.sort(key=lambda pair:-len(words & set(re.findall(r"\w+",pair[1].lower()))))
        seen=set()
        for src,caption in images:
            url=urljoin(final,src)
            if url in seen or not url.startswith("https://"):
                continue
            seen.add(url)
            if len(seen)>5:
                break
            yield (caption[:200] or " ".join(doc.title)[:200],final,url,"","授权见原页",[urlsplit(final).hostname],[urlsplit(url).hostname])
