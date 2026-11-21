"""绯月的免费公开搜索。普通网页与 X 帖子共用一份本机预算。"""
from datetime import datetime, timedelta, timezone
import os
import re
from urllib.parse import urlsplit
from public_reader import provider_json
from search_budget import reserve_monthly


def request(key, path, payload=None):
    status, data = provider_json("api.tavily.com", key, path, payload)
    if status != 200:
        raise ValueError("TAVILY_QUOTA" if status in (432,433) else "TAVILY_HTTP_"+str(status))
    return data


def reserve(account, directory, now):
    if not isinstance(account,dict) or str(account.get("current_plan")).lower() not in ("researcher","free") or (
            "paygo_limit" not in account or account["paygo_limit"] not in (None,0) or account.get("paygo_usage")!=0):
        raise ValueError("TAVILY_FREE_UNVERIFIED")
    limit,used=account.get("plan_limit"),account.get("plan_usage")
    if type(limit) is not int or type(used) is not int or min(limit,used)<0:
        raise ValueError("TAVILY_FREE_UNVERIFIED")
    limit=min(limit,1000)
    reserve_monthly("tavily",limit,max(0,limit-used),directory=directory,now=now)


def x_post(url):
    try:
        parts=urlsplit(url)
    except ValueError:
        return None
    match=re.fullmatch(r"/(?:[A-Za-z0-9_]{1,15}/status|i/(?:web/)?status)/([1-9][0-9]{0,18})/?",parts.path)
    if parts.scheme=="https" and parts.netloc.lower() in ("x.com","www.x.com") and match:
        return match[1], "https://x.com" + parts.path.rstrip("/")
    return None


def post_date(post):
    if len(post) >= 15:
        return datetime.fromtimestamp(((int(post)>>22)+1288834974657)/1000,timezone.utc)
    return None


def search(query, x_only=False, *, send=request, directory=None, now=None):
    key=os.getenv("TAVILY_API_KEY")
    if not key:
        raise ValueError("TAVILY_NOT_CONFIGURED")
    usage=send(key,"/usage")
    reserve(usage.get("account"),directory,now)
    result_limit=8 if x_only else 10
    payload=dict(query=query,topic="general",search_depth="basic",max_results=result_limit,
                 auto_parameters=False,include_answer=False,include_raw_content=False)
    if x_only:
        payload["include_domains"]=["x.com"]
    rows=send(key,"/search",payload)["results"]
    sources=[]
    seen=set()
    observed=datetime.now(timezone.utc)
    for item in rows[:result_limit]:
        url=item.get("url","")
        if not url.startswith("https://"):
            continue
        title=str(item.get("title") or "")[:200]
        snippet=str(item.get("content") or "")[:1500]
        record=dict(title=title,url=url,snippet=snippet,provider="Tavily")
        if x_only:
            matched=x_post(url)
            if not matched:
                continue
            post,canonical=matched
            if post in seen:
                continue
            seen.add(post)
            record.update(url=canonical,observedAt=observed.isoformat())
            jst=timezone(timedelta(hours=9))
            stamp=lambda date: date.astimezone(jst).strftime("%Y-%m-%d %H:%M JST")
            time_text="发帖时间未确认"
            published=post_date(post)
            if published and published<=observed:
                record["publishedAt"]=published.isoformat()
                age="近12小时" if observed-published<=timedelta(hours=12) else "超过12小时"
                time_text=f"按帖号推算 {stamp(published)} 发帖（{age}）"
            record["snippet"]=f"{time_text} · 本次查到 {stamp(observed)}\n{snippet}"
        sources.append(record)
    return sources
