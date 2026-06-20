# HCZ Local Bidding Agent

Windows-side bidding collection Agent for websites that need employee login,
captcha, SMS, CA, or local browser state.

Current local-agent phase:

- Local HTTP API on `http://127.0.0.1:17321`.
- Health probe for ERP: `GET /health`.
- Local task lifecycle:
  - `GET /site-profiles`
  - `GET /tasks`
  - `POST /tasks`
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
