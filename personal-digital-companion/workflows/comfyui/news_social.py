"""取同一窗口的 X / Reddit 原帖。供应商估算日期保留待核实状态。"""
from datetime import datetime, timedelta, timezone
import json
import math
import os
import re
import sys
from urllib.parse import urlsplit
import tavily_search


def reddit_post(url):
    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    match = re.match(r"^/r/([\w]+)/comments/([a-z0-9]+)(?:/|$)", parts.path, re.I | re.ASCII)
    if parts.scheme == "https" and parts.netloc.lower() in ("reddit.com", "www.reddit.com") and match:
        community, post = match.groups()
        return post.lower(), f"https://www.reddit.com/r/{community}/comments/{post}/"
    return None


def filter_posts(platform, results, start, end):
    seen = set()
    posts = []
    for row in results:
        if not isinstance(row, dict):
            continue
        url = str(row.get("url") or "")
        match = tavily_search.x_post(url) if platform == "X" else reddit_post(url)
        if not match or match[0] in seen:
            continue
        stamp = tavily_search.post_date(match[0]) if platform == "X" else None
        created = row.get("created_utc")
        if platform == "Reddit" and isinstance(created, (int, float)) and 0 < created <= 253402300799:
            stamp = datetime.fromtimestamp(created, timezone.utc)
        if stamp and not start <= stamp <= end:
            continue
        text = str(row.get("content") or row.get("raw_content") or "").strip()[:1500]
        if not text:
            continue
        seen.add(match[0])
        posts.append(dict(url=match[1], title=str(row.get("title") or platform)[:220], text=text,
                          at=round(stamp.timestamp()*1000) if stamp else None))
    return posts


def search(platform, groups, cutoff, *, send=tavily_search.request, directory=None, now=None):
    key = os.getenv("TAVILY_API_KEY")
    if not key:
        return dict(state="unavailable", code="TAVILY_NOT_CONFIGURED", posts=[])
    if platform not in ("X", "Reddit") or not 1 <= len(groups) <= 3 or not all(
            isinstance(g, str) and 0 < len(g) <= 100 for g in groups):
        raise ValueError("NEWS_SOCIAL_INPUT")
    end = datetime.fromtimestamp(cutoff/1000, timezone.utc)
    start = end-timedelta(days=3)
    try:
        usage = send(key, "/usage")
        info = usage.get("key") or {}
        limit, used = info.get("limit"), info.get("usage")
        if type(limit) is int and (type(used) is not int or limit-used < 1):
            raise ValueError("TAVILY_KEY_QUOTA")
        tavily_search.reserve(usage.get("account"), directory, now, editorial=True)
    except (ValueError, OSError) as error:
        code = str(error)
        return dict(state="unavailable", code=code if re.fullmatch(r"[A-Z0-9_]+", code) else "SEARCH_QUOTA_UNVERIFIED", posts=[])
    domain = "x.com" if platform == "X" else "reddit.com"
    payload = dict(query="Public posts on the same news event about " + " OR ".join(groups),
                   topic="general", search_depth="basic", max_results=20, include_published_date=True,
                   start_date=start.date().isoformat(), end_date=(end+timedelta(days=1)).date().isoformat(),
                   include_domains=[domain], include_domains_mode="restrict", include_raw_content="text",
                   auto_parameters=False, include_usage=True)
    try:
        result = send(key, "/search", payload)
        rows = result["results"]
        posts = filter_posts(platform, rows, start, end)
    except (ValueError, OSError, KeyError, TypeError, OverflowError):
        return dict(state="unknown", code="SEARCH_RECEIPT_UNKNOWN", posts=[])
    credits = (result.get("usage") or {}).get("credits")
    return dict(state="ok", posts=posts, returned=len(rows), credits=credits if type(credits) is int else None)


if __name__ == "__main__":
    platform, cutoff, groups = sys.argv[1:]
    if not math.isfinite(float(cutoff)):
        raise ValueError("NEWS_SOCIAL_TIME")
    print(json.dumps(search(platform, json.loads(groups), int(cutoff))))
