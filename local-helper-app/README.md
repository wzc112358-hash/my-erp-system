# HCZ Local Bidding Agent

Windows-side bidding collection Agent for websites that need employee login,
captcha, SMS, CA, or local browser state.

Current local-agent phase:

- Local HTTP API on `http://127.0.0.1:17321`.
- Health probe for ERP: `GET /health`.
- Local task lifecycle:
  - `GET /site-profiles`
  - `GET /tasks`
  - `GET /agent-tools`
  - `GET /agent-runs`
  - `GET /agent-runs/:id`
  - `POST /tasks`
  - `POST /tasks/:id/agent-run`
  - `POST /tasks/:id/run`
  - `POST /tasks/:id/continue-run`
  - `POST /tasks/:id/cancel`
- Optional legacy cloud pairing and task channel:
  - `POST /cloud/pair`
  - `POST /cloud/heartbeat`
  - `GET /cloud/tasks`
  - `POST /cloud/tasks/:id/start`
  - `POST /cloud/tasks/:id/continue`
  - `POST /cloud/tasks/:id/cancel`
- Config-driven multi-site harness (`site-harness.ts` + `site-profiles.ts`):
  - Detects login/captcha/SMS/CA/blank-page states and returns `request_human`.
  - Continues after employee takeover and extracts visible notice text into a `CandidateBundle`.
  - Each site is just a `SiteHarnessProfile` entry; second-batch sites registered:
    华锦兵器网, 易派克, 云梦泽询价网, 能源一号（兰州/北京/天津）, 隆道云, 金能招标网.
    `profileFor(sourceName)` falls back to a generic profile for any unregistered site.
- Deep link target reserved by ERP: `hcz-helper://task/{taskId}` (and `hcz-helper://pair?...`).
- Electron tray shell:
  - Registers `hcz-helper://`.
  - Starts the local API in the background.
  - Opens the local task desk by default.
  - Tray menu shows local mode, a cloud upload settings entry, ERP link, local health link, and exit.
- First-run pairing window (`src/renderer/pair.html` + `pair.js`, logic in `src/pairing.ts`):
  - Kept as optional cloud upload settings.
  - Employee enters 云端地址 + 配对码 (+ optional 设备名); the window POSTs `/cloud/pair`
    to the local API and shows the connection result. No node integration in the page.
- Playwright local browser runtime:
  - Uses a persistent Chrome profile directory for login/cookie reuse.
  - Captures visible text and screenshots for local-helper observations.
  - `/tasks/:id/run` opens a local task; `/tasks/:id/continue-run` extracts candidates after employee takeover.
- Controlled local Agent tool layer:
  - `/tasks/:id/agent-run` runs public link discovery, opens the best local browser entry, and extracts candidates when possible.
  - Each Agent run is persisted under the local helper data directory as `agent-runs/<runId>/run.json` plus ordered `steps.jsonl`.
  - `/agent-tools` exposes the built-in tool manifest plus planned MCP server status for Chrome DevTools MCP, Firecrawl MCP, and PDF Reader MCP.
  - ReAct collection runs through `react-planner.ts` + `react-collection-agent.ts`: plan the next action, call a tool, observe/extract, then finish or request employee takeover.
  - Tool calls are recorded through `agent-toolbox.ts`, so search/browser/document actions share one audit shape in the run log.
  - Firecrawl/Search is optional; configure `FIRECRAWL_API_KEY` or `HCZ_FIRECRAWL_API_KEY` to enable Firecrawl `/v2/search`.
  - Without a Firecrawl key, the Agent falls back to the task entry URL and still works as the existing local browser flow.
  - LLM summary is optional; configure `HCZ_LOCAL_AGENT_LLM_BASE_URL`, `HCZ_LOCAL_AGENT_LLM_API_KEY`, and `HCZ_LOCAL_AGENT_LLM_MODEL` to enable it.
  - The task desk also exposes local model settings (`baseUrl`, API key, and model). Saved local settings take precedence for `/tasks/:id/agent-run`.
  - No Firecrawl or LLM key is bundled into the installer.
