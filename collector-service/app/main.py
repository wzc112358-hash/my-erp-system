from typing import Any

import httpx
from fastapi import FastAPI
from pydantic import BaseModel, Field

from .collectors import collect_from_html, collect_from_json_text, urls_for_source


class CollectUrlRequest(BaseModel):
    url: str
    source_name: str = "测试公开源"
    owner_name: str = "未分配"
    mode: str = "http_html"


class CollectSourceRequest(BaseModel):
    source: dict[str, Any] = Field(default_factory=dict)
    mode: str = "http_html"


app = FastAPI(title="ERP Collector Service", version="0.1.0")


async def fetch_text(url: str) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ERP-Collector-Service/0.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers=headers) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.text


def collect_from_text(source: dict[str, Any], url: str, text: str, mode: str) -> dict[str, Any]:
    if mode == "http_json" or url.split("?")[0].endswith(".json"):
        return collect_from_json_text(source, url, text, mode=mode)
    return collect_from_html(source, url, text, mode=mode)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "service": "collector-service"}


@app.post("/collect/url")
async def collect_url(request: CollectUrlRequest) -> dict[str, Any]:
    try:
        html = await fetch_text(request.url)
        return collect_from_text(
            {
                "source_name": request.source_name,
                "owner_name": request.owner_name,
                "source_url": request.url,
            },
            request.url,
            html,
            mode=request.mode,
        )
    except Exception as error:
        return {
            "source_id": "",
            "source_name": request.source_name,
            "owner_name": request.owner_name,
            "mode": request.mode,
            "url": request.url,
            "status": "failed",
            "candidates": [],
            "error": str(error),
        }


@app.post("/collect/source")
async def collect_source(request: CollectSourceRequest) -> dict[str, Any]:
    source = request.source
    bundles = []
    errors = []
    for url in urls_for_source(source):
        try:
            html = await fetch_text(url)
            bundles.append(collect_from_text(source, url, html, mode=request.mode))
        except Exception as error:
            errors.append(f"{url}: {error}")

    candidates = [item for bundle in bundles for item in bundle["candidates"]]
    status = "success" if candidates else "failed" if errors else "no_new"
    return {
        "source_id": source.get("source_id") or source.get("id") or "",
        "source_name": source.get("source_name") or "",
        "owner_name": source.get("owner_name") or "",
        "mode": request.mode,
        "url": ",".join(urls_for_source(source)),
        "status": status,
        "candidates": candidates,
        "error": "; ".join(errors),
    }
