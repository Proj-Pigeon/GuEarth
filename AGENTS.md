# AGENTS.md

Guidance for AI coding agents working in this repository. Read this file before making changes.

## Project

**GuEarth** (`E:\Code\GuEarth`, GitHub: `Proj-Pigeon/GuEarth`) is an Electron desktop "digital
earth" for geography education — a local, Google-Earth-style 3D globe with terrain, integrated
map data providers, an AI globe assistant ("EOQ agent"), and teaching/drawing tools.

## Technical Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Shell | Electron + electron-vite | contextIsolation on, nodeIntegration off, typed preload IPC (`window.guEarth`) |
| Renderer | Vue 3 + Pinia + **Ant Design Vue** | UI framework is Ant Design Vue — see [DESIGN.md](./DESIGN.md) |
| Charts | ECharts via `vue-echarts` | modular imports (`echarts/core` + SVGRenderer) wrapped in `src/renderer/src/components/charts/LineChart.vue` |
| 3D / Map | CesiumJS | Static assets (Workers/ThirdParty/Assets/Widgets) served from `cesium/` by the inline plugin in `electron.vite.config.ts`; `CESIUM_BASE_URL=./cesium/`. The renderer CSP must keep `'unsafe-eval'` — Cesium's bundled Knockout calls `eval` at module load, so without it the whole entry module aborts and the window is blank |
| AI | OpenAI-compatible streaming client in the main process | Provider-agnostic (DeepSeek/Qwen/OpenAI…); API keys live **only** in the main process via `safeStorage`, never in the renderer |
| Storage | JSON files in `userData` (`settings.json`, `annotations.json`, `ai-settings.json`) | credentials via `safeStorage` KeyVault; no SQLite yet |
| Packaging | electron-builder | Windows NSIS first |

**Pinned versions — do not bump casually:**

- `vite@^7` — electron-vite@5 peer range tops out at vite 7.
- `typescript@5.9.x` — TypeScript 7 (native) is incompatible with vue-tsc.
- `ant-design-vue@4.x` is the latest Vue port (4.2.6); the React antd line is at v6. The Vue port
  implements the same Ant Design token system — follow [DESIGN.md](./DESIGN.md) tokens, not the
  React v6 API.
- Electron binaries must be installed manually with the npmmirror mirror:
  `ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" node node_modules/electron/install.js`
  (otherwise `npm run dev` fails with "Electron uninstall").
- `npm run build:win` needs the electron-builder binaries mirror on networks without GitHub access:
  `ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/" npx electron-builder --win --publish never`
  (otherwise the winCodeSign download fails with "fetch failed" during packaging).

## Architecture

```
src/main/       Main process: window, KeyVault, AI proxy (streaming), tile cache, SQLite
src/preload/    contextBridge API + type declarations
src/renderer/   Vue app: globe view, layer registry, drawing tools, EOQ assistant UI
```

