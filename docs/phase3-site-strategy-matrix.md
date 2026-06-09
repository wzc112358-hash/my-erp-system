# Phase 3 Site Strategy Matrix

Generated from `agent-service/src/source-classification.js`.

| Website | Owner | Phase 3 Path | First Tool | Fallback | Notes |
| --- | --- | --- | --- | --- | --- |
| 中石油招投标网 | 小陈 | local_helper | local_playwright_cdp | manual_only | 2026-06-02 实测：JS 单页应用，公共接口指向内网 10.134.x，/cms 与 /api 返回 404/空，云端无法直采。 |
| 云梦泽询价网 | 小陈/小白 | local_helper | local_playwright_cdp | manual_only | Requires account login and tender detail/material access. |
| 能源一号（兰州恒化成） | 小陈 | local_helper | local_playwright_cdp | manual_only | Company account and regional login state are expected. |
| 能源一号（北京恒化成） | 小白 | local_helper | local_playwright_cdp | manual_only | Company account and regional login state are expected. |
| 能源一号（天津宜远） | 小杨 | local_helper | local_playwright_cdp | manual_only | Company account and regional login state are expected. |
| 华锦兵器网 | 小魏 | local_helper | local_playwright_cdp | manual_only | Server-side browser returned empty response; use employee Windows browser environment. |
| 易派克 | 小冯 | cloud_then_local | http_html | local_helper | 2026-06-02 实测：ec.sinopec.com 首页服务端渲染公告列表，http_html 直采成功（新增 sinopec 适配器）；详情/8位码需登录走本地助手。 |
| 延长石油 | 小杨/小冯 | cloud_then_local | playwright_network | local_helper | 2026-06-02 实测：列表由 tenderA.js 异步加载，静态 http_html 无公告行；云端需 JS 渲染，失败转本地助手。 |
| 中化 | 小杨 | local_helper | local_playwright_cdp | manual_only | 2026-06-02 实测：Vue 单页应用，网关公告接口直连 404，需登录上下文，转本地助手。 |
| 东华能源网 | 小杨 | manual_only | manual_text | manual_only | Entry URL is missing from current materials. |
| 国能网 | 小杨 | cloud_auto | http_html | local_helper | Public E招/E购 list pages exist. |
| 国能E招 | 小杨 | cloud_auto | http_html | local_helper | Public list page exists. |
| 国能E购 | 小杨 | cloud_auto | http_html | local_helper | Public list page exists. |
| 中海油 | 小杨 | local_helper | local_playwright_cdp | manual_only | 2026-06-02 实测：JS 单页应用，businessannouncement/page 接口返回维护占位页，无公开 JSON，转本地助手。 |
| 裕龙招投标网 | 小白 | cloud_then_local | playwright_network | local_helper | Public platform search requires “裕龙石化”, but live test hit NetEase safety verification; cloud keeps network probing only, fallback to local helper. |
| 隆道云 | 小魏 | local_helper | local_playwright_cdp | manual_only | Details available after login. |
| 金能招标网 | 小魏 | local_helper | local_playwright_cdp | manual_only | Login required for multiple notice columns. |

## Verification Checklist

Each site must record:

- Entry URL reachable.
- List candidates extracted.
- Detail page reachable.
- Title, publish date, buyer, and deadline extraction.
- Login/captcha/attachment barrier status.
- Final recommendation: cloud, cloud with local fallback, local helper, or manual only.


## Live Collection Notes - 2026-05-27

