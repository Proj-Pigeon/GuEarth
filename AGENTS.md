# AGENTS.md

Guidance for AI coding agents working in this repository. Read this file before making changes.

## Project

**GuEarth** (GitHub: `Proj-Pigeon/GuEarth`) is an Electron desktop "digital
earth" for geography education — a local, Google-Earth-style 3D globe with terrain, integrated
map data providers, an AI globe assistant ("EOQ agent"), and teaching/drawing tools.

## Technical Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Shell | Electron + electron-vite | contextIsolation on, nodeIntegration off, typed preload IPC (`window.guEarth`) |
| Renderer | React 19 + Zustand 5 + **Base UI** (`@base-ui/react`) + Tailwind CSS v4 | Monochrome Light/Dark UI primitives live in `src/renderer/src/components/ui/` (`@base-ui/react` + Tailwind CSS v4 + `class-variance-authority` + `lucide-react`) alongside CSS Modules; EOQ assistant uses `@assistant-ui/react` — see [DESIGN.md](./DESIGN.md) |
| Charts | ECharts (`echarts/core` + `SVGRenderer`) | modular imports wrapped in `src/renderer/src/components/charts/EChartBase.tsx` (`LineChart.tsx` / `BarChart.tsx`) |
| 3D / Map | CesiumJS | Static assets (Workers/ThirdParty/Assets/Widgets) served from `cesium/` by the inline plugin in `electron.vite.config.ts`; `CESIUM_BASE_URL=./cesium/`. The renderer CSP must keep `'unsafe-eval'` — Cesium's bundled Knockout calls `eval` at module load, so without it the whole entry module aborts and the window is blank |
| AI | OpenAI-compatible streaming client in the main process | Provider-agnostic (DeepSeek/Qwen/OpenAI…); API keys live **only** in the main process via `safeStorage`, never in the renderer |
| Storage | JSON files in `userData` (`settings.json`, `annotations.json`, `ai-settings.json`) | credentials via `safeStorage` KeyVault; no SQLite yet |
| Packaging | electron-builder | Windows NSIS first |

**Pinned versions — do not bump casually:**

- `vite-plus` — Vite+ provides Vite 8 through the npm alias for `vite` (`@voidzero-dev/vite-plus-core`). Keep the `devDependencies` alias and the `overrides` entry aligned when upgrading Vite+.
- `typescript@^7` — the native TypeScript compiler (`tsconfig.node.json` + `tsconfig.web.json`). TypeScript 7 has no stable JS API yet, so tests that compile or parse source import TypeScript 6 from `@typescript/typescript6`. Type checking runs in `npm run check` through Vite+, so don't call `tsc` from scripts: `@typescript/typescript6` also links a TypeScript 6 `tsc` into `node_modules/.bin`.
- `@base-ui/react@^1.9` + `tailwindcss@^4.3` + `lucide-react` — headless Base UI primitives wrapped in `src/renderer/src/components/ui/` following [DESIGN.md](./DESIGN.md) monochrome Light/Dark tokens. Do not reintroduce `antd` or `@ant-design/*`.
- Electron binaries must be installed manually with the npmmirror mirror:
  `ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" node node_modules/electron/install.js`
  (otherwise `npm run dev` fails with "Electron uninstall").
- `npm run build:win` needs the electron-builder binaries mirror on networks without GitHub access:
  `ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/" npx electron-builder --win --publish never`
  (otherwise the winCodeSign download fails with "fetch failed" during packaging).
- The bundled FFmpeg is a sha256-pinned LGPLv3 build (KarinJS/FFmpeg-Builds v8.1.3):
  `win32-x64-lgpl` (`resources/bin/ffmpeg.exe`), plus `linux-x64-lgpl` and `linux-arm64-lgpl`
  (`resources/bin/<arch>/ffmpeg` for packaging, and `resources/bin/ffmpeg` for the host dev
  tree). `npm run fetch:ffmpeg` provisions that host build on Windows and Linux only; there is
  no macOS binary, and macOS recording uses the separate WebCodecs encoder in
  `src/main/offscreenMac.ts`. `npm run build:linux` fetches both Linux architectures
  (`npm run build:win` still fetches the Windows build). Recording on Windows and Linux encodes
  with built-in `libopenh264` (`-c:v libopenh264 -profile:v high -b:v 2M`). Do not reintroduce
  `@ffmpeg-installer` — a GPLv3 x264 build that also shipped an npm token in its package.

