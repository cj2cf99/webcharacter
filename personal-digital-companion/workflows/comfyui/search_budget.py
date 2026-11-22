"""同一台机器的自主查阅预占免费月额度，只记录供应商、日期和用量。"""

from calendar import monthrange
from contextlib import closing
from datetime import datetime, timezone
from math import ceil
import os
from pathlib import Path
import sqlite3


class MonthlyBudgetUnavailable(ValueError):
    pass


def reserve_monthly(provider, allowance, available, *, directory=None, now=None, reset=None, minimum=1, maximum=1, bucket=None):
    if type(allowance) is not int or type(available) is not int or not 0 <= available <= allowance:
        raise MonthlyBudgetUnavailable("SEARCH_FREE_UNVERIFIED")

    now = now or datetime.now(timezone.utc)
    days = monthrange(now.year, now.month)[1]
    days_left = days - now.day + 1
    if reset is not None:
        days_left = ceil((reset - now).total_seconds() / 86400)
        if not 1 <= days_left <= 31:
            raise MonthlyBudgetUnavailable("SEARCH_FREE_UNVERIFIED")
    hold = ceil(allowance / 5)
    cycle_cap = allowance - hold
    daily_cap = max(1, cycle_cap // days)
    day = now.date().isoformat()
    if directory is None:
        directory = Path(os.environ["LOCALAPPDATA"]) / "Feiyue/PublicResearch"
    directory.mkdir(parents=True, exist_ok=True)

    # 继续使用 Tavily 原额度库，使既有月预占与新的按日预占同事务生效。
    with closing(sqlite3.connect(directory / "tavily-budget.sqlite3")) as db, db:
        db.execute("BEGIN IMMEDIATE")
        db.execute("CREATE TABLE IF NOT EXISTS search_daily (provider TEXT, day TEXT, used INTEGER NOT NULL, PRIMARY KEY(provider, day))")
        row = db.execute("SELECT used FROM search_daily WHERE provider=? AND day=?", (provider, day)).fetchone()
        today = row[0] if row else 0
        headroom = available - hold - today
        if provider == "tavily":
            db.execute("CREATE TABLE IF NOT EXISTS monthly (month TEXT PRIMARY KEY, used INTEGER NOT NULL)")
            older = db.execute("SELECT used FROM monthly WHERE month=?", (day[:7],)).fetchone()
            previously_reserved = max(older[0] if older else 0, allowance - available)
            headroom = min(headroom, cycle_cap - previously_reserved)
        daily_share = max(minimum, (available - hold) // days_left)
        cost = min(maximum, min(daily_cap, daily_share) - today, headroom)
        if bucket is not None:
            name, allocation = bucket
            db.execute("CREATE TABLE IF NOT EXISTS search_allocation (provider TEXT, bucket TEXT, cycle TEXT, used INTEGER NOT NULL, PRIMARY KEY(provider,bucket,cycle))")
            bucket_cycle = reset.date().isoformat() if reset is not None else day[:7]
            usage = db.execute("SELECT used FROM search_allocation WHERE provider=? AND bucket=? AND cycle=?",
                               (provider, name, bucket_cycle)).fetchone()
            bucket_used = usage[0] if usage else 0
            cost = min(cost, allocation - bucket_used)
        if cost < minimum:
            raise MonthlyBudgetUnavailable("SEARCH_MONTHLY_PACED")
        if bucket is not None:
            db.execute("INSERT OR REPLACE INTO search_allocation VALUES (?, ?, ?, ?)",
                       (provider, name, bucket_cycle, bucket_used + cost))
        db.execute("INSERT OR REPLACE INTO search_daily VALUES (?, ?, ?)", (provider, day, today + cost))
        if provider == "tavily":
            db.execute("INSERT OR REPLACE INTO monthly VALUES (?, ?)", (day[:7], previously_reserved + cost))
    return cost
