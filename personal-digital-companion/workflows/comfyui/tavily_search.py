"""绯月的免费公开搜索。普通网页与 X 帖子共用一份本机预算。"""
from contextlib import closing
from datetime import datetime, timedelta, timezone
from http.client import HTTPSConnection
import json
import os
from pathlib import Path
import re
import sqlite3
from urllib.parse import urlsplit


def request(key, path, payload=None):
    with closing(HTTPSConnection("api.tavily.com", timeout=10)) as conn:
        conn.request("GET" if payload is None else "POST", path,
                     body=json.dumps(payload).encode() if payload is not None else None,
                     headers={"Authorization": "Bearer "+key, "Content-Type": "application/json"})
        res=conn.getresponse()
        if res.status!=200:
            raise ValueError("TAVILY_QUOTA" if res.status in (432,433) else "TAVILY_HTTP_"+str(res.status))
        raw=res.read(1_000_001)
        if len(raw)>1_000_000:
            raise ValueError("TAVILY_RESPONSE")
        return json.loads(raw)


def reserve(account, month, directory):
    # 证据不全时停止；额度以服务商账户为最终边界，sqlite 防止本机进程并发超领。
    if not isinstance(account,dict) or str(account.get("current_plan")).lower() not in ("researcher","free") or (
            "paygo_limit" not in account or account["paygo_limit"] not in (None,0) or account.get("paygo_usage")!=0):
        raise ValueError("TAVILY_FREE_UNVERIFIED")
    limit,used=account.get("plan_limit"),account.get("plan_usage")
    if type(limit) is not int or type(used) is not int or min(limit,used)<0:
        raise ValueError("TAVILY_FREE_UNVERIFIED")
    directory.mkdir(parents=True,exist_ok=True)
    with closing(sqlite3.connect(directory/"tavily-budget.sqlite3")) as db, db:
        db.execute("BEGIN IMMEDIATE")
        db.execute("CREATE TABLE IF NOT EXISTS monthly (month TEXT PRIMARY KEY, used INTEGER NOT NULL)")
        row=db.execute("SELECT used FROM monthly WHERE month=?",(month,)).fetchone()
        used=max(used,row[0] if row else 0)
        if used>=min(limit,1000):
            raise ValueError("TAVILY_QUOTA")
        db.execute("INSERT OR REPLACE INTO monthly VALUES (?,?)",(month,used+1))


def search(query, x_only=False, *, send=request, directory=None):
    key=os.getenv("TAVILY_API_KEY")
    if not key:
        raise ValueError("TAVILY_NOT_CONFIGURED")
    now=datetime.now(timezone.utc)
    usage=send(key,"/usage")
    reserve(usage.get("account"),now.strftime("%Y-%m"),directory or Path(os.environ["LOCALAPPDATA"])/"Feiyue/PublicResearch")
    payload=dict(query=query,topic="general",search_depth="basic",max_results=8 if x_only else 5,
                 auto_parameters=False,include_answer=False,include_raw_content=False)
    if x_only:
        payload["include_domains"]=["x.com"]
    rows=send(key,"/search",payload)["results"]
    sources=[]
    seen=set()
    observed=datetime.now(timezone.utc)
    for item in rows:
        url=item.get("url","")
        if not url.startswith("https://"):
            continue
        title=str(item.get("title") or "")[:200]
        snippet=str(item.get("content") or "")[:1500]
        record=dict(title=title,url=url,snippet=snippet,provider="Tavily")
        if x_only:
            parts=urlsplit(url)
            match=re.fullmatch(r"/(?:[A-Za-z0-9_]{1,15}/status|i/(?:web/)?status)/([1-9][0-9]{0,18})/?",parts.path)
            if parts.netloc.lower() not in ("x.com","www.x.com") or not match:
                continue
            post=match[1]
            if post in seen:
                continue
            seen.add(post)
            record.update(url="https://x.com"+parts.path.rstrip("/"),observedAt=observed.isoformat())
            jst=timezone(timedelta(hours=9))
            stamp=lambda date: date.astimezone(jst).strftime("%Y-%m-%d %H:%M JST")
            time_text="发帖时间未确认"
            if len(post)>=15:
                published=datetime.fromtimestamp(((int(post)>>22)+1288834974657)/1000,timezone.utc)
                if published<=observed:
                    record["publishedAt"]=published.isoformat()
                    age="近12小时" if observed-published<=timedelta(hours=12) else "超过12小时"
                    time_text=f"按帖号推算 {stamp(published)} 发帖（{age}）"
            record["snippet"]=f"{time_text} · 本次查到 {stamp(observed)}\n{snippet}"
        sources.append(record)
    return sources
