"""自主查阅的日额、月额线路和源数据转换。"""

from datetime import datetime, timedelta, timezone
from http.client import HTTPException
import os

from public_reader import provider_json, target
from search_budget import MonthlyBudgetUnavailable, reserve_monthly
import tavily_search


JST = timezone(timedelta(hours=9))
SOURCE_ERRORS = (OSError, HTTPException, ValueError)


def request(host, key, path, body=None):
    status, data = provider_json(host, key, path, body)
    if status != 200:
        raise ValueError("SEARCH_HTTP_" + str(status))
    if not isinstance(data, dict):
        raise ValueError("SEARCH_RESPONSE_INVALID")
    return data


def langsearch(query, mode, *, send=request, now=None):
    key = os.getenv("LANGSEARCH_API_KEY")
    if not key:
        return []
    limit = 8 if mode == "x" else 10
    payload = dict(query=query, count=limit)
    if mode == "x":
        payload.update(includeDomains=["x.com"], freshness="oneWeek")
    result = send("api.langsearch.com", key, "/v1/web-search", payload)
    if result.get("code") != 200:
        return []
    data = result.get("data")
    pages = data.get("webPages") if isinstance(data, dict) else None
    rows = pages.get("value") if isinstance(pages, dict) else None
    if not isinstance(rows, list):
        return []
    sources, seen = [], set()
    now = now or datetime.now(timezone.utc)
    for item in rows[:limit]:
        if not isinstance(item, dict):
            continue
        url, title = item.get("url"), item.get("name")
        if not isinstance(url, str) or not isinstance(title, str) or not title.strip():
            continue
        try:
            target(url)
        except ValueError:
            continue
        snippet = str(item.get("snippet") or "")[:550]
        if mode == "x":
            matched = tavily_search.x_post(url)
            if not matched:
                continue
            post, url = matched
            published = tavily_search.post_date(post)
            if not published or not now - timedelta(days=7) <= published <= now:
                continue
            snippet = f"LangSearch · 按帖号推算 {published.astimezone(JST):%Y-%m-%d %H:%M} JST\n{snippet}"
        else:
            post = url
        if post in seen:
            continue
        seen.add(post)
        sources.append(dict(title=title[:200], url=url, snippet=snippet, provider="LangSearch"))
    return sources


def weir_posts(query, *, send=request, directory=None, now=None):
    key = os.getenv("WEIR_API_KEY")
    if not key:
        raise MonthlyBudgetUnavailable("WEIR_NOT_CONFIGURED")
    host = "api.weirapp.io"
    try:
        credit = send(host, key, "/v1/usage").get("data")
    except SOURCE_ERRORS as err:
        raise MonthlyBudgetUnavailable("WEIR_FREE_UNVERIFIED") from err
    free = credit.get("freeGrant") if isinstance(credit, dict) else None
    if not isinstance(free, dict) or credit.get("spendingPaused") is not False or credit.get("balance") != free.get("remaining"):
        raise MonthlyBudgetUnavailable("WEIR_FREE_UNVERIFIED")
    if type(credit.get("available")) is not int or type(credit.get("balance")) is not int or credit["available"] > credit["balance"]:
        raise MonthlyBudgetUnavailable("WEIR_FREE_UNVERIFIED")
    try:
        reset = datetime.fromisoformat(free["resetsAt"])
        if reset.tzinfo is None:
            raise ValueError()
    except (KeyError, TypeError, ValueError) as err:
        raise MonthlyBudgetUnavailable("WEIR_FREE_UNVERIFIED") from err
    cost = reserve_monthly("weir", free.get("granted"), credit.get("available"), directory=directory,
                           now=now, reset=reset, minimum=2, maximum=9)
    limit = cost - 1
    posts = send(host, key, "/v1/x/search", dict(query=query, sort="latest", limit=limit)).get("data", [])
    if not isinstance(posts, list):
        raise ValueError("SEARCH_RESPONSE_INVALID")
    sources, seen = [], set()
    for item in posts[:limit]:
        if not isinstance(item, dict):
            continue
        content, url = item.get("text"), item.get("url")
        if not isinstance(content, str) or not content.strip() or not isinstance(url, str):
            continue
        matched = tavily_search.x_post(url)
        if not matched or matched[0] in seen:
            continue
        seen.add(matched[0])
        try:
            date = datetime.fromisoformat(item.get("createdAt", ""))
            stamp = f"{date.astimezone(JST):%Y-%m-%d %H:%M} JST" if date.tzinfo else "发帖时间未确认"
        except (TypeError, ValueError):
            stamp = "发帖时间未确认"
        sources.append(dict(title=content.strip()[:100], url=matched[1], provider="Weir",
                            snippet=f"Weir · {stamp}\n{content.strip()[:480]}"))
    return sources


def lookup(query, mode):
    try:
        sources = langsearch(query, mode)
    except SOURCE_ERRORS:
        sources = []
    if sources:
        return sources
    if mode == "x" and os.getenv("WEIR_API_KEY"):
        try:
            return weir_posts(query)
        except MonthlyBudgetUnavailable:
            if not os.getenv("TAVILY_API_KEY"):
                raise
    # Weir 一旦发送了扣额请求，无论有没有结果都结束本轮。
    return tavily_search.search(query, x_only=mode == "x")