- Product-intelligence layer:
  - Seed product knowledge lives in `src/data/product-terms.seed.json`.
  - Candidate bundles are converted into local opportunity cards with product hits,
    relevance score, evidence, missing information, and a WeChat-ready summary.
  - Without an LLM key, opportunity cards still use deterministic product matching.
  - Each card can run a local "查清楚" deep-read pass that opens the detail URL,
    captures visible text/screenshot, attempts PDF/DOCX/text attachment extraction,
    and refreshes only that card's assessment.
  - WeChat copy helpers are available for one opportunity, one site task report,
    and the whole daily digest. The generated text is grouped into focus,
    pending manual check, and low-relevance/no-new sections.
  - Opportunity feedback buttons mark cards as valuable, irrelevant, ask boss,
    sent to group, or followed up. Feedback is stored on the local card, adjusts
    the card grouping score, and prepares an ERP `opportunity_reviews` draft for
    later upload.
  - Feedback learning is persisted locally. Positive feedback raises learned
    product-term weight, irrelevant feedback lowers it, and repeated notices can
    automatically reuse prior employee judgment. The task desk shows a compact
    learning summary and can clear the local learning data for testing.
  - The daily priority board combines relevance score, recommended action,
    employee feedback, learned weights, and deadline urgency. The task desk
    shows the top opportunities for the day and can copy a WeChat-ready priority
    checklist.
  - Local daily schedules can create or run recurring collection tasks by site
    and time. Each schedule can run the controlled Agent, open the browser for
    human login/verification, or only create a pending task.

Run locally:

```bash
npm start
```

Test:

```bash
npm test
```

Build the JavaScript bundles:

```bash
npm run build
```

Build Windows release artifacts:

```bash
npm run package:release
```

This writes the ERP download artifacts to `../frontend/public/downloads/`:

- `hcz-local-helper-app.zip`
- `hcz-local-helper-setup.exe` when NSIS can run
- `hcz-local-helper-release.json`
- `SHA256SUMS.txt`

For local Windows testing, you can use the generated installer directly from
`release/恒化成本地采集助手 Setup <version>.exe`. Do not deploy to the ERP frontend
until the local collection loop is accepted.

Build only the unpacked app directory:

```bash
npm run package:win-unpacked
```

The generated app is under `release/win-unpacked/` and contains
`恒化成本地采集助手.exe`.

Build the NSIS installer from Linux/WSL without installing wine locally:

```bash
docker run --rm \
  -e ELECTRON_CACHE=/root/.cache/electron \
  -e ELECTRON_BUILDER_CACHE=/root/.cache/electron-builder \
  -e HCZ_DOWNLOADS_DIR=/repo/frontend/public/downloads \
  -v "$PWD/..:/repo" \
  -v "$HOME/.cache/electron:/root/.cache/electron" \
  -v "$HOME/.cache/electron-builder:/root/.cache/electron-builder" \
  electronuserland/builder:wine \
  /bin/bash -lc 'cd /repo/local-helper-app && npm ci && npm run package:release'
```

Deploy the generated ERP download files without building on the server:

```bash
npm run deploy:downloads
```

This uploads `frontend/public/downloads/` to the ERP server repo and the running
`erp-frontend` container. It does not run Electron packaging, `npm install`, or
`docker compose build` on the server. Override defaults with `HCZ_DEPLOY_HOST`,
`HCZ_SSH_KEY`, `HCZ_REMOTE_REPO`, or `HCZ_FRONTEND_CONTAINER` if needed.

Pair with cloud API:

```bash
curl -X POST http://127.0.0.1:17321/cloud/pair \
  -H 'Content-Type: application/json' \
  -d '{"cloudUrl":"https://agent.henghuacheng.cn","code":"PAIRCODE","deviceName":"WX-PC-01","deviceFingerprint":"WX-PC-01"}'
```

Cloud pairing UI: **optional** — the app can work in local mode without pairing, and
the tray exposes a cloud upload settings entry for compatibility with the legacy task channel.

Packaging notes:

- The one-file installer is built as `release/恒化成本地采集助手 Setup <version>.exe`
  and published as `frontend/public/downloads/hcz-local-helper-setup.exe`.
- The NSIS installer uses a guided install flow, creates desktop/start-menu shortcuts,
  and launches the helper after installation so the employee can pair with the cloud
  and open local collection tasks immediately.
- On Windows, `npm run package:release` works directly. On Linux/WSL, either install `wine`
  locally or use the Docker command above. `electron-builder` downloads the NSIS toolchain
  automatically.
- If the app appears to do nothing after double-clicking, check
  `%LOCALAPPDATA%\HengHuaChengLocalHelper\startup.log`. Startup errors are written there,
  and local API port failures show an error dialog.
- Before release: add a company icon (`build/icon.ico`) and signer metadata so SmartScreen
  shows the publisher.