| Site | Tool Tried | Result | Recommendation |
| --- | --- | --- | --- |
| 国能E招 | `http_html` + site adapter | Success. Public list returned 15 notice candidates with title, link, and publish date. Deadline needs detail-page enrichment later. | Keep `cloud_auto` using `http_html`. |
| 国能E购 | `playwright_network` discovery, then `http_json` OSS feeds | Success. Discovered public OSS JSON feeds such as `inquireOne/index.json` and `inquireBidding/index.json`; each row includes title, link, publish time, quote deadline, and publish area. | Keep `cloud_auto`, but use `http_json` not generic page HTML. |
| 裕龙招投标网 / 中国招标投标公共服务平台 | `http_html`, `crawl4ai`, `scrapling`, `playwright_network` | Homepage is reachable, but search for “裕龙石化” triggers NetEase safety verification and encrypted API payload. Plain homepage scraping only returns platform/news noise. | Downgrade from `cloud_auto` to `cloud_then_local`; cloud can try network probing, local helper should handle verification. |

Notes:

- `国能E招` generic anchor parsing was too noisy; the collector now uses a list-row adapter for `chnenergybidding.com.cn`.
- `国能E购` should not scrape `index-Inquiries.html` directly because it renders from JSON feeds and static templates.
- `裕龙` should not be marked “无新增” from homepage scraping; if the search endpoint is blocked, it must produce a local-helper task or structured failure.


## Live Collection Notes - 2026-06-02 (Phase 3.3 cloud-then-local verification)

All probes were run from the Beijing server (this list covers the five Phase 3.3 cloud-then-local
candidates). The dev box cannot reach any of these sites; the server reaches all of them.

| Site | Tool Tried | Result | Recommendation |
| --- | --- | --- | --- |
| 易派克 (ec.sinopec.com) | `http_html` + new `sinopec` list adapter | Success (live 2026-06-02 from server: 74 KB page → **40 active notices, 0 result/award leaked**). `/supp/index.shtml` is server-rendered; anchors `<a href="/f/supp/notice/*.do" title="…公告">` yield the full notice list. Adapter filters result/award公示 (评标结果/中标结果/流废标) and keeps 采购/招标/询价/询比/竞价/谈判 notices. 小冯 资料亦确认“不需要登录可以查”。 | Keep `cloud_then_local`, `http_html`. Detail pages / 8-digit code / 买标 still need login → local helper. |
| 延长石油 (zc.sxycpc.com) | `http_html`, JS inspection | Cloud-blocked for `http_html`: the static `menu0002.html` has no notice rows; rows are injected by `js/tenderA.js` via an AJAX call whose endpoint is not exposed as a plain string. `bulletin.sntba.com` uses `javascript:bidSearch('NN')` (JS POST). | Keep `cloud_then_local` but first tool = `playwright_network` (needs JS render); fall back to local helper. No `http_html` adapter added. |
| 中石油招投标网 (cnpcbidding.com) | `http_html`, bundle/API discovery | Cloud-blocked. JS SPA (`app.js`/`chunk-libs.js`); `config.js` API `baseUrl` points to internal `http://10.134.25.236:8500`; public `/cms` returns 1-byte, `/api/index` 404. No reachable public list API. | Downgrade `cloud_then_local` → `local_helper`. |
| 中化 (scm.esinochem.com) | `http_html`, bundle/API discovery | Cloud-blocked for now. Vue2 SPA, `apiroot:'/gateway'`. Bundle references `notice/outer/page/queryPageList`, but a direct `GET`/`POST` to `/gateway/notice/outer/page/queryPageList` returns HTTP 404 (needs app context/token). Lead recorded for a future slice. | Downgrade `cloud_then_local` → `local_helper`. |
| 中海油 (bid.cnooc.com.cn) | `http_html`, bundle/API discovery | Cloud-blocked. SPA at `/home/`; `main.*.js` references `indexHome/background/businessannouncement/page`, but that path returns a maintenance/placeholder HTML page, not JSON. | Downgrade `cloud_then_local` → `local_helper`. |

Net Phase 3.3 outcome: **1 new cloud source** (易派克 via `http_html` + `sinopec` adapter); **3 SPA sites
downgraded to local_helper** (中石油 / 中化 / 中海油) with recorded evidence; **延长石油 stays
cloud_then_local** but requires JS rendering (no `http_html` adapter). 中化's gateway endpoint is a
documented lead for a later cloud attempt.
