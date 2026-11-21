"""绯月的半日新闻关注清单。只将固定的公开主题发给新闻 RSS。"""
from concurrent.futures import ThreadPoolExecutor
from email.utils import parsedate_to_datetime
import http.client
import json
import re
from xml.etree.ElementTree import ParseError

from public_reader import Reader, rss_news


TOPICS = {
    "中国社会": "中国 (遇难 OR 救援 OR 医保 OR 养老金 OR 重大事故 OR 停运 OR 延迟退休)",
    "美国社会": "美国 (停摆 OR 移民政策 OR 枪击 OR 抗议 OR 医保 OR 紧急状态 OR 罢工)",
    "日本社会": "日本 (联署 OR 抗议 OR 地震 OR 避难 OR 改革 OR 补贴 OR 罢工)",
    "人工智能": "人工智能 (监管 OR 安全 OR 应用 OR 突破 OR 发布)",
    "大模型": "(大模型 OR 大语言模型 OR 多模态模型) (发布 OR 开源 OR 训练 OR 推理)",
    "机器人": "(机器人 OR 具身智能) (发布 OR 量产 OR 部署 OR 突破 OR 事故)",
    "中国股市": "(A股 OR 港股 OR 沪指 OR 恒生指数) (大涨 OR 大跌 OR 跳水 OR 暴涨 OR 暴跌 OR 异动)",
    "美国股市": "(美股 OR 纳指 OR 标普500 OR 道指) (大涨 OR 大跌 OR 跳水 OR 暴涨 OR 暴跌 OR 异动)",
    "日本股市": "(日股 OR 日经指数 OR 日经225 OR 东证指数) (大涨 OR 大跌 OR 跳水 OR 暴涨 OR 暴跌 OR 异动)",
}

# RSS 也会按正文匹配。主动提醒需在标题里看到公共影响或明确的市场变动。
SOCIAL_EVENT = re.compile(
    r"死亡|身亡|遇难|伤亡|失踪|疏散|撤离|避难|救灾|救援|灾害|地震|海啸|洪水|洪灾|山火|"
    r"暴雨.{0,5}预警|台风.{0,6}登陆|疫情|紧急状态|应急响应|停电|停运|罢工|停摆|抗议|枪击|"
    r"延迟退休|移民政策|(?:万人|万名|万民众).{0,12}(?:联署|集会|签名)|"
    r"列车.{0,5}脱轨|坍塌|爆炸|重大事故|公共卫生事件|"
    r"(?:医保|养老金|社保|最低工资|育儿补贴|社会保障).{0,15}(?:上调|下调|提高|改革|实施|新规)|"
    r"(?:上调|下调|提高|实施|改革).{0,12}(?:养老金|最低工资|育儿补贴)")
REGION = {
    "中国社会": r"中国|我国|全国|国务院|人社部|应急管理部|国家卫健委|北京|上海|天津|重庆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|内蒙古|广西|西藏|宁夏|新疆|香港|澳门",
    "美国社会": r"美国|全美|美方|白宫|纽约|加州|加利福尼亚|洛杉矶|得州|德克萨斯|华盛顿|佛罗里达|芝加哥",
    "日本社会": r"日本|东京|大阪|北海道|福岛|京都|冲绳|名古屋|九州|本州",
}
STOCK_MOVE = re.compile(r"大涨|大跌|暴涨|暴跌|飙升|飙涨|跳水|急跌|急升|急涨|重挫|狂泻|熔断|涨停|跌停|异动|暴拉|新高|新低|(?:涨|跌|回落|下挫|攀升).{0,6}\d+(?:\.\d+)?%")
MARKET = {"中国股市":r"A股|港股|沪指|沪深|上证|深证|创业板|恒生|科创板",
          "美国股市":r"美股|纳指|纳斯达克|标普|道指|道琼斯",
          "日本股市":r"日股|日本股|日经|东证|东京股"}
TECH = {"人工智能":r"人工智能|\bAI\b|智能体|OpenAI|DeepSeek",
        "大模型":r"大模型|大语言模型|多模态模型|基座模型|GPT|Claude|Gemini|DeepSeek|Qwen|通义千问|Llama",
        "机器人":r"机器人|具身智能|机械臂"}


def relevant(topic, title):
    if topic in REGION:
        return re.search(REGION[topic], title) and SOCIAL_EVENT.search(title)
    if topic in MARKET:
        return re.search(MARKET[topic], title, re.I) and STOCK_MOVE.search(title)
    return re.search(TECH[topic], title, re.I | re.ASCII)


def fetch_topic(topic):
    try:
        articles = rss_news(Reader(seconds=10), TOPICS[topic])
    except (OSError, ValueError, ParseError, http.client.HTTPException):
        return topic, None
    items = []
    for row in articles:
        try:
            date = parsedate_to_datetime(row["published"])
            if not date.tzinfo:
                continue
        except (ValueError, TypeError, OverflowError):
            continue
        title = row["title"]
        if row["source"]:
            title = title.removesuffix(" - " + row["source"])
        if not relevant(topic, title):
            continue
        items.append(dict(topic=topic, title=title, url=row["url"], source=row["source"], excerpt=row.get("excerpt",""), lang=row.get("lang",""),
                          publishedAt=int(date.timestamp()*1000)))
        if len(items) == 8:
            break
    return topic, items


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=3) as executor:
        results = dict(executor.map(fetch_topic, TOPICS))
    print(json.dumps(dict(items=[row for items in results.values() if items for row in items],
                          failed=[topic for topic, items in results.items() if items is None])))