- The renderer never touches Node APIs or secrets. All privileged work goes through IPC.
- EOQ agent loop: renderer chat → main-process LLM call → model tool calls (flyTo / queryTerrain
  / addLayer / explainLandform) dispatched to renderer globe APIs → results fed back → streamed
  answer. Globe tools are registered renderer-side; new capabilities = new tool definitions.
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
| 5 | Packaging (CI-built NSIS + GitHub Release), hash-verified auto-updater, offline groundwork, performance | In progress (offline packs & perf open, see issue #33) |

Teaching modules (人教版高中地理 mapping; thematic layers live in `src/renderer/src/thematic/`, registered in `useThematicLayers.ts`):

| Module | Scope | Status |
| --- | --- | --- |
| M1 | Earth's motion: solar terminator timeline (date/hour, solstice/equinox presets), day-length & noon-altitude charts, solar apparent-path sky-dome panel, adjustable-obliquity explorer (subsolar range + five-zone bands), rotation speed & sidereal/solar day demo, temperature-zones layer with subsolar-point marker (annual "regression" playback), Coriolis demo layer, timezone compare tool, `set_sim_time`/`query_solar` AI tools | Done |
| M2 | Atmosphere: pressure/wind belt layer (Jan/Jul shift), global Köppen zones, thematic-entity picking + AI explain, frontal-cyclone anchored overlay, `set_layer` tool, thermal-circulation animated panel (sea-land/valley/urban breezes), atmospheric heating process panel (weakening + greenhouse insulation, day/night & cloud states), vertical atmospheric layers panel (height-temperature profile), typhoon layer (structure anchored overlay + historical real tracks) | Done |
| M3 | Landforms: plate boundaries + USGS earthquakes/volcanoes (dataset fetch + cache in main process), `explain_landform` tool, teaching tools unified into bottom-toolbar Lab card, fold-fault cross-section panel with real-site flyovers, river-landform panel (upper/middle/lower reaches + real terrain elevation profiles via `sampleTerrainMostDetailed`), landform guide panel (karst/yardang/glacial/coastal/loess site flyovers), exogenic-process chain panel, earth-interior layers cross-section panel | Done |
| M4 | Ocean: ENSO phase layer (El Niño / La Niña SST anomaly + Walker circulation overlay + Niño3.4 box + phase panel), water-cycle animated panel with camera linkage, ocean temperature/salinity latitude profiles, tide & wave panel, river recharge & discharge panel, ocean-current + wind-belt linkage entry | Done |
| M5 | Integrality/zonation: `find_peaks`, mountain vertical zonation profile, guided transect flights (`fly_transect`) | Planned |
| M6 | Population (choropleth foundation, issue #39 Phase A): province GeoJSON served from `resources/geo/china-provinces.geojson` (vendored DataV GeoAtlas, GCJ-02, read via `datasets:provinces` IPC), province-level choropleth layer with census-binned coloring + click info cards, Hu line layer with east/west anchored overlay cards, migration-flow arrow layer, PopulationPanel (pyramid / urbanization / Hu-line tabs) + `BarChart` wrapper, `query_population` AI tool, `entries-human.json` knowledge file | Done |
| M7 | Cities & towns (issue #39 Phase B): amap `place/around` POI statistics with 20-category aggregation (`poiStatistics` in `src/main/ai/amap.ts`, main-process `poi_statistics` AI tool + `places:poi-statistics` IPC), city-tiers layer (five-tier cities with service-radius rings, clickable), functional-zones layer anchored on real Wuhan districts (`wuhanFunctionalDistricts`: Jianghan Road CBD, Qingshan WISCO, Zhuankou auto city, Optics Valley, etc.), CitiesPanel (tier table + central-place POI verification via high/low center comparison), `urbanCities.ts` data file, four new knowledge entries, optional VIIRS night-lights basemap (`viirs-night` provider via NASA GIBS Black Marble through the `guearth-tile` proxy, layer-manager "夜光" category) | Done |
| M8 | Industry & agriculture location (issue #39 Phase C): `agri-regions` layer (nine commodity-grain bases + cotton/sugarcane/beet belts as hand-traced polygons, `agriculturalRegions.ts`), `industrial-bases` layer (four bases with pillar factors, `industrialBases.ts`), `industrial-transfers` flow-arc layer reusing the migration-arc primitives, main-process `analyze_location` AI tool (`locationAnalysis.ts`: POI composition + knowledge retrieval, elevation via `query_terrain` renderer round-trip in the agent), three knowledge entries, `tests/agri-regions.test.mjs` | Done |
| M9 | Transportation (issue #39 Phase C): `hsr-network` layer (fifteen trunk lines with `openedYear`, per-year visibility via CallbackProperty, `hsrLines.ts`), `YearTimeline.vue` (slider + rAF playback 2008-2025) + `TransportPanel` (mileage growth chart, opened-line counter, terrain-safe case flyovers), `transport` Pinia store wired into TeachingLab/open_panel, two knowledge entries, `tests/hsr-lines.test.mjs` | Done |
| M10 | Environment & development (issue #39 Phase C): `sea-level-rise` inundation simulation (coastal lowland grids for Bohai rim / Yellow River delta / Subei / Yangtze delta / PRD sampled via `sampleTerrainMostDetailed` with `globe.getHeight` fallback, results cached in `seaLevelRise.ts`, +0.5/1/2/5 m scenarios via destroy-rebuild watcher, retryable `sea-level-terrain` failure scope), EnvironmentPanel (scenario picker, per-zone area chart, zone flyovers), two knowledge entries, `tests/sea-level.test.mjs` | Done |
| Phase C tooling | Decision & evaluation tooling (issue #39 Phase C): LocationDecisionPanel location-decision sandbox (four real-site cases with factor toggles + gaokao-structured AI critique prompt, `decisionSandbox.ts`), Socratic agent mode (`socraticEnabled` across preload/shared/settingsStore/agent system prompt + AI-settings "教学" tab), decision knowledge entry, `tests/decision-sandbox.test.mjs` | Done |
| Far-term (Sel. Compulsory 2–3) | Food security, regional development, industrial-transfer deep-dive (issue #39 Beyond) | Planned |

## Commands

```bash
npm run dev        # electron-vite dev server + app
npm run build      # production build
npm run typecheck  # tsc (node) + vue-tsc (web)
npm test           # node:test unit tests (tests/*.test.mjs), run by CI
```

## Docs

- https://ant.design/llms.txt

## Conventions

- **UI**: Use Ant Design Vue components and the tokens in [DESIGN.md](./DESIGN.md). All visual
  decisions — colors, typography, spacing, radii, elevation, motion, component states — are
  governed by DESIGN.md; do not invent local design rules. Custom components only where Ant
  Design has no equivalent (e.g. globe-anchored overlays), built from DESIGN.md tokens.
- **No code comments** in any file type. Encode reasoning in names, structure, and tests.
- **Commit messages and PR titles/descriptions in English.** Conversation with the user in
  Chinese.
- Renderer root is `src/renderer`. Cesium's static assets are served and copied by the inline
  `cesiumStaticPlugin` in `electron.vite.config.ts`; do not swap in a glob-based copy plugin —
  on Windows it nests the full source path under `dest`, and `rename.stripBase` miscounts
  backslash-separated segments.
- Verify UI changes by running `npm run dev` and exercising the feature; report explicitly if a
  change could not be visually verified.
- **Updater contract**: the update manifest at `GET {base}/update/win32/{currentVersion}` may ship
  a `sha256` field (lowercase hex) for the installer it advertises. The stock hazel deployment
  (`guearth-updater.isla.fan`) does not, so the client resolves the digest itself from the GitHub
  releases API (`asset.digest` of the asset the manifest `url` points at — computed by GitHub at
  upload time). When neither source yields a valid lowercase-hex digest the update is ignored
  (fail closed). The client re-verifies cached and about-to-launch installers and ignores
  non-upgrade versions. Ops note: the hazel deployment still points at the pre-transfer slug
  `HikaruQwQ/GuEarth` and only works through GitHub's transfer redirect — a replacement update
  source must take over the `guearth-updater.isla.fan` domain. Do not add a self-deployed
  update-server implementation to this repository; client-side digest resolution makes one
  unnecessary.
