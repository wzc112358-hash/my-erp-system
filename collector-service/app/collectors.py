import json
import re
from html import unescape
from urllib.parse import urljoin


NOTICE_RE = re.compile(r"(招标|采购|询价|询比|竞价|谈判|公告|采办)")
TAG_RE = re.compile(r"<[^>]+>")
ANCHOR_RE = re.compile(
    r"<a\b[^>]*href=[\"']([^\"']+)[\"'][^>]*>([\s\S]*?)</a>",
    re.IGNORECASE,
)
CHNENERGY_NOTICE_RE = re.compile(
    r"<li\b[^>]*class=[\"'][^\"']*right-item[^\"']*[\"'][^>]*>([\s\S]*?)</li>",
    re.IGNORECASE,
)
CHNENERGY_LINK_RE = re.compile(
    r"<a\b(?=[^>]*class=[\"'][^\"']*infolink[^\"']*[\"'])(?=[^>]*href=[\"']([^\"']+)[\"'])(?=[^>]*title=[\"']([^\"']+)[\"'])[^>]*>",
    re.IGNORECASE,
)
# 易派克(中石化)首页公告锚点：href 指向 notice/*.do，title 为公告全名（href/title 顺序不固定，用前瞻捕获）。
SINOPEC_LINK_RE = re.compile(
    r"<a\b(?=[^>]*href=[\"']([^\"']*notice/[^\"']+\.do[^\"']*)[\"'])(?=[^>]*title=[\"']([^\"']+)[\"'])[^>]*>",
    re.IGNORECASE,
)
# 排除结果/中标/流废标类公示，只保留可投标的采购/招标/询价/竞价公告。
SINOPEC_EXCLUDE_RE = re.compile(
    r"(结果公告|结果公示|评标结果|中标结果|中标候选|成交结果|成交公告|中标公告|流标|废标|终止公告)"
)
DATE_RE = re.compile(r"(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})")


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", unescape(TAG_RE.sub(" ", value or ""))).strip()


def urls_for_source(source: dict) -> list[str]:
    category_urls = [
        item.strip()
        for item in re.split(r"[,，\n]+", str(source.get("category_urls") or ""))
        if item.strip()
    ]
    if category_urls:
        return category_urls
    source_url = str(source.get("source_url") or "").strip()
    return [source_url] if source_url else []


def is_notice_title(title: str) -> bool:
    if not title or len(title) < 4:
        return False
    if title in {"更多", "查看更多", "招标公告", "采购公告", "公告信息"}:
        return False
    return bool(NOTICE_RE.search(title))


def normalize_date(value: str) -> str:
    match = DATE_RE.search(value or "")
    if not match:
        return ""
    year, month, day = match.groups()
    return f"{year}-{int(month):02d}-{int(day):02d}"


def candidate_item(title: str, url: str, published_at: str = "", confidence: float = 0.72) -> dict:
    return {
        "title": title,
        "url": url,
        "published_at": published_at,
        "deadline_at": "",
        "buyer_name": "",
        "raw_text": title,
        "attachments": [],
        "evidence": [title],
        "extraction_confidence": confidence,
    }


def collect_chnenergy_items(url: str, html: str) -> list[dict]:
    items = []
    seen = set()
    for raw_li in CHNENERGY_NOTICE_RE.findall(html or ""):
        link_match = CHNENERGY_LINK_RE.search(raw_li)
        if not link_match:
            continue
        href, raw_title = link_match.groups()
        title = normalize_text(raw_title)
        if not is_notice_title(title):
            continue
        absolute_url = urljoin(url, unescape(href))
        if absolute_url in seen:
            continue
        seen.add(absolute_url)
        items.append(candidate_item(
            title=title,
            url=absolute_url,
            published_at=normalize_date(raw_li),
            confidence=0.86,
        ))
    return items


def collect_sinopec_items(url: str, html: str) -> list[dict]:
    items = []
    seen = set()
    for href, raw_title in SINOPEC_LINK_RE.findall(html or ""):
        title = normalize_text(raw_title)
        if not is_notice_title(title) or SINOPEC_EXCLUDE_RE.search(title):
            continue
        absolute_url = urljoin(url, unescape(href))
        if absolute_url in seen:
            continue
        seen.add(absolute_url)
        items.append(candidate_item(title=title, url=absolute_url, confidence=0.84))
    return items


# 站点专用列表适配器：命中 host 时优先使用，否则回落到通用锚点解析。
HTML_SITE_ADAPTERS = (
    ("chnenergybidding.com.cn", collect_chnenergy_items),
    ("ec.sinopec.com", collect_sinopec_items),
)


def collect_site_items(url: str, html: str) -> list[dict]:
    for host, adapter in HTML_SITE_ADAPTERS:
        if host in url:
            return adapter(url, html)
    return []


def collect_from_json_text(source: dict, url: str, text: str, mode: str = "http_json") -> dict:
    items = []
    try:
        payload = json.loads(text or "{}")
    except json.JSONDecodeError:
        payload = {}
    for row in payload.get("rows") or []:
        title = normalize_text(row.get("title") or row.get("noticeName") or row.get("enquiryOrderName") or "")
        link = row.get("link") or row.get("url") or row.get("noticeUrl") or ""
        if not title or not link:
            continue
        items.append({
            **candidate_item(
                title=title,
                url=urljoin(url, unescape(link)),
                published_at=normalize_date(row.get("publishTime") or row.get("noticeSendTime") or ""),
                confidence=0.9,
            ),
            "deadline_at": normalize_date(row.get("quotDeadline") or row.get("deadline") or ""),
            "buyer_name": normalize_text(row.get("publishArea") or row.get("buyerName") or ""),
            "raw_text": normalize_text(" ".join([
                title,
                row.get("publishArea") or "",
                row.get("quotDeadline") or "",
            ])),
        })

    return {
        "source_id": source.get("source_id") or source.get("id") or "",
        "source_name": source.get("source_name") or "",
        "owner_name": source.get("owner_name") or "",
        "mode": mode,
        "url": url,
        "status": "success" if items else "no_new",
        "candidates": items,
        "error": "",
    }


def collect_from_html(source: dict, url: str, html: str, mode: str = "http_html") -> dict:
    items = collect_site_items(url, html)
    seen = set()
    for href, raw_title in ([] if items else ANCHOR_RE.findall(html or "")):
        title = normalize_text(raw_title)
        if not is_notice_title(title):
            continue
        absolute_url = urljoin(url, unescape(href))
        fingerprint = f"{source.get('source_name') or ''}|{absolute_url or title}"
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        items.append(candidate_item(title=title, url=absolute_url))

    return {
        "source_id": source.get("source_id") or source.get("id") or "",
        "source_name": source.get("source_name") or "",
        "owner_name": source.get("owner_name") or "",
        "mode": mode,
        "url": url,
        "status": "success" if items else "no_new",
        "candidates": items,
        "error": "",
    }