## Architecture

```
src/main/       Main process: window, KeyVault, AI proxy (streaming), tile cache, auto-updater
src/preload/    contextBridge API + type declarations
src/renderer/   React app: globe view, layer registry, drawing tools, EOQ assistant UI
```

- The renderer never touches Node APIs or secrets. All privileged work goes through IPC.
- EOQ agent loop: renderer chat → main-process LLM call → model tool calls (`fly_to` / `set_layer`
  / `query_population` / `record_video` …) dispatched to renderer globe APIs → results fed back →
  streamed answer. Globe tools are registered renderer-side; place-search, web-search and
  memory/knowledge tools run in the main process (`agent.ts`); new capabilities = new tool
  definitions.
- Map providers (OSM, Mapbox, ArcGIS) implement a unified `LayerProvider`
  interface; terrain providers are pluggable for future offline terrain packs.

## Roadmap

Core platform:

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Scaffold: electron-vite + TS + Vue + Cesium build | Done (`1a61c43`) |
| 1 | Globe core: viewer, camera, fly-to, basemap layers, layer-manager skeleton | Done |
| 2 | Multi-provider layers, API-key settings (encrypted), terrain providers, tile cache | Done |
| 3 | Teaching tools: draw point/line/polygon, measure distance/area, annotations, persistence | Done |
| 4 | EOQ agent: provider-agnostic AI settings, streaming chat, tool-calling bridge | Done |
| 5 | Packaging (CI-built NSIS + GitHub Release), hash-verified auto-updater, offline groundwork, performance; shrink the installer (custom minimal FFmpeg build) | In progress (offline packs, perf & installer size open, see issue #33) |

Teaching modules (人教版高中地理 mapping; thematic layers live in `src/renderer/src/thematic/`, registered in `useThematicLayers.ts`):

| Module | Scope | Status |
| --- | --- | --- |
| M1 | Earth's motion: solar terminator timeline (date/hour, solstice/equinox presets), day-length & noon-altitude charts, solar apparent-path sky-dome panel, adjustable-obliquity explorer (subsolar range + five-zone bands), rotation speed & sidereal/solar day demo, temperature-zones layer with subsolar-point marker (annual "regression" playback), Coriolis demo layer, timezone compare tool, `set_sim_time`/`query_solar` AI tools | Done |
| M2 | Atmosphere: pressure/wind belt layer (Jan/Jul shift), global Köppen zones, thematic-entity picking + AI explain, frontal-cyclone anchored overlay, `set_layer` tool, thermal-circulation animated panel (sea-land/valley/urban breezes), atmospheric heating process panel (weakening + greenhouse insulation, day/night & cloud states), vertical atmospheric layers panel (height-temperature profile), typhoon layer (structure anchored overlay + historical real tracks) | Done |
| M3 | Landforms: plate boundaries + USGS earthquakes/volcanoes (dataset fetch + cache in main process), `explain_landform` tool, teaching tools unified into bottom-toolbar Lab card, fold-fault cross-section panel with real-site flyovers, river-landform panel (upper/middle/lower reaches + real terrain elevation profiles via `sampleTerrainMostDetailed`), landform guide panel (karst/yardang/glacial/coastal/loess site flyovers), exogenic-process chain panel, earth-interior layers cross-section panel | Done |
| M4 | Ocean: ENSO phase layer (El Niño / La Niña SST anomaly + Walker circulation overlay + Niño3.4 box + phase panel), water-cycle animated panel with camera linkage, ocean temperature/salinity latitude profiles, tide & wave panel, river recharge & discharge panel, ocean-current + wind-belt linkage entry | Done |
| M5 | Integrality/zonation (Sel. Compulsory 1): `mountainZonation.ts` (five teaching mountains with south/north slope belts, snowlines, transects) + `notablePeaks.ts` (77-peak catalogue with `findPeaksNear`/`nearestPeaks`), ZonationPanel (belt-spectrum SVG with per-aspect snowlines, real sampled terrain profile along the transect, belt legends, zonation principles), guided transect flights (`lib/transect.ts` great-circle/bearing/flight-planning math + `useTransectFlight` terrain-safe flight with smooth per-sample altitude profile, invisible two-pass concurrent tile preload, enlarged tile cache during flight and auto-cleared overlay polyline, global flight-progress HUD via the zonation store `flightHud` + `ZonationFlightHud.tsx`, renderer AI tools `find_peaks` + `fly_transect`), zonation store + TeachingLab chapter 第五章·自然环境的整体性与差异性 + `open_panel` id, agent guidance line, two tool knowledge entries, `tests/mountain-zonation.test.mjs` + `tests/notable-peaks.test.mjs` | Done |
| M6 | Population (choropleth foundation, issue #39 Phase A): province GeoJSON served from `resources/geo/china-provinces.geojson` (vendored DataV GeoAtlas, GCJ-02, read via `datasets:provinces` IPC), province-level choropleth layer with census-binned coloring + click info cards, Hu line layer with east/west anchored overlay cards, migration-flow arrow layer, PopulationPanel (pyramid / urbanization / Hu-line tabs) + `BarChart` wrapper, `query_population` AI tool, `entries-human.json` knowledge file | Done |
| M7 | Cities & towns (issue #39 Phase B): amap `place/around` POI statistics with 20-category aggregation (`poiStatistics` in `src/main/ai/amap.ts`, main-process `poi_statistics` AI tool + `places:poi-statistics` IPC), city-tiers layer (five-tier cities with service-radius rings, clickable), functional-zones layer switchable across seven real cities (`functionalZoneCities`: Wuhan, Shanghai, Beijing, Guangzhou, Shenzhen, Chengdu, Shenyang — CBD/commercial cores, outer-ring residential districts, edge/transport-aligned industrial zones incl. Shougang relocation and Tiexi redevelopment cases; city switcher embedded in the legend, `set_layer` accepts a `city` parameter), CitiesPanel (tier table + central-place POI verification via high/low center comparison), `urbanCities.ts` data file, four new knowledge entries, optional VIIRS night-lights basemap (`viirs-night` provider via NASA GIBS Black Marble through the `guearth-tile` proxy, layer-manager "夜光" category) | Done |
| M8 | Industry & agriculture location (issue #39 Phase C): `agri-regions` layer (nine commodity-grain bases + cotton/sugarcane/beet belts as hand-traced polygons, `agriculturalRegions.ts`), `industrial-bases` layer (four bases with pillar factors, `industrialBases.ts`), `industrial-transfers` flow-arc layer reusing the migration-arc primitives, main-process `analyze_location` AI tool (`locationAnalysis.ts`: POI composition + knowledge retrieval, elevation via `query_terrain` renderer round-trip in the agent), three knowledge entries, `tests/agri-regions.test.mjs` | Done |
| M9 | Transportation (issue #39 Phase C): `hsr-network` layer (fifteen trunk lines with `openedYear`, per-year visibility via CallbackProperty, `hsrLines.ts`), `YearTimeline.tsx` (slider + rAF playback 2008-2025) + `TransportPanel` (mileage growth chart, opened-line counter, terrain-safe case flyovers), `transport` Zustand store wired into TeachingLab/open_panel, two knowledge entries, `tests/hsr-lines.test.mjs` | Done |
| M10 | Environment & development (issue #39 Phase C): `sea-level-rise` inundation simulation (coastal lowland grids for Bohai rim / Yellow River delta / Subei / Yangtze delta / PRD sampled via `sampleTerrainMostDetailed` with `globe.getHeight` fallback, results cached in `seaLevelRise.ts`, +0.5/1/2/5 m scenarios via destroy-rebuild watcher, retryable `sea-level-terrain` failure scope), EnvironmentPanel (scenario picker, per-zone area chart, zone flyovers), two knowledge entries, `tests/sea-level.test.mjs` | Done |
| Phase C tooling | Decision & evaluation tooling (issue #39 Phase C): LocationDecisionPanel location-decision sandbox (four real-site cases with factor toggles + gaokao-structured AI critique prompt, `decisionSandbox.ts`), Socratic agent mode (`socraticEnabled` across preload/shared/settingsStore/agent system prompt + AI-settings "教学" tab), decision knowledge entry, `tests/decision-sandbox.test.mjs` | Done |
| Far-term (Sel. Compulsory 2–3) | Food security, regional development, industrial-transfer deep-dive (issue #39 Beyond) | Planned |

## Commands

```bash
npm run dev        # electron-vite dev server + app
npm run build      # production build
npm run fetch:ffmpeg   # pinned LGPL FFmpeg for Windows or Linux into resources/bin
npm run build:linux    # AppImage + deb for Linux x64 and arm64
npm run check      # vp check: lint and type checks (format is off for now), run by CI
npm test           # Vitest unit tests through Vite+ (tests/*.test.mjs), run by CI
```

Vite+ config lives in `vite.config.mts`, on top of the `@liangmi/vp-config` preset. Rules that don't fit GuEarth are turned off there with a reason. Disable a rule inline only with `// oxlint-disable-next-line <rule> -- <reason>`. Import test APIs from `vite-plus/test`, not `vitest`.

Vitest uses native Node.js imports (`experimental.viteModuleRunner: false` in `vite.config.mts`), so the `module.registerHooks` fixtures in the tests can load React components and simulate filesystem failures.

## Docs

- https://ant.design/llms.txt

## Conventions

- **UI**: Use the Base UI primitives in `src/renderer/src/components/ui/` (`@base-ui/react` + Tailwind CSS v4 + `lucide-react`) with CSS Modules and the monochrome Light/Dark tokens in [DESIGN.md](./DESIGN.md) (and `@assistant-ui/react` for the EOQ assistant). All visual decisions — colors, typography, spacing, radii, elevation, motion, component states — are governed by DESIGN.md; keep UI chrome strictly monochrome and reserve color for semantic status feedback and scientific geography data. Custom components only where the primitive kit has no equivalent (e.g. globe-anchored overlays), built from DESIGN.md CSS variables. Every `<Button loading={...}>` must pass its icon via the `icon` prop rather than as JSX children.
- **No code comments** in any file type. Encode reasoning in names, structure, and tests.
- **Commit messages and PR titles/descriptions in English.** Conversation with the user in
  Chinese.
- Renderer root is `src/renderer`. Cesium's static assets are served and copied by the inline
  `cesiumStaticPlugin` in `electron.vite.config.ts`; do not swap in a glob-based copy plugin —
  on Windows it nests the full source path under `dest`, and `rename.stripBase` miscounts
  backslash-separated segments.
- Verify UI changes by running `npm run dev` and exercising the feature; report explicitly if a
  change could not be visually verified.
- **Updater contract**: packaged Windows x64 and the Linux packages this repo ships (AppImage and
  deb, x64 and arm64) check `GET {base}/update/{platform}/{currentVersion}` on the hazel server
  (`https://guearth-updater.isla.fan`, override with `GUEARTH_UPDATE_URL`). `{platform}` is hazel's
  alias for that package: `win32`, `appimage`, `appimage_arm64`, `deb`, or `deb_arm64`. The manifest
  may ship a `sha256` field (lowercase hex). The stock hazel deployment does not, so the client
  resolves the digest itself from the GitHub releases API (`asset.digest` of the asset the manifest
  `url` points at — computed by GitHub at upload time). The asset filename must classify as that
  same hazel platform, so an arm64 client cannot install the x64 file an unsuffixed route would
  return. When the digest is missing, the filename does not match, or the remote version is not an
  upgrade, the update is ignored (fail closed). The client re-verifies cached and about-to-launch
  installers. Windows launches the NSIS installer; an AppImage replaces the running file and
  relaunches; a deb install runs `pkexec dpkg -i` (or `dpkg -i` as root) and relaunches. Dev builds
  can opt in with `GUEARTH_UPDATE_URL` and, on Linux, `GUEARTH_UPDATE_PACKAGE=appimage|deb`. Ops
  note: the hazel deployment still points at the pre-transfer slug `HikaruQwQ/GuEarth` and only
  works through GitHub's transfer redirect — a replacement update source must take over the
  `guearth-updater.isla.fan` domain. Do not add a self-deployed update-server implementation to
  this repository; client-side digest resolution makes one unnecessary.
- **Distribution compliance**: never bundle GPL components. Keep FFmpeg on the pinned LGPL
  build; license texts and source offers ship from `resources/licenses/` + `THIRD-PARTY-NOTICES.md`;
  the NSIS license page summarizes them from `build/license.txt` (UTF-8 with BOM).
